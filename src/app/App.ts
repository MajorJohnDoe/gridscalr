import type { PDFDocumentProxy } from "pdfjs-dist";
import { CanvasView, type CanvasTestApi } from "../canvas/CanvasView";
import { defaultDrawingExportOptions, type DrawingExportOptions } from "../model/export";
import { layerVisibleOnPage } from "../model/layers";
import { normalizeProjectName } from "../model/projectName";
import { documentPageMaps, totalPageCount } from "../model/documents";
import type { PageSize, Project } from "../model/types";
import {
  relativeDocumentPath,
  serializeProject,
  sourceDocumentPaths,
  updateRelativeDocumentPaths,
} from "../io/projectFile";
import { isTauri, pathExists, readFileText, writeTextFile } from "../io/platform";
import { PdfRenderer } from "../pdf/pdfRenderer";
import { PageThumbnailService } from "../pdf/thumbnails";
import { exportProject } from "./exportFlows";
import type { ExportKind } from "./exportFlows";
import { copyDiagnosticsFlow, reportProblemFlow } from "./diagnosticsFlows";
import {
  loadNewPdf as loadNewPdfFlow,
  loadProjectData as loadProjectDataFlow,
  loadProjectText as loadProjectTextFlow,
  type DocumentFlowHost,
} from "./documentFlows";
import { insertImageFlow as insertImageFlowModule, type ImageFlowHost } from "./imageFlows";
import { packageHost as createPackageHost, type PackageFlowHost } from "./packageFlows";
import { importProjectPagesFlow, type ProjectImportHost } from "./projectImportFlows";
import { RendererDocumentRegistry } from "./rendererDocuments";
import type { ImportedRendererDocument } from "./rendererDocuments";
import {
  deletePageFlow,
  duplicatePageFlow,
  goToPage as goToPageFlow,
  navigateToItem as navigateToItemFlow,
  resetProject as resetProjectFlow,
  type PageFlowHost,
} from "./pageFlows";
import {
  clearCalibrationFlow,
  fitDrawingToArea as fitDrawingFlow,
  openManualScaleFlow,
  setScaleLock as setScaleLockFlow,
  startCalibration as startCalibrationFlow,
} from "./scaleFlows";
import {
  addPageFlow as addPageFlowModule,
  changeSheetPaper,
  createSheetProject as createSheetProjectFlow,
  type SheetFlowHost,
} from "./sheetFlows";
import { SearchController } from "./searchController";
import { ProjectSession } from "./projectSession";
import { createSessionRecovery } from "./recoveryHost";
import {
  copySelection,
  cutSelection,
  pasteSelection,
  setSelectionImageMode,
  setSelectionOpacity,
  duplicateSelection,
  moveSelectionToLayer,
  setSelectionVisible,
  setSelectionLocked,
  setSelectionStrokeWidth,
  setSelectionColor,
  setSelectionCategory,
  setSelectionRoom,
  setSelectionAreaMode,
  setSelectionCountType,
  setSelectionCountQuantity,
  setSelectionLabelSize,
} from "./selectionActions";
import { pasteFromClipboard } from "./clipboardPaste";
import { installPageZoomGuard } from "./pageZoomGuard";
import { describeError } from "../io/platformError";
import { store } from "../state/store";
import { isEditableTarget } from "../ui/dom";
import { TOOL_KEYS } from "../ui/shortcuts";
import { drawingExportDialog } from "../ui/dialogs";
import { renderChrome, renderTopbar, requestMarkupRename, type PanelActions } from "../ui/panels";
import { showSelectionMenuAt } from "../ui/selectionMenu";
import { updateStatus, resetStatusBar } from "../ui/statusBar";
import { createShell, relabelShell, type ShellRefs } from "../ui/shell";
import { openHelp } from "../ui/helpDialog";
import { isMarkupsOpen, setMarkupsOpen } from "../ui/markupsPanel";
import { updatePageSizeLabel } from "../ui/pageList";
import { openQuantitiesDialog } from "../ui/quantityDialog";
import { openSettingsDialog } from "../ui/settingsDialog";
import { openExportMenu, setMenuActions } from "../ui/topMenu";
import { detectPlatform, mountWindowControls, type WindowControls } from "../ui/windowChrome";
import { toggleInspector, toggleSidebar } from "../ui/sidebar";
import { ReferenceController } from "./referenceController";
import {
  openPackageFlow,
  packageProjectFlow,
  showPackageDialogPreview,
} from "../features/projectPackage";
import { toast } from "../ui/toast";
import { loadLayerColorDefaults } from "../io/layerDefaults";
import { logEvent } from "../features/diagnostics/log";
import { writeProjectConditional } from "../features/saveIntegrity";
import type { SessionRecoveryController } from "../features/sessionRecovery";
import { openSheetFieldsDialog } from "../features/schematics/ui/sheetFieldsDialog";
import { openRailDialog } from "../features/schematics/ui/railDialog";
import { openLineTypeDialog } from "../features/schematics/ui/lineTypeDialog";
import { LANGUAGE_CHANGED_EVENT, t } from "../i18n";

