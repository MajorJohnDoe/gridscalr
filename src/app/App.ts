import type { PDFDocumentProxy } from "pdfjs-dist";
import { CanvasView, type CanvasTestApi } from "../canvas/CanvasView";
import {
  clearPageCalibration,
  createManualCalibration,
  pageCalibration,
  pageScaleLocked,
  setPageCalibration,
  setPageScaleLocked,
} from "../model/calibration";
import { copyItems, duplicateItems, hasClipboard, pasteItems } from "../model/clipboard";
import {
  deleteItems,
  emptyItemCommandResult,
  setItemsColor,
  setItemsImageMode,
  setItemsLocked,
  setItemsOpacity,
  setItemsStrokeWidth,
  setItemsVisible,
} from "../model/commands";
import { defaultDrawingExportOptions, type DrawingExportOptions } from "../model/export";
import {
  addItem,
  createProject,
  findItem,
  isMeasurementKind,
  itemIsLocked,
  layerLockedOnPage,
  layerVisibleOnPage,
  moveItemsToLayer,
} from "../model/layers";
import { makeId } from "../model/calibration";
import { normalizeProjectName } from "../model/projectName";
import { createImageItem } from "../model/images";
import {
  documentIndexForPage,
  documentPageMaps,
  excludedSourcePages,
  pageDisplayName,
  projectDocumentForPage,
  totalPageCount,
} from "../model/documents";
import { base64ToBytes } from "../io/base64";
import { isTiff } from "../io/tiff";
import { applyMeasurementBulkEdit } from "../model/bulkEdit";
import type { MeasurementBulkPatch, MeasurementBulkResult } from "../model/bulkEdit";
import { resolveSelection } from "../model/selection";
import { SCHEMA_VERSION } from "../model/types";
import type {
  AreaMode,
  CountType,
  DocumentRef,
  ImageAsset,
  ImageMode,
  Layer,
  PageSize,
  Project,
  RecentEntry,
  SelectionRef,
  SheetPaperSize,
  SheetTemplateRef,
} from "../model/types";
import {
  parseProject,
  relativeDocumentPath,
  resolveRelativePath,
  serializeProject,
  serializeProjectCopy,
  sourceDocumentPaths,
  suggestedProjectName,
  updateRelativeDocumentPaths,
} from "../io/projectFile";
import {
  addRecent,
  basename,
  chooseSavePath,
  isTauri,
  pathExists,
  pickImage,
  pickPdf,
  pickProject,
  pickDrawing,
  readFileBytes,
  readFileText,
  saveTextFile,
  sha256Hex,
  writeTextFile,
} from "../io/platform";
import { assertWritablePath } from "../io/writeGuard";
import {
  loadPdfDocument,
  PasswordRequiredError,
  PdfPasswordError,
  PdfRenderer,
  renderPagePreview,
} from "../pdf/pdfRenderer";
import { PageThumbnailService } from "../pdf/thumbnails";
import { exportProject } from "./exportFlows";
import type { ExportKind } from "./exportFlows";
import { ingestImageBlob, isSupportedImageFile } from "../io/imageIngest";
import { describeError } from "../io/platformError";
import { store } from "../state/store";
import { isEditableTarget } from "../ui/dom";
import { TOOL_KEYS } from "../ui/shortcuts";
import {
  confirmDialog,
  drawingExportDialog,
  manualScaleDialog,
  messageDialog,
  passwordDialog,
  unsavedChangesDialog,
} from "../ui/dialogs";
import { renderChrome, renderTopbar, requestMarkupRename, type PanelActions } from "../ui/panels";
import { showSelectionMenuAt } from "../ui/selectionMenu";
import { updateStatus, resetStatusBar } from "../ui/statusBar";
import { createShell, relabelShell, type ShellRefs } from "../ui/shell";
import { openHelp } from "../ui/helpDialog";
import { isMarkupsOpen, setMarkupsOpen } from "../ui/markupsPanel";
import { duplicatePageDialog } from "../ui/duplicatePageDialog";
import { pageImportDialog } from "../ui/pageImportDialog";
import { updatePageSizeLabel } from "../ui/pageList";
import { openQuantitiesDialog } from "../ui/quantityDialog";
import { openSettingsDialog } from "../ui/settingsDialog";
import { openExportMenu, setMenuActions } from "../ui/topMenu";
import { detectPlatform, mountWindowControls, type WindowControls } from "../ui/windowChrome";
import { toggleInspector, toggleSidebar } from "../ui/sidebar";
import { SearchPanel } from "../ui/searchPanel";
import { PdfTextIndex, type SearchHit } from "../search/textIndex";
import { disposeOcrWorker, isOcrCurrent, ocrPageToText, runOcrPage } from "../search/ocr";
import { ReferenceController } from "./referenceController";
import {
  openPackageFlow,
  packageProjectFlow,
  showPackageDialogPreview,
  type PackageHost,
} from "../features/projectPackage";
import { validatePackagedProjectJson } from "../features/projectPackage/model";
import { toast } from "../ui/toast";
import { loadGlobalStampPresets } from "../io/stampDefaults";
import { loadLayerColorDefaults } from "../io/layerDefaults";
import { classifyLaunchPath, firstLaunchPath } from "../features/launch/model";
import { buildDiagnostics, projectStats } from "../features/diagnostics/model";
import { logEvent, readDiagnosticsLog } from "../features/diagnostics/log";
import { copyDiagnostics, reportProblemDialog } from "../ui/diagnosticsDialog";
import {
  DEFAULT_SHEET_TEMPLATE_ID,
  resolveSheetLabels,
  sheetTemplateFor,
  type SheetLabels,
} from "../features/schematics/model/sheetTemplate";
import { buildStaticSheetPdf } from "../features/schematics/render/sheetPdf";
import {
  createTemplateDocument,
  prefillSheetFields,
  templateSheetCount,
} from "../features/schematics/model/sheetDocument";
import {
  chooseProjectSource,
  type SheetSourceChoice,
} from "../features/schematics/ui/sheetSourceDialog";
import { openSheetFieldsDialog } from "../features/schematics/ui/sheetFieldsDialog";
import { openRailDialog } from "../features/schematics/ui/railDialog";
import { openLineTypeDialog } from "../features/schematics/ui/lineTypeDialog";
import { canFitDrawingToArea, fitDrawingToArea } from "../features/schematics/model/fitDrawing";
import { LANGUAGE_CHANGED_EVENT, currentLocale, t } from "../i18n";