interface SizeTask {
  page: number;
  renderer: PdfRenderer;
  epoch: number;
  resolve: (value: PageSize | undefined) => void;
}

export class App {
  private refs: ShellRefs;
  private canvas: CanvasView;
  private reference: ReferenceController;
  private search: SearchController;
  private session: ProjectSession;
  private recovery: SessionRecoveryController;
  private actions: PanelActions;
  private readonly documentRegistry = new RendererDocumentRegistry();
  private renderer: PdfRenderer | null = null;
  private thumbnails: PageThumbnailService | null = null;
  private pageSizes = new Map<number, PageSize>();
  private pageSizePromises = new Map<number, Promise<PageSize | undefined>>();
  private sizeQueue: SizeTask[] = [];
  private sizeActive = 0;
  private sizeEpoch = 0;
  private unsubscribe: () => void;
  private disposed = false;
  private windowControls: WindowControls | null = null;
  private removePageZoomGuard: (() => void) | null = null;

  constructor(root: HTMLElement) {
    loadLayerColorDefaults();
    this.refs = createShell(root);
    this.session = new ProjectSession({
      resetProject: () => resetProjectFlow(this.pageFlowHost()),
      loadNewPdf: (bytes, name, path) => loadNewPdfFlow(this.documentFlowHost(), bytes, name, path),
      loadProjectText: (text, path) => loadProjectTextFlow(this.documentFlowHost(), text, path),
      loadProjectData: (project, path, dirty) =>
        loadProjectDataFlow(this.documentFlowHost(), project, path, dirty),
      createSheetProject: (choice) => createSheetProjectFlow(this.sheetFlowHost(), choice),
    });
    this.recovery = createSessionRecovery(this.session, this.refs.canvasArea, () =>
      this.renderAll(),
    );
    this.actions = {
      openPdf: () => void this.session.openPdfFlow(),
      openProject: () => void this.session.openProjectFlow(),
      importProjectPages: () => void importProjectPagesFlow(this.projectImportHost()),
      newProject: () => void this.session.newProjectFlow(),
      closeProject: () => void this.session.closeProjectFlow(),
      quit: () => void this.session.quitFlow(),
      saveProject: () => void this.session.saveProject(false),
      saveProjectAs: () => void this.session.saveProject(true),
      saveProjectCopy: () => void this.session.saveProjectCopy(),
      backupProject: () => void this.session.backupNowFlow(),
      restoreProjectBackup: () => void this.session.restoreBackupFlow(),
      packageProject: () => void packageProjectFlow(createPackageHost(this.packageFlowHost())),
      openPackage: () => void openPackageFlow(createPackageHost(this.packageFlowHost())),
      exportAs: (kind) => void this.exportAs(kind),
      undo: () => store.undo(),
      redo: () => store.redo(),
      zoomIn: () => {
        this.canvas.zoomBy(1.2);
        this.canvas.invalidate();
      },
      zoomOut: () => {
        this.canvas.zoomBy(1 / 1.2);
        this.canvas.invalidate();
      },
      zoomFit: () => {
        this.canvas.fitPage();
        this.canvas.invalidate();
      },
      zoomActual: () => {
        this.canvas.actualSize();
        this.canvas.invalidate();
      },
      renameSelection: () => requestMarkupRename(this.refs),
      toggleMarkups: () => {
        if (!store.project) return;
        setMarkupsOpen(!isMarkupsOpen());
        this.renderAll();
      },
      toggleSplitView: () => this.reference.toggleSplitView(),
      isSplitViewOpen: () => this.reference.isSplitOpen,
      hasReferenceSession: () => this.reference.hasSession,
      openCompare: () => void this.reference.openCompare(),
      openDrawingReference: () => void this.reference.openDrawingReference(),
      openSearch: () => this.search.open(),
      openQuantities: () => openQuantitiesDialog(this.actions),
      startCalibration: () => startCalibrationFlow(),
      clearCalibration: () => void clearCalibrationFlow(),
      openManualScale: () => void openManualScaleFlow(),
      setScaleLock: (locked) => setScaleLockFlow(locked),
      deleteSelection: () => this.canvas.deleteSelection(),
      editSelectedText: () => this.canvas.editSelectedText(),
      editRail: (itemId) => void openRailDialog(itemId),
      editLineTypes: () => void openLineTypeDialog(),
      fitDrawingToArea: () => fitDrawingFlow(() => this.canvas.invalidate()),
      copySelection: () => copySelection(),
      cutSelection: () => cutSelection(),
      pasteSelection: () => pasteSelection(),
      duplicateSelection: () => duplicateSelection(),
      moveSelectionToLayer: (layerId) => moveSelectionToLayer(layerId),
      setSelectionVisible: (visible) => setSelectionVisible(visible),
      setSelectionLocked: (locked) => setSelectionLocked(locked),
      setSelectionColor: (color) => setSelectionColor(color),
      setSelectionStrokeWidth: (width) => setSelectionStrokeWidth(width),
      deletePage: (page) => void deletePageFlow(this.pageFlowHost(), page),
      duplicatePage: (page) => void duplicatePageFlow(this.pageFlowHost(), page),
      setSelectionCategory: (categoryId) => setSelectionCategory(categoryId),
      setSelectionRoom: (room) => setSelectionRoom(room),
      setSelectionAreaMode: (mode) => setSelectionAreaMode(mode),
      setSelectionLabelSize: (size) => setSelectionLabelSize(size),
      setSelectionCountType: (type) => setSelectionCountType(type),
      setSelectionCountQuantity: (quantity) => setSelectionCountQuantity(quantity),
      insertImage: () => void insertImageFlowModule(this.imageFlowHost()),
      setSelectionImageMode: (mode) => setSelectionImageMode(mode),
      setSelectionOpacity: (opacity) => setSelectionOpacity(opacity),
      goToPage: (page, fit = true) => void goToPageFlow(this.pageFlowHost(), page, fit),
      navigateToItem: (page, layerId, itemId) =>
        void navigateToItemFlow(this.pageFlowHost(), page, layerId, itemId),
      ensurePageSize: (page) => void this.enqueuePageSize(page),
      getPageSize: (page) => this.pageSizes.get(page),
      getPageThumbnail: (page) => this.thumbnails?.get(page) ?? null,
      requestPageThumbnail: (page) => this.thumbnails?.request(page) ?? Promise.resolve(null),
      addPages: () => void addPageFlowModule(this.sheetFlowHost()),
      editSheetFields: (page) =>
        void openSheetFieldsDialog(page, {
          onChangePaper: (paper) => changeSheetPaper(this.sheetFlowHost(), page, paper),
        }),
      refresh: () => this.renderAll(),
      openRecovery: () => void this.recovery.openChooser(),
      getRecoverySummary: () => this.recovery.summary(),
      openRecent: (entry) => void this.session.openRecent(entry),
      openDemoProject: () => void this.session.openDemoProjectFlow(),
      copyDiagnostics: () => void copyDiagnosticsFlow(),
      reportProblem: () => reportProblemFlow(),
    };
    setMenuActions(this.actions);
    this.windowControls = mountWindowControls(this.refs.topbar, {
      quit: () => void this.session.quitFlow(),
    });

    this.canvas = new CanvasView(this.refs.canvasHost, {
      getRenderer: () => this.renderer,
      getPageSize: (page) => this.pageSizes.get(page),
      ensurePageSize: (page) => void this.enqueuePageSize(page),
      onError: (message) => toast(message, "error"),
      onContextMenu: ({ clientX, clientY }) => showSelectionMenuAt(clientX, clientY, this.actions),
    });

    this.search = new SearchController({
      host: this.refs.canvasArea,
      project: () => store.project,
      renderer: () => this.renderer,
      canvas: () => this.canvas,
      enqueuePageSize: (page) => this.enqueuePageSize(page),
      isDisposed: () => this.disposed,
    });

    this.reference = new ReferenceController({
      canvasArea: this.refs.canvasArea,
      referencePaneHost: this.refs.referencePane,
      referenceHost: this.refs.referenceHost,
      splitResizer: this.refs.splitResizer,
      primaryCanvas: this.canvas,
      getRenderer: () => this.renderer,
      getPageSize: (page) => this.pageSizes.get(page),
      ensurePageSize: (page) => this.enqueuePageSize(page),
      requestRender: () => this.renderAll(),
    });

    this.unsubscribe = store.subscribe((reason) => {
      if (this.disposed) return;
      if (reason === "cursor") {
        updateStatus(this.refs, this.actions);
        return;
      }
      if (reason === "view") {
        renderTopbar(this.refs, this.actions);
        updateStatus(this.refs, this.actions);
        this.updateTitle();
        return;
      }
      if (reason === "project") {
        this.documentRegistry.sync(store.project);
        this.search.close();
      }
      if (reason === "undo") {
        const result = this.documentRegistry.reconcile(store.project, this.renderer);
        if (result === "changed") this.afterUndoDocumentChange();
        else if (result === "failed") {
          logEvent("error", "renderer document reconcile failed");
          toast(t("projectImport.undoSyncFailed"), "warning");
        }
      }
      this.reference.onStoreChange(reason);
      this.renderAll();
    });

    this.bind();
    this.renderAll();
    this.recovery.start();
    window.addEventListener(LANGUAGE_CHANGED_EVENT, this.onLanguageChanged);
    void this.session.bindWindowClose();
    void this.bindSmokeTest();
    void this.session.bindLaunchFiles();
    void this.session.setupDragDrop();
  }

  private resetPageSizes(): void {
    this.sizeEpoch++;
    this.pageSizes.clear();
    this.pageSizePromises.clear();
    this.sizeQueue = [];
    this.sizeActive = 0;
  }

  private async destroyRenderer(): Promise<void> {
    const renderer = this.renderer;
    const thumbnails = this.thumbnails;
    this.documentRegistry.dispose(renderer);
    this.renderer = null;
    this.thumbnails = null;
    thumbnails?.destroy();
    if (!renderer) return;
    try {
      await renderer.destroy();
    } catch {
      // The documents may already be closed.
    }
  }

  private pageFlowHost(): PageFlowHost {
    return {
      renderer: () => this.renderer,
      thumbnails: () => this.thumbnails,
      resetPageSizes: () => this.resetPageSizes(),
      enqueuePageSize: (page) => this.enqueuePageSize(page),
      fitPage: () => this.canvas.fitPage(),
      focusItem: (item) => this.canvas.focusItem(item),
      invalidate: () => this.canvas.invalidate(),
      renderAll: () => this.renderAll(),
      closeSearch: () => this.search.close(),
      closeReference: () => this.reference.close(false),
      closeSplitView: () => this.reference.splitView.setOpen(false),
      destroyRenderer: () => this.destroyRenderer(),
    };
  }