function projectFilters() {
  return [{ name: t("app.projectFilter"), extensions: ["gridscalr"] }];
}

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
  private textIndex: PdfTextIndex | null = null;
  private searchPanel: SearchPanel | null = null;
  private searchQuery = "";
  private searchDebounce: number | null = null;
  private ocrBusy = false;
  private ocrToken = 0;
  private actions: PanelActions;
  private renderer: PdfRenderer | null = null;
  private thumbnails: PageThumbnailService | null = null;
  private pageSizes = new Map<number, PageSize>();
  private pageSizePromises = new Map<number, Promise<PageSize | undefined>>();
  private sizeQueue: SizeTask[] = [];
  private sizeActive = 0;
  private sizeEpoch = 0;
  private unsubscribe: () => void;
  private disposed = false;
  private closeInProgress = false;
  private unlistenClose: (() => void) | null = null;
  private unlistenLaunch: (() => void) | null = null;
  private windowControls: WindowControls | null = null;
  private autosaveWarned: string | null = null;
  private sheetBytesCache = new Map<string, Promise<Uint8Array>>();

  constructor(root: HTMLElement) {
    loadLayerColorDefaults();
    this.refs = createShell(root);
    this.actions = {
      openPdf: () => void this.openPdfFlow(),
      openProject: () => void this.openProjectFlow(),
      newProject: () => void this.newProjectFlow(),
      closeProject: () => void this.closeProjectFlow(),
      quit: () => void this.quitFlow(),
      saveProject: () => void this.saveProjectFlow(false),
      saveProjectAs: () => void this.saveProjectFlow(true),
      saveProjectCopy: () => void this.saveProjectCopyFlow(),
      packageProject: () => void packageProjectFlow(this.packageHost()),
      openPackage: () => void openPackageFlow(this.packageHost()),
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
      openSearch: () => this.openSearchFlow(),
      openQuantities: () => openQuantitiesDialog(this.actions),
      startCalibration: () => this.startCalibration(),
      clearCalibration: () => void this.clearCalibrationFlow(),
      openManualScale: () => void this.openManualScaleFlow(),
      setScaleLock: (locked) => this.setScaleLock(locked),
      deleteSelection: () => this.canvas.deleteSelection(),
      editSelectedText: () => this.canvas.editSelectedText(),
      editRail: (itemId) => void openRailDialog(itemId),
      editLineTypes: () => void openLineTypeDialog(),
      fitDrawingToArea: () => this.fitDrawingToArea(),
      copySelection: () => this.copySelection(),
      cutSelection: () => this.cutSelection(),
      pasteSelection: () => this.pasteSelection(),
      duplicateSelection: () => this.duplicateSelection(),
      moveSelectionToLayer: (layerId) => this.moveSelectionToLayer(layerId),
      setSelectionVisible: (visible) => this.setSelectionVisible(visible),
      setSelectionLocked: (locked) => this.setSelectionLocked(locked),
      setSelectionColor: (color) => this.setSelectionColor(color),
      setSelectionStrokeWidth: (width) => this.setSelectionStrokeWidth(width),
      deletePage: (page) => void this.deletePageFlow(page),
      duplicatePage: (page) => void this.duplicatePageFlow(page),
      setSelectionCategory: (categoryId) => this.setSelectionCategory(categoryId),
      setSelectionRoom: (room) => this.setSelectionRoom(room),
      setSelectionAreaMode: (mode) => this.setSelectionAreaMode(mode),
      setSelectionLabelSize: (size) => this.setSelectionLabelSize(size),
      setSelectionCountType: (type) => this.setSelectionCountType(type),
      setSelectionCountQuantity: (quantity) => this.setSelectionCountQuantity(quantity),
      insertImage: () => void this.insertImageFlow(),
      setSelectionImageMode: (mode) => this.setSelectionImageMode(mode),
      setSelectionOpacity: (opacity) => this.setSelectionOpacity(opacity),
      goToPage: (page, fit = true) => void this.goToPage(page, fit),
      navigateToItem: (page, layerId, itemId) => void this.navigateToItem(page, layerId, itemId),
      ensurePageSize: (page) => void this.enqueuePageSize(page),
      getPageSize: (page) => this.pageSizes.get(page),
      getPageThumbnail: (page) => this.thumbnails?.get(page) ?? null,
      requestPageThumbnail: (page) => this.thumbnails?.request(page) ?? Promise.resolve(null),
      addPages: () => void this.addPageFlow(),
      editSheetFields: (page) =>
        void openSheetFieldsDialog(page, {
          onChangePaper: (paper) => this.changeSheetPaper(page, paper),
        }),
      refresh: () => this.renderAll(),
      restoreAutosave: () => void this.restoreAutosave(),
      getAutosave: () => store.readAutosavePreview(),
      openRecent: (entry) => void this.openRecent(entry),
      openDemoProject: () => void this.openDemoProjectFlow(),
      copyDiagnostics: () => void this.copyDiagnosticsFlow(),
      reportProblem: () => this.reportProblemFlow(),
    };
    setMenuActions(this.actions);
    this.windowControls = mountWindowControls(this.refs.topbar, {
      quit: () => void this.quitFlow(),
    });

    this.canvas = new CanvasView(this.refs.canvasHost, {
      getRenderer: () => this.renderer,
      getPageSize: (page) => this.pageSizes.get(page),
      ensurePageSize: (page) => void this.enqueuePageSize(page),
      onError: (message) => toast(message, "error"),
      onContextMenu: ({ clientX, clientY }) => showSelectionMenuAt(clientX, clientY, this.actions),
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
      if (reason === "save") {
        const autosaveError = store.autosaveError;
        if (autosaveError && autosaveError.message !== this.autosaveWarned) {
          this.autosaveWarned = autosaveError.message;
          toast(autosaveError.message, "warning", autosaveError.quotaExceeded ? 10000 : 7000);
          logEvent("warn", `autosave failed: ${autosaveError.message}`);
        }
        if (!autosaveError) this.autosaveWarned = null;
      }
      if (reason === "project" && this.searchPanel) this.closeSearch();
      this.reference.onStoreChange(reason);
      this.renderAll();
    });

    this.bind();
    this.renderAll();
    window.addEventListener(LANGUAGE_CHANGED_EVENT, this.onLanguageChanged);
    void this.bindWindowClose();
    void this.bindSmokeTest();
    void this.bindLaunchFiles();
    void this.setupDragDrop();
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

    refs.pagePrevBtn.addEventListener("click", () => void this.goToPage(store.ui.page - 1, true));
    refs.pageNextBtn.addEventListener("click", () => void this.goToPage(store.ui.page + 1, true));
    refs.pageInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const page = Number(refs.pageInput.value);
        if (Number.isFinite(page)) void this.goToPage(page, true);
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
  }

  private onWindowBlur = (): void => {
    this.canvas.setSpaceDown(false);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === "Space") this.canvas.setSpaceDown(false);
  };

  private onPaste = (event: ClipboardEvent): void => {
    if (this.disposed || !store.project) return;
    if (document.querySelector(".modal-backdrop")) return;
    if (isEditableTarget(event.target)) return;
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    let image = Array.from(clipboard.files).find(isSupportedImageFile) ?? null;
    if (!image) {
      for (const item of Array.from(clipboard.items)) {
        if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (file && isSupportedImageFile(file)) {
          image = file;
          break;
        }
      }
    }
    if (image) {
      event.preventDefault();
      void this.insertImageFile(image);
      return;
    }
    if (hasClipboard(store.project)) {
      event.preventDefault();
      this.pasteSelection();
    }
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
        this.openSearchFlow();
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
          void this.newProjectFlow();
          return;
        case "q":
          event.preventDefault();
          if (!event.altKey && !event.shiftKey) void this.quitFlow();
          return;
        case "l":
          event.preventDefault();
          this.actions.toggleMarkups();
          return;
        case "d":
          event.preventDefault();
          this.duplicateSelection();
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
          void this.saveProjectFlow(event.shiftKey);
          return;
        case "c":
          event.preventDefault();
          this.copySelection();
          return;
        case "x":
          event.preventDefault();
          this.cutSelection();
          return;
        case "o":
          event.preventDefault();
          if (event.shiftKey) void this.openProjectFlow();
          else void this.openPdfFlow();
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
      void this.goToPage(store.ui.page + 1, true);
      return;
    }
    if (event.key === "PageUp") {
      event.preventDefault();
      void this.goToPage(store.ui.page - 1, true);
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

  private startCalibration(): void {
    if (!store.project) return;
    const page = store.ui.page;
    if (pageScaleLocked(store.project, page)) {
      toast(t("app.scaleLockedCalibrate"), "warning");
      return;
    }
    store.setTool("calibrate");
    toast(t("app.calibrationHint"), "info");
  }

  private async openManualScaleFlow(): Promise<void> {
    const project = store.project;
    if (!project) return;
    const page = store.ui.page;
    if (pageScaleLocked(project, page)) {
      toast(t("app.scaleLockedManual"), "warning");
      return;
    }
    const current = pageCalibration(project, page);
    const hasMeasurements = project.layers.some(
      (layer) => layer.kind === "measure" && layer.items.length > 0,
    );
    const result = await manualScaleDialog({
      currentPage: page,
      pageCount: totalPageCount(project.documents),
      hasMeasurements,
      initialRatio: current?.source === "manual" ? current.ratio : undefined,
    });
    if (!result) return;
    const calibration = createManualCalibration(result.ratio);
    let changed: number[] = [];
    store.mutate((project) => {
      changed = setPageCalibration(project, page, calibration, {
        applyToAll: result.applyToAll,
        updateMeasurements: result.updateMeasurements,
        pageCount: totalPageCount(project.documents),
      });
    }, "change");
    if (!changed.length) {
      toast(t("app.noUnlockedPages"), "warning");
      return;
    }
    const lockedSkipped = result.applyToAll
      ? totalPageCount(project.documents) - changed.length
      : 0;
    const manualScale =
      changed.length === 1
        ? t("app.manualScaleSetOne", { ratio: calibration.ratio, page: changed[0] })
        : t("app.manualScaleSetMany", { ratio: calibration.ratio, count: changed.length });
    const lockedSuffix =
      lockedSkipped > 0 ? t("app.manualScaleLockedSuffix", { count: lockedSkipped }) : "";
    toast(`${manualScale}${lockedSuffix}`, "success");
  }

  private setScaleLock(locked: boolean): void {
    const project = store.project;
    if (!project) return;
    const page = store.ui.page;
    if (!pageCalibration(project, page)) {
      toast(t("app.setScaleBeforeLock"), "warning");
      return;
    }
    store.mutate((project) => {
      setPageScaleLocked(project, page, locked);
    }, "change");
    toast(
      locked ? t("app.scaleLockedOn", { page }) : t("app.scaleUnlockedOn", { page }),
      locked ? "success" : "info",
    );
  }

  private fitDrawingToArea(): void {
    const project = store.project;
    const page = store.ui.page;
    if (!project || !canFitDrawingToArea(project, page)) {
      toast(t("context.fitDrawingNothing"), "info");
      return;
    }
    let moved = false;
    store.mutate((current) => {
      moved = fitDrawingToArea(current, page);
    }, "change");
    if (moved) {
      toast(t("context.fitDrawingDone"), "success");
      this.canvas.invalidate();
    } else {
      toast(t("context.fitDrawingNothing"), "info");
    }
  }

  private async clearCalibrationFlow(): Promise<void> {
    const project = store.project;
    if (!project) return;
    const page = store.ui.page;
    if (!pageCalibration(project, page)) return;
    if (pageScaleLocked(project, page)) {
      toast(t("app.scaleLockedClear"), "warning");
      return;
    }
    const confirmed = await confirmDialog(
      t("app.clearScaleTitle"),
      t("app.clearScaleMessage", { page }),
      t("app.clearScaleTitle"),
      { danger: true },
    );
    if (!confirmed) return;
    let cleared = false;
    store.mutate((project) => {
      cleared = clearPageCalibration(project, page);
    }, "change");
    toast(
      cleared ? t("app.scaleCleared") : t("app.scaleClearFailed"),
      cleared ? "info" : "warning",
    );
  }

  private async newProjectFlow(): Promise<void> {
    let sheetChoice = false;
    try {
      const choice = await chooseProjectSource("new");
      if (!choice) return;
      sheetChoice = choice.kind === "sheet";

      if (choice.kind === "pdf") {
        const picked = await pickDrawing();
        if (!picked) return;
        if (!(await this.confirmUnsavedChanges(t("app.newProjectReplace")))) {
          return;
        }
        await this.resetProject();
        await this.loadNewPdf(picked.bytes, picked.name, picked.path);
        return;
      }

      if (!(await this.confirmUnsavedChanges(t("app.newProjectReplace")))) {
        return;
      }
      await this.resetProject();
      await this.createSheetProject(choice);
    } catch (error) {
      logEvent("error", `new project failed: ${errorMessage(error)}`);
      await messageDialog(
        sheetChoice ? t("sheet.createFailed") : t("app.couldNotOpenDrawing"),
        errorMessage(error),
        "warning",
      );
    }
  }

  private sheetLabels(): SheetLabels {
    return resolveSheetLabels((key) => t(key));
  }

  /** Static template bytes are immutable per template, paper and language. */
  private async sheetBytes(template: SheetTemplateRef): Promise<Uint8Array> {
    const key = `${template.id}:${template.version}:${template.paper}:${currentLocale()}`;
    const cached = this.sheetBytesCache.get(key);
    if (cached) return cached;

    const promise = (async () => {
      const spec = sheetTemplateFor(template.id, template.paper, this.sheetLabels());
      if (spec) return buildStaticSheetPdf(spec);
      const fallback = sheetTemplateFor(
        DEFAULT_SHEET_TEMPLATE_ID,
        template.paper,
        this.sheetLabels(),
      );
      if (!fallback) throw new Error(t("sheet.template.unknown"));
      return buildStaticSheetPdf(fallback);
    })();
    this.sheetBytesCache.set(key, promise);
    try {
      return await promise;
    } catch (error) {
      this.sheetBytesCache.delete(key);
      throw error;
    }
  }

  private async createSheetProject(choice: SheetSourceChoice): Promise<void> {
    const documentRef = createTemplateDocument(choice.templateId, choice.paper, choice.name);
    const project = createProject(documentRef);
    project.name = normalizeProjectName(choice.name, documentRef.name);
    prefillSheetFields(project, documentRef, 1);
    project.activeLayerId =
      project.layers.find((layer) => layer.kind === "draw")?.id ?? project.activeLayerId;
    if (!documentRef.template) return;
    const bytes = await this.sheetBytes(documentRef.template);
    const pdf = await this.openDocument(bytes, documentRef.name);
    if (!pdf) return;
    await this.installDocuments([pdf], project, null, false);
    toast(t("sheet.created", { name: project.name }), "success");
  }

  private async addPageFlow(): Promise<void> {
    if (!store.project) {
      await this.openPdfFlow();
      return;
    }
    try {
      const choice = await chooseProjectSource("add");
      if (!choice) return;
      if (choice.kind === "pdf") {
        await this.openPdfFlow();
        return;
      }
      await this.addSheetFlow(choice);
    } catch (error) {
      logEvent("error", `add page failed: ${errorMessage(error)}`);
      await messageDialog(t("sheet.addFailed"), errorMessage(error), "warning");
    }
  }

  private async changeSheetPaper(page: number, paper: SheetPaperSize): Promise<void> {
    const project = store.project;
    const renderer = this.renderer;
    if (!project || !renderer) return;
    const sheet = projectDocumentForPage(project, page);
    if (!sheet?.template || sheet.template.paper === paper) return;
    const index = documentIndexForPage(project.documents, page);
    const next: SheetTemplateRef = {
      ...sheet.template,
      paper,
      fields: { ...sheet.template.fields },
    };
    const bytes = await this.sheetBytes(next);
    const proxy = await this.openDocument(bytes, sheet.name);
    if (!proxy) return;
    renderer.replaceDocument(index, proxy, [1]);
    this.thumbnails?.clear();
    this.sizeEpoch += 1;
    this.pageSizes.delete(page);
    this.pageSizePromises.delete(page);
    await this.enqueuePageSize(page);
    this.canvas.fitPage();
    store.setTemplatePaper(page, paper);
    this.canvas.invalidate();
    toast(t("sheet.paperChanged", { paper }), "success");
  }

  private async addSheetFlow(choice: SheetSourceChoice): Promise<void> {
    const project = store.project;
    const renderer = this.renderer;
    if (!project || !renderer) return;

    const startPage = totalPageCount(project.documents) + 1;
    const documentRef = createTemplateDocument(choice.templateId, choice.paper, choice.name);
    prefillSheetFields(project, documentRef, templateSheetCount(project) + 1);
    if (!documentRef.template) return;

    const bytes = await this.sheetBytes(documentRef.template);
    const pdf = await this.openDocument(bytes, documentRef.name);
    if (!pdf) return;

    store.addDocument(documentRef);
    renderer.addDocument(pdf, [1]);
    store.setPage(startPage);
    await this.enqueuePageSize(startPage);
    this.canvas.fitPage();
    this.canvas.invalidate();
    toast(t("sheet.added", { name: documentRef.name }), "success");
  }

  private async closeProjectFlow(): Promise<void> {
    if (!(await this.confirmUnsavedChanges(t("app.closeProjectDiscard")))) {
      return;
    }
    await this.resetProject();
    toast(t("app.projectClosed"), "info");
  }

  private async quitFlow(): Promise<void> {
    if (!(await this.confirmUnsavedChanges(t("app.quitDiscard")))) {
      return;
    }
    await store.clearAutosave();
    if (!isTauri) {
      window.close();
      toast(t("app.closeBrowserTab"), "info");
      return;
    }
    await this.destroyWindow(t("app.windowCloseFailed"));
  }

  private async bindWindowClose(): Promise<void> {
    if (!isTauri) return;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      this.unlistenClose = await win.onCloseRequested(async (event) => {
        // Always take over the close, then decide explicitly. The Tauri close API
        // would otherwise destroy the window itself, which needs its own permission
        // and gives no feedback if it fails.
        event.preventDefault();
        if (this.closeInProgress) return;
        this.closeInProgress = true;
        try {
          if (!(await this.confirmUnsavedChanges(t("app.closeAppDiscard")))) {
            return;
          }
          await store.clearAutosave();
          await this.destroyWindow(t("app.windowCloseFailed"));
        } finally {
          this.closeInProgress = false;
        }
      });
    } catch {
      // The title-bar close still works; only the unsaved-change prompt is unavailable.
    }
  }

  private async destroyWindow(failureMessage: string): Promise<void> {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      // destroy() bypasses the close-requested event, so closing cannot re-enter
      // the unsaved-change prompt.
      await getCurrentWindow().destroy();
    } catch {
      toast(failureMessage, "warning");
    }
  }

  private async confirmUnsavedChanges(message: string): Promise<boolean> {
    if (!store.project || !store.dirty) return true;
    const choice = await unsavedChangesDialog(message);
    if (choice === "cancel") return false;
    if (choice === "discard") return true;
    return this.saveProjectFlow(false);
  }

  private async resetProject(): Promise<void> {
    this.closeSearch();
    await this.reference.close(false);
    this.reference.splitView.setOpen(false);
    store.closeProject();
    const renderer = this.renderer;
    const thumbnails = this.thumbnails;
    this.renderer = null;
    this.thumbnails = null;
    thumbnails?.destroy();
    if (renderer) {
      try {
        await renderer.destroy();
      } catch {
        // The documents may already be closed.
      }
    }
    this.sizeEpoch++;
    this.pageSizes.clear();
    this.pageSizePromises.clear();
    this.sizeQueue = [];
    this.sizeActive = 0;
    this.canvas.fitPage();
    this.canvas.invalidate();
    this.renderAll();
  }

  private async openPdfFlow(): Promise<void> {
    try {
      const picked = await pickDrawing();
      if (!picked) return;
      await this.loadNewPdf(picked.bytes, picked.name, picked.path);
    } catch (error) {
      logEvent("error", `open drawing failed: ${errorMessage(error)}`);
      await messageDialog(t("app.couldNotOpenDrawing"), errorMessage(error), "warning");
    }
  }

  private async openProjectFlow(): Promise<void> {
    try {
      const picked = await pickProject();
      if (!picked) return;
      await this.loadProjectText(picked.text, picked.path);
    } catch (error) {
      logEvent("error", `open project failed: ${errorMessage(error)}`);
      await messageDialog(t("app.couldNotOpenProject"), errorMessage(error), "warning");
    }
  }

  private async loadNewPdf(bytes: Uint8Array, name: string, path: string | null): Promise<void> {
    const tiff = isTiff(bytes);
    let pdfBytes = bytes;
    let documentRef: DocumentRef;
    let dpiWarning = false;

    if (tiff) {
      const tiffModule = await import("../io/tiffImport");
      let conversion;
      try {
        conversion = await tiffModule.tiffToPdf(bytes);
      } catch (error) {
        await messageDialog(t("app.couldNotImportTif"), errorMessage(error), "warning");
        return;
      }
      const hash = await this.hashBytes(bytes);
      documentRef = tiffModule.createTiffDocumentRef({
        name,
        path,
        sha256: hash,
        sizeBytes: bytes.byteLength,
        conversion,
      });
      pdfBytes = conversion.bytes;
      dpiWarning = conversion.pages.some((page) => !page.dpiKnown);
    } else {
      const hash = await this.hashBytes(bytes);
      documentRef = {
        id: makeId("doc"),
        kind: "pdf",
        name,
        path,
        relativePath: null,
        sha256: hash,
        pageCount: 1,
        sizeBytes: bytes.byteLength,
      };
    }

    const project = store.project;

    if (!project) {
      const pdf = await this.openDocument(pdfBytes, name);
      if (!pdf) return;
      const pages = await this.chooseImportPages(pdf, name, null);
      if (!pages) {
        await pdf.loadingTask.destroy();
        return;
      }
      documentRef.pageCount = pdf.numPages;
      documentRef.excludedPages = excludedSourcePages(pdf.numPages, pages);
      const created = createProject(documentRef);
      created.settings.stampPresets = loadGlobalStampPresets();
      await this.installDocuments([pdf], created, null, false);
      if (path) {
        addRecent({ kind: "pdf", path, name, at: new Date().toISOString() });
      }
      if (dpiWarning) {
        toast(t("app.dpiAssumed"), "warning");
      }
      toast(
        pages.length === pdf.numPages
          ? t("app.openedFile", { name })
          : t("app.openedPages", {
              pages: describePages(pages.length, pdf.numPages),
              name,
            }),
        "success",
      );
      return;
    }

    const pdf = await this.openDocument(pdfBytes, name);
    if (!pdf) return;
    const lastPage = totalPageCount(project.documents);
    const startPage = lastPage + 1;
    const pages = await this.chooseImportPages(pdf, name, lastPage);
    if (!pages) {
      await pdf.loadingTask.destroy();
      return;
    }

    documentRef.pageCount = pdf.numPages;
    documentRef.excludedPages = excludedSourcePages(pdf.numPages, pages);
    if (documentRef.kind === "tiff") documentRef.relativePath = null;
    store.addDocument(documentRef);
    this.renderer?.addDocument(pdf, pages);
    store.setPage(startPage);
    await this.enqueuePageSize(startPage);
    this.canvas.fitPage();
    this.canvas.invalidate();
    if (dpiWarning) {
      toast(t("app.dpiAssumed"), "warning");
    }
    toast(
      t("app.addedPages", {
        pages: describePages(pages.length, pdf.numPages),
        name,
      }),
      "success",
    );
  }

  /**
   * Asks which pages of a picked PDF or TIF should join the project. Single-page
   * files skip the picker; previews come from a temporary service so they never
   * interfere with the project's cached Pages-panel thumbnails.
   */
  private async chooseImportPages(
    pdf: PDFDocumentProxy,
    name: string,
    afterPage: number | null,
  ): Promise<number[] | null> {
    if (pdf.numPages <= 1) return [1];
    const previews = new PageThumbnailService(
      async (page) => {
        const proxy = await pdf.getPage(page);
        const canvas = await renderPagePreview(proxy, 144);
        return canvas.toDataURL("image/jpeg", 0.72);
      },
      () => this.renderer?.busy ?? false,
    );
    try {
      return await pageImportDialog({
        fileName: name,
        pageCount: pdf.numPages,
        mode: afterPage === null ? "new" : "add",
        afterPage: afterPage ?? undefined,
        requestThumbnail: (page) => previews.request(page),
      });
    } finally {
      previews.destroy();
    }
  }

  private async loadProjectText(text: string, projectPath: string | null): Promise<void> {
    if (!(await this.confirmUnsavedChanges(t("app.replaceProject")))) {
      return;
    }
    let project: Project;
    try {
      project = parseProject(text);
    } catch (error) {
      logEvent("error", `open project failed: ${errorMessage(error)}`);
      await messageDialog(t("app.couldNotOpenProject"), errorMessage(error), "warning");
      return;
    }
    await this.loadProjectData(project, projectPath, false);
  }

  private async loadProjectData(
    project: Project,
    projectPath: string | null,
    dirty: boolean,
  ): Promise<void> {
    this.closeSearch();
    const loaded: PDFDocumentProxy[] = [];
    const loadedById = new Map<string, PDFDocumentProxy>();
    const loadedByKey = new Map<string, PDFDocumentProxy>();
    const cacheKeyFor = (documentRef: DocumentRef): string | null =>
      documentRef.kind === "tiff"
        ? `tiff:${documentRef.sha256}:${documentRef.pageCount}:${documentRef.sizeBytes}`
        : documentRef.path || documentRef.sha256
          ? `pdf:${documentRef.path ?? ""}:${documentRef.sha256}`
          : null;

    for (const documentRef of project.documents) {
      if (documentRef.kind === "template") {
        if (!documentRef.template) return;
        const cacheKey = `template:${documentRef.template.id}:${documentRef.template.version}:${documentRef.template.paper}:${currentLocale()}`;
        const cached = loadedByKey.get(cacheKey);
        if (cached) {
          documentRef.pageCount = 1;
          loaded.push(cached);
          loadedById.set(documentRef.id, cached);
          continue;
        }
        const bytes = await this.sheetBytes(documentRef.template);
        const document = await this.openDocument(bytes, documentRef.name);
        if (!document) return;
        documentRef.pageCount = 1;
        loaded.push(document);
        loadedById.set(documentRef.id, document);
        loadedByKey.set(cacheKey, document);
        continue;
      }

      const copiedSource = documentRef.copiedFrom
        ? loadedById.get(documentRef.copiedFrom.documentId)
        : undefined;
      if (copiedSource) {
        documentRef.pageCount = copiedSource.numPages;
        loaded.push(copiedSource);
        loadedById.set(documentRef.id, copiedSource);
        continue;
      }
      const cacheKey = cacheKeyFor(documentRef);
      const cached = cacheKey ? loadedByKey.get(cacheKey) : undefined;
      if (cached) {
        documentRef.pageCount = cached.numPages;
        loaded.push(cached);
        loadedById.set(documentRef.id, cached);
        continue;
      }

      let bytes: Uint8Array | null = null;
      let pdfPath = documentRef.path;

      if (documentRef.kind === "tiff" && documentRef.embeddedPdf) {
        bytes = base64ToBytes(documentRef.embeddedPdf);
        pdfPath = null;
      } else if (isTauri) {
        const candidates: string[] = [];
        if (documentRef.path) candidates.push(documentRef.path);
        if (projectPath && documentRef.relativePath) {
          const resolved = resolveRelativePath(projectPath, documentRef.relativePath);
          if (resolved) candidates.push(resolved);
        }
        for (const candidate of candidates) {
          if (!(await pathExists(candidate))) continue;
          try {
            bytes = await readFileBytes(candidate);
            pdfPath = candidate;
            break;
          } catch {
            // Try the next candidate.
          }
        }
      }

      if (!bytes) {
        const picked = await pickPdf();
        if (!picked) return;
        bytes = picked.bytes;
        pdfPath = picked.path;
        documentRef.name = picked.name;
        documentRef.kind = "pdf";
      }

      // A TIF document carries the hash of the original .tif while `bytes` is
      // the derived PDF, so only referenced PDFs can be checksum verified here.
      const hash = documentRef.kind === "pdf" ? await this.hashBytes(bytes) : "";
      if (documentRef.kind === "pdf" && documentRef.sha256 && hash && documentRef.sha256 !== hash) {
        const proceed = await confirmDialog(
          t("app.checksumTitle"),
          t("app.checksumMessage", { name: documentRef.name }),
          t("app.openAnyway"),
          { danger: true },
        );
        if (!proceed) return;
      }

      const document = await this.openDocument(bytes, documentRef.name);
      if (!document) return;

      if (documentRef.pageCount !== document.numPages) {
        toast(
          t("app.pageCountChanged", {
            name: documentRef.name,
            count: document.numPages,
            expected: documentRef.pageCount,
          }),
          "warning",
        );
        documentRef.pageCount = document.numPages;
      }

      if (documentRef.kind === "pdf") {
        documentRef.path = isTauri ? pdfPath : null;
        documentRef.relativePath = null;
        documentRef.sizeBytes = bytes.byteLength;
        if (hash) documentRef.sha256 = hash;
      }
      loaded.push(document);
      loadedById.set(documentRef.id, document);
      if (cacheKey) loadedByKey.set(cacheKey, document);
    }

    await this.installDocuments(loaded, project, projectPath, dirty);
    if (projectPath) {
      addRecent({
        kind: "project",
        path: projectPath,
        name: basename(projectPath),
        at: new Date().toISOString(),
      });
    }
    toast(
      dirty ? t("app.autosavedRestored") : t("app.loadedProject", { name: project.name }),
      "success",
    );
  }

  private async installDocuments(
    documents: PDFDocumentProxy[],
    project: Project,
    projectPath: string | null,
    dirty: boolean,
  ): Promise<void> {
    const previous = this.renderer;
    const previousThumbnails = this.thumbnails;
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

  private async openDocument(bytes: Uint8Array, name: string): Promise<PDFDocumentProxy | null> {
    let password: string | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await loadPdfDocument(bytes, password);
      } catch (error) {
        if (error instanceof PasswordRequiredError) {
          const entered = await passwordDialog(name);
          if (entered === null) return null;
          password = entered;
          continue;
        }
        if (error instanceof PdfPasswordError) {
          toast(t("app.passwordRejected"), "error");
          const entered = await passwordDialog(name);
          if (entered === null) return null;
          password = entered;
          continue;
        }
        await messageDialog(t("app.couldNotOpenPdf"), errorMessage(error), "warning");
        return null;
      }
    }
    toast(t("app.tooManyPasswords"), "error");
    return null;
  }

  private async hashBytes(bytes: Uint8Array): Promise<string> {
    try {
      return await sha256Hex(bytes);
    } catch (error) {
      toast(t("app.checksumFailed", { error: errorMessage(error) }), "warning");
      return "";
    }
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

  private async goToPage(page: number, fit = true): Promise<void> {
    const project = store.project;
    if (!project) return;
    const target = Math.max(1, Math.min(totalPageCount(project.documents), Math.round(page)));
    if (target !== store.ui.page) store.setPage(target);
    const size = await this.enqueuePageSize(target);
    if (size && fit) {
      this.canvas.fitPage();
      this.canvas.invalidate();
    }
  }

  private async navigateToItem(page: number, layerId: string, itemId: string): Promise<void> {
    const project = store.project;
    if (!project) return;
    const target = Math.max(1, Math.min(totalPageCount(project.documents), Math.round(page)));
    if (target !== store.ui.page) store.setPage(target);
    await this.enqueuePageSize(target);
    const found = findItem(project, itemId);
    store.setSelection({ layerId, itemId });
    if (found) this.canvas.focusItem(found.item);
    this.canvas.invalidate();
  }

  private copySelection(): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    const count = copyItems(project, store.ui.selection);
    if (count) toast(t("app.itemsCopied", { count }), "info");
  }

  private cutSelection(): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    const resolved = resolveSelection(project, store.ui.selection);
    const removable = resolved.filter((entry) => !entry.locked);
    if (!removable.length) {
      toast(t("app.selectedItemLocked"), "warning");
      return;
    }
    const refs = removable.map((entry) => entry.ref);
    const count = copyItems(project, refs);
    if (!count) return;
    let deleted = 0;
    store.mutate((project) => {
      deleted = deleteItems(project, refs).changed;
    }, "change");
    store.clearSelection();
    toast(t("app.itemsCut", { count: deleted }), "success");
  }

  private pasteSelection(): void {
    const project = store.project;
    if (!project) return;
    if (!hasClipboard(project)) {
      toast(t("app.clipboardEmpty"), "info");
      return;
    }
    let refs: SelectionRef[] = [];
    store.mutate((project) => {
      refs = pasteItems(project, store.ui.page);
    }, "change");
    if (!refs.length) {
      toast(t("app.pasteFailed"), "warning");
      return;
    }
    store.setSelectionMany(refs);
    toast(t("app.itemsPasted", { count: refs.length }), "success");
  }

  private async insertImageFlow(): Promise<void> {
    if (!store.project) return;
    let file: File | null;
    try {
      file = await pickImage();
    } catch (error) {
      toast(errorMessage(error), "error");
      return;
    }
    if (!file) return;
    await this.insertImageFile(file);
  }

  private async insertImageFile(file: File): Promise<void> {
    const project = store.project;
    if (!project) return;
    if (!isSupportedImageFile(file)) {
      toast(t("app.chooseImage"), "warning");
      return;
    }
    let asset: ImageAsset;
    try {
      asset = await ingestImageBlob(file, file.name);
    } catch (error) {
      toast(errorMessage(error), "error");
      return;
    }
    const page = store.ui.page;
    const pageSize = await this.enqueuePageSize(page);
    if (!pageSize) {
      toast(t("app.waitForRender"), "warning");
      return;
    }
    if (store.project !== project) return;
    const layer = this.imageTargetLayer();
    if (!layer) {
      toast(t("app.showDrawingLayer"), "warning");
      return;
    }
    const item = createImageItem(asset, page, pageSize, "background");
    store.registerImageAsset(asset);
    store.mutate((project) => {
      project.assets[asset.id] = asset;
      addItem(project, layer.id, item);
    }, "change");
    store.setSelection({ layerId: layer.id, itemId: item.id });
    toast(t("app.imageAdded", { layer: layer.name }), "success");
  }

  private imageTargetLayer(): Layer | null {
    const project = store.project;
    if (!project) return null;
    const page = store.ui.page;
    const active = project.layers.find((layer) => layer.id === project.activeLayerId);
    if (
      active &&
      active.kind === "draw" &&
      layerVisibleOnPage(active, page) &&
      !layerLockedOnPage(active, page)
    ) {
      return active;
    }
    const candidate = project.layers.find(
      (layer) =>
        layer.kind === "draw" && layerVisibleOnPage(layer, page) && !layerLockedOnPage(layer, page),
    );
    if (candidate) {
      store.setActiveLayer(candidate.id);
      return candidate;
    }
    return null;
  }

  private setSelectionImageMode(mode: ImageMode): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    const images = resolveSelection(project, store.ui.selection).filter(
      (entry) => entry.item.kind === "image" && entry.item.image,
    );
    if (!images.length) return;
    const editable = images.filter((entry) => !entry.locked);
    if (!editable.length) {
      toast(t("app.selectedImageLocked"), "warning");
      return;
    }
    store.mutate((project) => {
      setItemsImageMode(project, store.ui.selection, mode);
    }, "change");
  }

  private setSelectionOpacity(opacity: number): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    const images = resolveSelection(project, store.ui.selection).filter(
      (entry) => entry.item.kind === "image",
    );
    if (!images.length) return;
    const editable = images.filter((entry) => !entry.locked);
    if (!editable.length) {
      toast(t("app.selectedImageLocked"), "warning");
      return;
    }
    store.mutate((project) => {
      setItemsOpacity(project, store.ui.selection, opacity);
    }, "change");
  }

  private duplicateSelection(): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    const locked = resolveSelection(project, store.ui.selection).every((entry) => entry.locked);
    if (locked) {
      toast(t("app.selectedItemLocked"), "warning");
      return;
    }
    let refs: SelectionRef[] = [];
    store.mutate((project) => {
      refs = duplicateItems(project, store.ui.selection, 12);
    }, "change");
    if (refs.length) store.setSelectionMany(refs);
  }

  private moveSelectionToLayer(layerId: string): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    let result = { moved: 0, skipped: 0, mixedKinds: false };
    store.mutate((project) => {
      result = moveItemsToLayer(project, store.ui.selection, layerId);
    }, "change");
    if (result.mixedKinds) {
      toast(t("app.selectSameKind"), "warning");
      return;
    }
    const refs: SelectionRef[] = [];
    for (const ref of store.ui.selection) {
      const found = findItem(store.project!, ref.itemId);
      if (found) refs.push({ layerId: found.layer.id, itemId: found.item.id });
    }
    store.setSelectionMany(refs);
    if (result.moved) {
      const layer = store.project?.layers.find((candidate) => candidate.id === layerId);
      const moved = t("app.itemsMoved", {
        count: result.moved,
        layer: layer?.name ?? t("app.layerFallback"),
      });
      const skipped = result.skipped ? t("app.lockedSkippedSuffix", { count: result.skipped }) : "";
      toast(`${moved}${skipped}`, result.skipped ? "warning" : "success");
    } else if (result.skipped) {
      toast(t("app.noItemsMoved"), "warning");
    }
  }

  private setSelectionVisible(visible: boolean): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    const resolved = resolveSelection(project, store.ui.selection);
    const targetable = visible
      ? resolved.filter((entry) => layerVisibleOnPage(entry.layer, entry.item.page))
      : resolved;
    if (!targetable.length) {
      toast(t("app.layerHiddenShow"), "warning");
      return;
    }
    const result = emptyItemCommandResult();
    store.mutate((project) => {
      Object.assign(result, setItemsVisible(project, store.ui.selection, visible));
    }, "change");
    if (!visible) {
      store.clearSelection();
      toast(t("app.itemsHidden", { count: result.changed }), "info");
    } else {
      const shown = t("app.itemsShown", { count: result.changed });
      const hidden = result.skippedLayerHidden
        ? t("app.layerHiddenSuffix", { count: result.skippedLayerHidden })
        : "";
      toast(`${shown}${hidden}`, result.skippedLayerHidden ? "warning" : "success");
    }
  }

  private setSelectionLocked(locked: boolean): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    const resolved = resolveSelection(project, store.ui.selection);
    const targetable = locked
      ? resolved
      : resolved.filter((entry) => !layerLockedOnPage(entry.layer, entry.item.page));
    if (!targetable.length) {
      toast(t("app.layerLockedUnlock"), "warning");
      return;
    }
    const result = emptyItemCommandResult();
    store.mutate((project) => {
      Object.assign(result, setItemsLocked(project, store.ui.selection, locked));
    }, "change");
    if (locked) {
      toast(t("app.itemsLocked", { count: result.changed }), "success");
    } else {
      const unlocked = t("app.itemsUnlocked", { count: result.changed });
      const stillLocked = result.skippedLayerLocked
        ? t("app.layerLockedSuffix", { count: result.skippedLayerLocked })
        : "";
      toast(`${unlocked}${stillLocked}`, result.skippedLayerLocked ? "warning" : "success");
    }
  }

  private async duplicatePageFlow(page: number): Promise<void> {
    const project = store.project;
    if (!project) return;
    const total = totalPageCount(project.documents);
    const target = Math.max(1, Math.min(total, Math.round(page)));
    const sourceName = pageDisplayName(project, target);
    const defaultName = sourceName
      ? t("app.pageCopyName", { name: sourceName })
      : t("app.pageCopyDefault", { page: target });
    const hasScale = Boolean(project.pages[String(target)]?.calibration);
    const options = await duplicatePageDialog({
      page: target,
      newPage: total + 1,
      defaultName,
      hasScale,
    });
    if (!options) return;

    const sourceDocumentIndex = documentIndexForPage(project.documents, target);
    const sourceProxy = this.renderer?.documents[sourceDocumentIndex];
    const result = store.duplicatePage(target, options);
    if (!result) {
      toast(t("app.pageDuplicateFailed"), "warning");
      return;
    }
    if (sourceProxy && this.renderer) {
      this.renderer.addDocument(sourceProxy, [result.sourceLocalPage]);
    }
    this.thumbnails?.clear();
    this.sizeEpoch++;
    this.pageSizes.clear();
    this.pageSizePromises.clear();
    this.sizeQueue = [];
    this.sizeActive = 0;
    await this.enqueuePageSize(result.page);
    this.canvas.fitPage();
    this.canvas.invalidate();
    this.renderAll();
    toast(t("app.pageDuplicated", { from: target, to: result.page }), "success");
  }

  private async deletePageFlow(page: number): Promise<void> {
    const project = store.project;
    if (!project) return;
    const source = projectDocumentForPage(project, page);
    const total = totalPageCount(project.documents);
    if (total <= 1) {
      toast(t("app.lastPage"), "warning");
      return;
    }
    const target = Math.max(1, Math.min(total, Math.round(page)));
    const pageName = pageDisplayName(project, target);
    const targetLabel = pageName
      ? t("app.deletePageNamed", { name: pageName, page: target })
      : t("app.deletePageNumbered", { page: target });
    const sourceLabel = source ? t("app.deletePageFromSource", { name: source.name }) : "";
    const confirmed = await confirmDialog(
      t("app.deletePageTitle"),
      t("app.deletePageMessage", { target: targetLabel, source: sourceLabel }),
      t("app.deletePageConfirm"),
      { danger: true },
    );
    if (!confirmed) return;
    const result = store.deletePage(target);
    if (!result) {
      toast(t("app.pageDeleteFailed"), "warning");
      return;
    }
    if (result.removedDocumentIndex !== null) {
      this.renderer?.removeDocument(result.removedDocumentIndex);
    }
    const current = store.project;
    if (current) this.renderer?.setPageMaps(documentPageMaps(current.documents));
    this.thumbnails?.clear();
    this.sizeEpoch++;
    this.pageSizes.clear();
    this.pageSizePromises.clear();
    this.sizeQueue = [];
    this.sizeActive = 0;
    await this.enqueuePageSize(store.ui.page);
    this.canvas.fitPage();
    this.canvas.invalidate();
    this.renderAll();
    toast(t("app.pageDeleted", { page: target }), "info");
  }

  private setSelectionStrokeWidth(width: number): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    if (!Number.isFinite(width) || width <= 0) return;
    const resolved = resolveSelection(project, store.ui.selection);
    const editable = resolved.filter((entry) => !entry.locked);
    if (!editable.length) {
      toast(t("app.selectedItemsLocked"), "warning");
      return;
    }
    store.mutate((project) => {
      setItemsStrokeWidth(project, store.ui.selection, width);
    }, "change");
  }

  private setSelectionColor(color: string): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    const resolved = resolveSelection(project, store.ui.selection);
    const editable = resolved.filter((entry) => !entry.locked);
    if (!editable.length) {
      toast(t("app.selectedItemLocked"), "warning");
      return;
    }
    store.mutate((project) => {
      setItemsColor(project, store.ui.selection, color);
    }, "change");
  }

  private bulkEditMeasurementSelection(patch: MeasurementBulkPatch): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    const editable = resolveSelection(project, store.ui.selection).filter(
      (entry) => isMeasurementKind(entry.item.kind) && !itemIsLocked(entry.item, entry.layer),
    );
    if (!editable.length) {
      toast(t("app.selectedMeasurementsLocked"), "warning");
      return;
    }
    let result: MeasurementBulkResult = {
      updated: 0,
      skippedLocked: 0,
      skippedNonMeasurement: 0,
    };
    store.mutate((project) => {
      result = applyMeasurementBulkEdit(project, store.ui.selection, patch);
    }, "change");
    if (result.updated && result.skippedLocked) {
      toast(
        t("app.measurementsUpdated", {
          count: result.updated,
          locked: result.skippedLocked,
        }),
        "warning",
      );
    }
  }

  private setSelectionCategory(categoryId: string): void {
    const project = store.project;
    if (!project?.categories.some((category) => category.id === categoryId)) return;
    this.bulkEditMeasurementSelection({ categoryId });
  }

  private setSelectionRoom(room: string): void {
    this.bulkEditMeasurementSelection({ room });
  }

  private setSelectionAreaMode(mode: AreaMode): void {
    this.bulkEditMeasurementSelection({ areaMode: mode });
  }

  private setSelectionCountType(type: CountType): void {
    this.bulkEditMeasurementSelection({ countType: type });
  }

  private setSelectionCountQuantity(quantity: number): void {
    if (!Number.isFinite(quantity) || quantity < 1) return;
    this.bulkEditMeasurementSelection({ countQuantity: quantity });
  }

  private setSelectionLabelSize(size: number): void {
    if (!Number.isFinite(size)) return;
    this.bulkEditMeasurementSelection({ labelSize: size });
  }

  private async saveProjectFlow(saveAs: boolean): Promise<boolean> {
    const project = store.project;
    if (!project) return false;
    try {
      const protectedPaths = sourceDocumentPaths(project, store.projectPath);
      const suggested = suggestedProjectName(project);
      if (!isTauri) {
        updateRelativeDocumentPaths(project, null);
        const json = serializeProject(project);
        const result = await saveTextFile(json, suggested, projectFilters(), {
          forbiddenPaths: protectedPaths,
        });
        if (!result) return false;
        store.markSaved(null);
        toast(t("app.projectDownloaded"), "success");
        return true;
      }

      let path = store.projectPath;
      if (saveAs || !path) {
        const chosen = await chooseSavePath(suggested, projectFilters());
        if (!chosen) return false;
        path = chosen;
      }
      assertWritablePath(path, protectedPaths);
      updateRelativeDocumentPaths(project, path);
      const json = serializeProject(project);
      await writeTextFile(path, json, { forbiddenPaths: protectedPaths });
      store.markSaved(path);
      addRecent({
        kind: "project",
        path,
        name: basename(path),
        at: new Date().toISOString(),
      });
      toast(t("app.projectSaved"), "success");
      return true;
    } catch (error) {
      logEvent("error", `save failed: ${errorMessage(error)}`);
      await messageDialog(t("app.couldNotSaveProject"), errorMessage(error), "warning");
      return false;
    }
  }

  /**
   * Writes a backup copy without changing the open project's path or its saved
   * state. Document links in the copy are relative to the copy's folder so the
   * backup stays usable if the original project is moved or replaced.
   */
  private async saveProjectCopyFlow(): Promise<boolean> {
    const project = store.project;
    if (!project) return false;
    try {
      const protectedPaths = sourceDocumentPaths(project, store.projectPath);
      const suggested = suggestedProjectName(project).replace(/\.gridscalr$/i, "-copy.gridscalr");
      if (!isTauri) {
        const result = await saveTextFile(serializeProject(project), suggested, projectFilters(), {
          forbiddenPaths: protectedPaths,
        });
        if (!result) return false;
        toast(t("app.copyDownloaded"), "success");
        return true;
      }

      const path = await chooseSavePath(suggested, projectFilters());
      if (!path) return false;
      assertWritablePath(path, protectedPaths);
      const json = serializeProjectCopy(project, path);
      await writeTextFile(path, json, { forbiddenPaths: protectedPaths });
      addRecent({
        kind: "project",
        path,
        name: basename(path),
        at: new Date().toISOString(),
      });
      toast(t("app.copySavedTo", { path: basename(path) }), "success");
      return true;
    } catch (error) {
      logEvent("error", `save copy failed: ${errorMessage(error)}`);
      await messageDialog(t("app.couldNotSaveCopy"), errorMessage(error), "warning");
      return false;
    }
  }

  private packageHost(): PackageHost {
    return {
      confirmDiscard: () => this.confirmUnsavedChanges(t("app.packageReplace")),
      openProject: (path, validatePackage) => this.openPackagedProject(path, validatePackage),
      createDrawingPdf: (project) => this.createPackageDrawingPdf(project),
    };
  }

  private async openPackagedProject(path: string, validatePackage: boolean): Promise<void> {
    const text = await readFileText(path);
    if (validatePackage) validatePackagedProjectJson(text);
    const project = parseProject(text);
    await this.loadProjectData(project, path, false);
    if (store.projectPath !== path) {
      throw new Error(t("app.packageNotOpened"));
    }
  }

  private async createPackageDrawingPdf(project: Project): Promise<Uint8Array | null> {
    if (!this.renderer) throw new Error(t("app.sourcePdfMissing"));
    const pages = Array.from(
      { length: totalPageCount(project.documents) },
      (_, index) => index + 1,
    );
    const layerIds = project.layers
      .filter((layer) => pages.some((page) => layerVisibleOnPage(layer, page)))
      .map((layer) => layer.id);
    const { exportProjectPdf } = await import("../pdf/pdfExport");
    return exportProjectPdf(project, this.renderer, {
      pages,
      layerIds,
      includeLabels: true,
      includeCalibration: true,
      includeLegend: false,
    });
  }

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

  private openSearchFlow(): void {
    const project = store.project;
    if (!project || !this.renderer) return;
    if (this.searchPanel) {
      this.searchPanel.focus();
      return;
    }
    this.searchQuery = "";
    const index = new PdfTextIndex(totalPageCount(project.documents), (page) =>
      this.renderer!.getPage(page),
    );
    for (let page = 1; page <= index.pageCount; page += 1) {
      const stored = project.pages[String(page)]?.ocr;
      if (stored && isOcrCurrent(project, page, stored)) {
        index.seed(page, ocrPageToText(stored, page));
      }
    }
    this.textIndex = index;
    this.searchPanel = new SearchPanel(this.refs.canvasArea, {
      onQuery: (query) => this.onSearchQuery(query),
      onSelect: (hit) => void this.selectSearchHit(hit),
      onOcr: () => void this.runOcrScans(),
      onClose: () => this.closeSearch(),
    });
    this.searchPanel.setProgress(0, index.pageCount);
    this.searchPanel.setResults([], "", 0, index.pageCount);
    void this.indexTextSearch(index);
  }

  private onSearchQuery(query: string): void {
    this.searchQuery = query;
    if (this.searchDebounce !== null) window.clearTimeout(this.searchDebounce);
    this.searchDebounce = window.setTimeout(() => {
      this.searchDebounce = null;
      this.runSearch(query);
    }, 120);
  }

  private runSearch(query: string): void {
    const index = this.textIndex;
    if (!index || !this.searchPanel) return;
    this.searchPanel.setResults(index.search(query), query, index.indexedCount, index.pageCount);
  }

  private async indexTextSearch(index: PdfTextIndex): Promise<void> {
    await index.indexAll((done, total) => {
      if (this.textIndex !== index || !this.searchPanel) return;
      this.searchPanel.setProgress(done, total);
      if (this.searchQuery.trim()) this.runSearch(this.searchQuery);
    });
    if (this.textIndex !== index || !this.searchPanel) return;
    this.searchPanel.setIndexComplete(index.indexedCount);
    if (this.searchQuery.trim()) this.runSearch(this.searchQuery);
  }

  private async selectSearchHit(hit: SearchHit): Promise<void> {
    const project = store.project;
    if (!project) return;
    if (hit.page < 1 || hit.page > totalPageCount(project.documents)) return;
    await this.enqueuePageSize(hit.page);
    if (store.ui.page !== hit.page) store.setPage(hit.page);
    this.canvas.setSearchHits(hit.page, hit.rects);
    this.canvas.focusBounds(hit.bounds);
    this.canvas.invalidate();
  }

  private async runOcrScans(): Promise<void> {
    const index = this.textIndex;
    const panel = this.searchPanel;
    const renderer = this.renderer;
    if (!index || !panel || !renderer || !store.project || this.ocrBusy) return;
    this.ocrBusy = true;
    panel.setOcrBusy(true);
    const token = ++this.ocrToken;
    let scanned = 0;
    try {
      for (let page = 1; page <= index.pageCount; page += 1) {
        if (token !== this.ocrToken || this.textIndex !== index || !this.searchPanel) return;
        const pageText = await index.page(page);
        if (pageText.text.trim().length >= 8) continue;
        const project = store.project;
        if (!project) return;
        const stored = project.pages[String(page)]?.ocr;
        if (stored && isOcrCurrent(project, page, stored)) {
          index.setPageText(page, ocrPageToText(stored, page));
          continue;
        }
        panel.setStatus(t("app.ocrPageProgress", { page, total: index.pageCount }));
        const ocr = await runOcrPage(project, page, renderer, (message, progress) => {
          if (token !== this.ocrToken) return;
          panel.setStatus(
            t("app.ocrPageProgressDetail", {
              page,
              total: index.pageCount,
              message,
              percent: Math.round(progress * 100),
            }),
          );
        });
        if (token !== this.ocrToken || this.textIndex !== index) return;
        store.setPageOcr(page, ocr);
        index.setPageText(page, ocrPageToText(ocr, page));
        scanned += 1;
        this.runSearch(this.searchQuery);
      }
      if (token !== this.ocrToken) return;
      if (scanned === 0) {
        panel.setStatus(t("app.everyPageSearchable"));
      } else {
        this.runSearch(this.searchQuery);
        panel.setStatus(t("app.ocrIndexed", { count: scanned }));
        toast(t("app.ocrIndexed", { count: scanned }), "success");
      }
    } catch (error) {
      if (!this.disposed && token === this.ocrToken) {
        await messageDialog(t("app.ocrFailed"), errorMessage(error), "warning");
      }
    } finally {
      this.ocrBusy = false;
      this.searchPanel?.setOcrBusy(false);
    }
  }

  private closeSearch(): void {
    this.ocrToken += 1;
    this.ocrBusy = false;
    if (this.searchDebounce !== null) {
      window.clearTimeout(this.searchDebounce);
      this.searchDebounce = null;
    }
    this.searchPanel?.destroy();
    this.searchPanel = null;
    this.textIndex?.dispose();
    this.textIndex = null;
    this.searchQuery = "";
    this.canvas.clearSearchHits();
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

  private async restoreAutosave(): Promise<void> {
    const payload = await store.readAutosave();
    if (!payload) {
      toast(t("app.noRecovery"), "info");
      return;
    }
    let project: Project;
    try {
      project = parseProject(JSON.stringify(payload.project));
    } catch (error) {
      logEvent("error", `restore session failed: ${errorMessage(error)}`);
      await messageDialog(t("app.couldNotRestoreSession"), errorMessage(error), "warning");
      return;
    }
    await this.loadProjectData(project, payload.projectPath, true);
  }

  private async openRecent(entry: RecentEntry): Promise<void> {
    if (!isTauri) {
      toast(t("app.recentDesktopOnly"), "info");
      return;
    }
    try {
      if (entry.kind === "pdf") {
        const bytes = await readFileBytes(entry.path);
        await this.loadNewPdf(bytes, entry.name, entry.path);
      } else {
        const text = await readFileText(entry.path);
        await this.loadProjectText(text, entry.path);
      }
    } catch (error) {
      logEvent("error", `open recent failed: ${errorMessage(error)}`);
      await messageDialog(t("app.couldNotOpenRecent"), errorMessage(error), "warning");
    }
  }

  private async openPath(path: string, failureTitle = t("app.couldNotOpenDropped")): Promise<void> {
    const lower = path.toLowerCase();
    try {
      if (lower.endsWith(".pdf") || lower.endsWith(".tif") || lower.endsWith(".tiff")) {
        const bytes = await readFileBytes(path);
        await this.loadNewPdf(bytes, basename(path), path);
      } else if (lower.endsWith(".gridscalr") || lower.endsWith(".json")) {
        const text = await readFileText(path);
        await this.loadProjectText(text, path);
      } else {
        toast(t("app.dropHint"), "warning");
      }
    } catch (error) {
      logEvent("error", `open file failed: ${errorMessage(error)}`);
      await messageDialog(failureTitle, errorMessage(error), "warning");
    }
  }

  /**
   * Copies the bundled demo into the app data folder and opens it from there,
   * so the demo can be measured, edited and saved without touching the
   * installation directory or the bundled fixture.
   */
  private async openDemoProjectFlow(): Promise<void> {
    if (!isTauri) {
      toast(t("welcome.demoUnavailable"), "info");
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string>("prepare_demo_project");
      await this.openPath(path, t("welcome.demoFailed"));
    } catch (error) {
      logEvent("error", `demo failed: ${errorMessage(error)}`);
      await messageDialog(t("welcome.demoFailed"), errorMessage(error), "warning");
    }
  }

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
      await this.openDemoProjectFlow();
      record("demo opened", Boolean(store.project && store.project.documents.length > 0));

      await this.saveProjectToPath(savePath);
      record("project saved", await pathExists(savePath));

      const text = await readFileText(savePath);
      await this.loadProjectText(text, savePath);
      record("project reopened", store.projectPath === savePath);

      store.mutate((project) => {
        project.settings.showGrid = !project.settings.showGrid;
      }, "change");
      const pending = this.confirmUnsavedChanges("smoke test close prompt");
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
    await writeTextFile(path, serializeProject(project), { forbiddenPaths: protectedPaths });
    store.markSaved(path);
  }

  /** Version, platform and anonymised project statistics for a bug report. */
  private diagnosticsText(): string {
    return buildDiagnostics({
      version: __APP_VERSION__,
      schemaVersion: SCHEMA_VERSION,
      platform: detectPlatform(),
      desktop: isTauri,
      userAgent: navigator.userAgent,
      mode: import.meta.env.PROD ? "production" : "development",
      locale: navigator.language,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio,
      },
      project: store.project ? projectStats(store.project) : null,
      autosaveFailure: store.autosaveError?.message ?? null,
      log: readDiagnosticsLog().slice(-25),
    });
  }

  private async copyDiagnosticsFlow(): Promise<void> {
    await copyDiagnostics(() => this.diagnosticsText());
  }

  private reportProblemFlow(): void {
    reportProblemDialog(() => this.diagnosticsText());
  }

  /**
   * Consumes files handed over by the operating system: start arguments, a
   * Finder open event, or a second launch that the single-instance callback
   * forwarded. Only the first supported path opens; GridScalr keeps one project
   * per window.
   */
  private async bindLaunchFiles(): Promise<void> {
    if (!isTauri) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");
      const consume = async (): Promise<void> => {
        try {
          const paths = await invoke<string[]>("take_launch_paths");
          if (!paths.length) return;
          const path = firstLaunchPath(paths);
          if (!path) {
            await messageDialog(t("launch.nothingTitle"), t("launch.nothingMessage"), "warning");
            return;
          }
          const supported = paths.filter((entry) => classifyLaunchPath(entry) !== "unknown");
          if (supported.length > 1) {
            toast(t("launch.oneFile"), "info");
          }
          await this.openPath(path, t("app.couldNotOpenOsFile"));
        } catch {
          // A failed launch read must not break the running session.
        }
      };
      this.unlistenLaunch = await listen("gridscalr:paths-queued", () => void consume());
      await consume();
    } catch {
      // The OS integration is optional; File → Open still works.
    }
  }

  private async openDroppedFile(file: File): Promise<void> {
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".pdf") || lower.endsWith(".tif") || lower.endsWith(".tiff")) {
        await this.loadNewPdf(new Uint8Array(await file.arrayBuffer()), file.name, null);
      } else if (
        file.name.toLowerCase().endsWith(".gridscalr") ||
        file.name.toLowerCase().endsWith(".json")
      ) {
        await this.loadProjectText(await file.text(), null);
      } else {
        toast(t("app.dropHint"), "warning");
      }
    } catch (error) {
      logEvent("error", `dropped file failed: ${errorMessage(error)}`);
      await messageDialog(t("app.couldNotOpenDropped"), errorMessage(error), "warning");
    }
  }

  private async setupDragDrop(): Promise<void> {
    if (isTauri) {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        await getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload as { type: string; paths?: string[] };
          if (payload.type === "drop" && payload.paths?.length) {
            void this.openPath(payload.paths[0]);
          }
        });
      } catch (error) {
        console.warn(t("app.nativeDragUnavailable"), error);
      }
      return;
    }
    window.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
    window.addEventListener("drop", (event) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (file) void this.openDroppedFile(file);
    });
  }

  /** Dev-only test bridge consumed by the Playwright suite. */
  getCanvasTestApi(): CanvasTestApi {
    return this.canvas.getTestApi();
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
    window.removeEventListener(LANGUAGE_CHANGED_EVENT, this.onLanguageChanged);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onWindowBlur);
    window.removeEventListener("paste", this.onPaste);
    this.unlistenClose?.();
    this.unlistenClose = null;
    this.unlistenLaunch?.();
    this.unlistenLaunch = null;
    this.windowControls?.dispose();
    this.windowControls = null;
    this.thumbnails?.destroy();
    this.thumbnails = null;
    this.closeSearch();
    void disposeOcrWorker();
    this.reference.dispose();
    this.canvas.destroy();
    if (this.renderer) void this.renderer.destroy();
  }
}

function errorMessage(error: unknown): string {
  return describeError(error);
}

function describePages(count: number, total: number): string {
  if (count === total) {
    return total === 1 ? t("app.pageCountOne") : t("app.pageCountMany", { count: total });
  }
  return t("app.pagesOfTotal", { count, total });
}