  private documentFlowHost(): DocumentFlowHost {
    return {
      closeSearch: () => this.search.close(),
      confirmReplace: (message) => this.session.confirmUnsavedChanges(message),
      rendererBusy: () => this.renderer?.busy ?? false,
      installDocuments: (documents, project, path, dirty) =>
        this.installDocuments(documents, project, path, dirty),
      addDocumentToRenderer: (document, pages) => this.renderer?.addDocument(document, pages),
      enqueuePageSize: (page) => this.enqueuePageSize(page),
      fitPage: () => this.canvas.fitPage(),
      invalidate: () => this.canvas.invalidate(),
    };
  }

  private projectImportHost(): ProjectImportHost {
    return {
      renderer: () => this.renderer,
      rendererBusy: () => this.renderer?.busy ?? false,
      enqueuePageSize: (page) => this.enqueuePageSize(page),
      resetPageSizes: () => this.resetPageSizes(),
      fitPage: () => this.canvas.fitPage(),
      invalidate: () => this.canvas.invalidate(),
      renderAll: () => this.renderAll(),
      addImportedDocuments: (entries) => this.addImportedDocuments(entries),
      closeSearch: () => this.search.close(),
    };
  }

  private sheetFlowHost(): SheetFlowHost {
    return {
      renderer: () => this.renderer,
      thumbnails: () => this.thumbnails,
      installDocuments: (documents, project, path, dirty) =>
        this.installDocuments(documents, project, path, dirty),
      enqueuePageSize: (page) => this.enqueuePageSize(page),
      resetPageSize: () => this.resetPageSizes(),
      fitPage: () => this.canvas.fitPage(),
      invalidate: () => this.canvas.invalidate(),
      openPdfFlow: () => this.session.openPdfFlow(),
    };
  }

  private imageFlowHost(): ImageFlowHost {
    return { enqueuePageSize: (page) => this.enqueuePageSize(page) };
  }

  private packageFlowHost(): PackageFlowHost {
    return {
      confirmDiscard: (message) => this.session.confirmUnsavedChanges(message),
      loadProjectData: (project, path, dirty) =>
        loadProjectDataFlow(this.documentFlowHost(), project, path, dirty),
      renderer: () => this.renderer,
    };
  }

  private readonly onLanguageChanged = (): void => {
    relabelShell(this.refs);
    resetStatusBar();
    this.renderAll();
    this.canvas.invalidate();
    this.reference.onStoreChange("view");
    this.reference.view.invalidate();
  };

  private renderAll(): void {
    renderChrome(this.refs, this.actions);
    this.updateTitle();
  }

  private updateTitle(): void {
    document.title = store.project ? `GridScalr — ${store.project.name}` : "GridScalr";
  }

  private bind(): void {
    const refs = this.refs;
    refs.undoBtn.addEventListener("click", () => store.undo());
    refs.redoBtn.addEventListener("click", () => store.redo());
    refs.markupsBtn.addEventListener("click", () => this.actions.toggleMarkups());
    refs.zoomOutBtn.addEventListener("click", () => this.canvas.zoomBy(1 / 1.2));
    refs.zoomInBtn.addEventListener("click", () => this.canvas.zoomBy(1.2));
    refs.zoomFitBtn.addEventListener("click", () => {
      this.canvas.fitPage();
      this.canvas.invalidate();
    });
    refs.zoomActualBtn.addEventListener("click", () => {
      this.canvas.actualSize();
      this.canvas.invalidate();
    });
    refs.zoomReadout.addEventListener("click", () => {
      this.canvas.setZoom(1);
      this.canvas.invalidate();
    });

    refs.pagePrevBtn.addEventListener(
      "click",
      () => void goToPageFlow(this.pageFlowHost(), store.ui.page - 1, true),
    );
    refs.pageNextBtn.addEventListener(
      "click",
      () => void goToPageFlow(this.pageFlowHost(), store.ui.page + 1, true),
    );
    refs.pageInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const page = Number(refs.pageInput.value);
        if (Number.isFinite(page)) void goToPageFlow(this.pageFlowHost(), page, true);
        refs.pageInput.blur();
      }
      event.stopPropagation();
    });
    refs.pageInput.addEventListener("focus", () => refs.pageInput.select());
    refs.projectName.addEventListener("dblclick", () => this.beginProjectRename());

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onWindowBlur);
    window.addEventListener("paste", this.onPaste);
    this.removePageZoomGuard = installPageZoomGuard();
  }

  private onWindowBlur = (): void => {
    this.canvas.setSpaceDown(false);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === "Space") this.canvas.setSpaceDown(false);
  };

  private onPaste = (event: ClipboardEvent): void => {
    if (this.disposed) return;
    void pasteFromClipboard(this.imageFlowHost(), event);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.disposed) return;
    if (document.querySelector(".modal-backdrop")) return;
    if (isEditableTarget(event.target)) return;
    if (this.canvas.isCropping && event.key !== "Escape" && event.key !== "Enter") return;

    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (mod) {
      if (event.altKey && event.code === "KeyQ") {
        event.preventDefault();
        openQuantitiesDialog(this.actions);
        return;
      }
      if (event.shiftKey && event.code === "Digit2") {
        event.preventDefault();
        this.actions.toggleSplitView();
        return;
      }
      if (event.shiftKey && event.code === "KeyF") {
        event.preventDefault();
        this.search.open();
        return;
      }
      switch (key) {
        case "z":
          event.preventDefault();
          if (event.shiftKey) store.redo();
          else store.undo();
          return;
        case "y":
          event.preventDefault();
          store.redo();
          return;
        case "n":
          event.preventDefault();
          void this.session.newProjectFlow();
          return;
        case "q":
          event.preventDefault();
          if (!event.altKey && !event.shiftKey) void this.session.quitFlow();
          return;
        case "l":
          event.preventDefault();
          this.actions.toggleMarkups();
          return;
        case "d":
          event.preventDefault();
          duplicateSelection();
          return;
        case ",":
          event.preventDefault();
          openSettingsDialog();
          return;
        case "\\":
        case "|":
          event.preventDefault();
          if (event.shiftKey) toggleInspector();
          else toggleSidebar();
          return;
        case "s":
          event.preventDefault();
          void this.session.saveProject(event.shiftKey);
          return;
        case "c":
          event.preventDefault();
          copySelection();
          return;
        case "x":
          event.preventDefault();
          cutSelection();
          return;
        case "o":
          event.preventDefault();
          if (event.shiftKey) void this.session.openProjectFlow();
          else void this.session.openPdfFlow();
          return;
        case "e":
          event.preventDefault();
          openExportMenu();
          return;
        case "0":
          event.preventDefault();
          this.canvas.fitPage();
          this.canvas.invalidate();
          return;
        case "1":
          event.preventDefault();
          this.canvas.actualSize();
          this.canvas.invalidate();
          return;
        case "=":
        case "+":
          event.preventDefault();
          this.canvas.zoomBy(1.2);
          return;
        case "-":
          event.preventDefault();
          this.canvas.zoomBy(1 / 1.2);
          return;
        default:
          return;
      }
    }

    if (event.altKey) return;

    if (event.key === "F1") {
      event.preventDefault();
      openHelp("guide");
      return;
    }

    if (event.key === "?") {
      event.preventDefault();
      openHelp("shortcuts");
      return;
    }

    if (event.key === "F2") {
      event.preventDefault();
      if (store.ui.selection.length === 1) requestMarkupRename(this.refs);
      else this.beginProjectRename();
      return;
    }

    if (event.code === "Space") {
      if (event.repeat) return;
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      this.canvas.setSpaceDown(true);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (this.canvas.isBusy) {
        this.canvas.cancelDraft();
      } else if (store.ui.selection.length) {
        store.clearSelection();
      } else if (store.ui.activeTool !== "select") {
        store.setTool("select");
      }
      return;
    }

    if (event.key === "Enter") {
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      this.canvas.finishDraft();
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (!this.canvas.removeLastPoint()) this.canvas.deleteSelection();
      return;
    }

    if (event.key === "PageDown") {
      event.preventDefault();
      void goToPageFlow(this.pageFlowHost(), store.ui.page + 1, true);
      return;
    }
    if (event.key === "PageUp") {
      event.preventDefault();
      void goToPageFlow(this.pageFlowHost(), store.ui.page - 1, true);
      return;
    }

    if (event.key.startsWith("Arrow") && store.ui.selection.length) {
      event.preventDefault();
      const step = (event.shiftKey ? 10 : 1) / store.ui.zoom;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      this.canvas.nudgeSelection(dx, dy);
      return;
    }

    if (!store.project) return;
    const combo = `${event.shiftKey ? "shift+" : ""}${key}`;
    const tool = TOOL_KEYS[combo] ?? (event.shiftKey ? undefined : TOOL_KEYS[key]);
    if (tool) {
      event.preventDefault();
      store.setTool(tool);
      return;
    }
  };

  /** Static template bytes are immutable per template, paper and language. */
  /**
   * Asks which pages of a picked PDF or TIF should join the project. Single-page
   * files skip the picker; previews come from a temporary service so they never
   * interfere with the project's cached Pages-panel thumbnails.
   */

  private async installDocuments(
    documents: PDFDocumentProxy[],
    project: Project,
    projectPath: string | null,
    dirty: boolean,
  ): Promise<void> {
    const previous = this.renderer;
    const previousThumbnails = this.thumbnails;
    this.documentRegistry.reset(project, previous);
    const renderer = new PdfRenderer(documents, documentPageMaps(project.documents));
    this.renderer = renderer;
    this.thumbnails = new PageThumbnailService(
      async (page) => {
        const canvas = await renderer.renderPageThumbnail(page, 256);
        return canvas.toDataURL("image/jpeg", 0.78);
      },
      () => renderer.busy,
    );
    previousThumbnails?.destroy();
    this.sizeEpoch++;
    this.pageSizes.clear();
    this.pageSizePromises.clear();
    this.sizeQueue = [];
    if (previous) {
      try {
        await previous.destroy();
      } catch {
        // The old documents may already be closed.
      }
    }
    project.documents.forEach((documentRef, index) => {
      const document = documents[index];
      if (document) documentRef.pageCount = document.numPages;
      if (projectPath && documentRef.path && documentRef.kind === "pdf") {
        documentRef.relativePath = relativeDocumentPath(projectPath, documentRef.path);
      }
    });
    store.setProject(project, projectPath, dirty);
    await this.enqueuePageSize(1);
    this.canvas.invalidate();
    this.canvas.fitPage();
  }

  private addImportedDocuments(entries: readonly ImportedRendererDocument[]): void {
    const renderer = this.renderer;
    const project = store.project;
    if (!renderer || !project) return;
    this.documentRegistry.addImported(entries, project, renderer);
    this.thumbnails?.clear();
    this.resetPageSizes();
  }

  private afterUndoDocumentChange(): void {
    this.search.close();
    void this.reference.close(false);
    this.reference.splitView.setOpen(false);
    this.thumbnails?.clear();
    this.resetPageSizes();
    void this.enqueuePageSize(store.ui.page);
    this.canvas.invalidate();
  }

  private enqueuePageSize(page: number): Promise<PageSize | undefined> {
    const existing = this.pageSizes.get(page);
    if (existing) return Promise.resolve(existing);
    const pending = this.pageSizePromises.get(page);
    if (pending) return pending;
    const renderer = this.renderer;
    if (!renderer) return Promise.resolve(undefined);
    const epoch = this.sizeEpoch;
    const promise = new Promise<PageSize | undefined>((resolve) => {
      this.sizeQueue.push({ page, renderer, epoch, resolve });
      this.pumpSizeQueue();
    }).finally(() => {
      this.pageSizePromises.delete(page);
    });
    this.pageSizePromises.set(page, promise);
    return promise;
  }

  private pumpSizeQueue(): void {
    while (this.sizeActive < 3 && this.sizeQueue.length) {
      const task = this.sizeQueue.shift();
      if (!task) break;
      this.sizeActive++;
      void (async () => {
        try {
          if (task.epoch !== this.sizeEpoch || task.renderer !== this.renderer) {
            task.resolve(undefined);
            return;
          }
          const size = await task.renderer.getPageSize(task.page);
          if (task.epoch === this.sizeEpoch) {
            this.pageSizes.set(task.page, size);
            this.canvas.invalidate();
            updatePageSizeLabel(this.refs, task.page, size);
          }
          task.resolve(size);
        } catch {
          task.resolve(undefined);
        } finally {
          this.sizeActive--;
          this.pumpSizeQueue();
        }
      })();
    }
  }

  /**
   * Writes a backup copy without changing the open project's path or its saved
   * state. Document links in the copy are relative to the copy's folder so the
   * backup stays usable if the original project is moved or replaced.
   */

  /** Opens the package options dialog for documentation screenshots. */
  openPackageDialogForDocs(): void {
    if (!store.project) return;
    showPackageDialogPreview(store.project);
  }

  private beginProjectRename(): void {
    const project = store.project;
    const name = this.refs.projectName;
    if (!project || name.isContentEditable) return;
    const original = project.name;
    let finished = false;
    const finish = (commit: boolean) => {
      if (finished) return;
      finished = true;
      name.contentEditable = "false";
      name.classList.remove("is-editing");
      name.removeEventListener("keydown", onKey);
      name.removeEventListener("blur", onBlur);
      const value = normalizeProjectName(name.textContent ?? "", original);
      if (!commit || value === original) {
        name.textContent = original;
        return;
      }
      store.mutate((current) => {
        current.name = value;
      }, "change");
    };
    const onBlur = () => finish(true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }
    };
    name.contentEditable = "plaintext-only";
    name.classList.add("is-editing");
    name.textContent = original;
    name.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(name);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    name.addEventListener("keydown", onKey);
    name.addEventListener("blur", onBlur);
  }

  private async chooseDrawingExport(project: Project): Promise<DrawingExportOptions | null> {
    let options = defaultDrawingExportOptions(project, store.ui.page);
    let initialAreaMode: "whole" | "crop" | undefined;
    let cropReferencePage = store.ui.page;
    for (;;) {
      const pageCount = totalPageCount(project.documents);
      const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
      const result = await drawingExportDialog({
        currentPage: store.ui.page,
        pageCount,
        layers: project.layers.map((layer) => ({
          id: layer.id,
          name: layer.name,
          kind: layer.kind,
          visible: pageNumbers.some((page) => layerVisibleOnPage(layer, page)),
          color: layer.color,
        })),
        initial: options,
        initialAreaMode,
        cropReferencePage,
      });
      if (!result) return null;
      options = result.options;
      if (result.action === "export") return options;

      initialAreaMode = "crop";
      const crop = await this.canvas.pickExportCrop(options.crop);
      if (crop) {
        options = { ...options, crop };
        cropReferencePage = store.ui.page;
      }
    }
  }

  private async exportAs(kind: ExportKind): Promise<void> {
    const project = store.project;
    if (!project) return;
    await exportProject(kind, {
      project,
      projectPath: store.projectPath,
      renderer: this.renderer,
      canvas: this.canvas,
      chooseDrawingExport: (target) => this.chooseDrawingExport(target),
    });
  }

  /**
   * Copies the bundled demo into the app data folder and opens it from there,
   * so the demo can be measured, edited and saved without touching the
   * installation directory or the bundled fixture.
   */

  /**
   * Packaged smoke test used by CI on all three platforms. The app runs the
   * real open/save/reopen/close flows against its own bundled demo, writes a
   * JSON report next to the requested directory and exits with the result.
   */
  private async bindSmokeTest(): Promise<void> {
    if (!isTauri) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const directory = await invoke<string | null>("smoke_test_dir");
      if (directory) await this.runSmokeTest(directory);
    } catch (error) {
      logEvent("error", `smoke test failed: ${errorMessage(error)}`);
    }
  }

  private async runSmokeTest(directory: string): Promise<void> {
    const base = directory.replace(/[\\/]+$/, "");
    const savePath = `${base}/smoke.gridscalr`;
    const resultPath = `${base}/result.json`;
    const steps: Array<{ name: string; ok: boolean; detail?: string }> = [];
    const record = (name: string, ok: boolean, detail?: string) => {
      steps.push(detail ? { name, ok, detail } : { name, ok });
    };

    try {
      await this.session.openDemoProjectFlow();
      record("demo opened", Boolean(store.project && store.project.documents.length > 0));

      await this.saveProjectToPath(savePath);
      record("project saved", await pathExists(savePath));

      const text = await readFileText(savePath);
      await loadProjectTextFlow(this.documentFlowHost(), text, savePath);
      record("project reopened", store.projectPath === savePath);

      store.mutate((project) => {
        project.settings.showGrid = !project.settings.showGrid;
      }, "change");
      const pending = this.session.confirmUnsavedChanges("smoke test close prompt");
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      const cancel = [...document.querySelectorAll<HTMLButtonElement>(".modal-footer button")].find(
        (button) => button.textContent === "Cancel",
      );
      record("unsaved prompt shown", Boolean(cancel));
      cancel?.click();
      record("cancel keeps project", (await pending) === false);
    } catch (error) {
      record("exception", false, errorMessage(error));
    }

    const report = {
      ok: steps.every((step) => step.ok),
      version: __APP_VERSION__,
      platform: detectPlatform(),
      steps,
    };
    try {
      await writeTextFile(resultPath, JSON.stringify(report, null, 2));
    } catch (error) {
      report.ok = false;
      logEvent("error", `smoke report failed: ${errorMessage(error)}`);
    }
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("finish_smoke_test", { code: report.ok ? 0 : 1 });
  }

  /** Writes the open project to a known path exactly like Save, without a dialog. */
  private async saveProjectToPath(path: string): Promise<void> {
    const project = store.project;
    if (!project) throw new Error("no-open-project");
    const protectedPaths = sourceDocumentPaths(project, store.projectPath);
    updateRelativeDocumentPaths(project, path);
    store.fileStamp = await writeProjectConditional(
      path,
      serializeProject(project),
      null,
      protectedPaths,
    );
    store.markSaved(path);
  }

  /** Version, platform and anonymised project statistics for a bug report. */
  /**
   * Consumes files handed over by the operating system: start arguments, a
   * Finder open event, or a second launch that the single-instance callback
   * forwarded. Only the first supported path opens; GridScalr keeps one project
   * per window.
   */

  addPageFlow(): void {
    void addPageFlowModule(this.sheetFlowHost());
  }

  /** Dev-only test bridge consumed by the Playwright suite. */
  getCanvasTestApi(): CanvasTestApi {
    return this.canvas.getTestApi();
  }

  dispose(): void {
    this.disposed = true;
    this.recovery.dispose();
    this.unsubscribe();
    window.removeEventListener(LANGUAGE_CHANGED_EVENT, this.onLanguageChanged);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onWindowBlur);
    window.removeEventListener("paste", this.onPaste);
    this.removePageZoomGuard?.();
    this.removePageZoomGuard = null;
    this.session.dispose();
    this.windowControls?.dispose();
    this.windowControls = null;
    this.thumbnails?.destroy();
    this.thumbnails = null;
    this.search.dispose();
    this.reference.dispose();
    this.canvas.destroy();
    if (this.renderer) void this.renderer.destroy();
  }
}

function errorMessage(error: unknown): string {
  return describeError(error);
}
