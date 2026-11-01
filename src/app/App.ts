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
import { updateStatus } from "../ui/statusBar";
import { createShell, type ShellRefs } from "../ui/shell";
import { openHelp } from "../ui/helpDialog";
import { isMarkupsOpen, setMarkupsOpen } from "../ui/markupsPanel";
import { duplicatePageDialog } from "../ui/duplicatePageDialog";
import { pageImportDialog } from "../ui/pageImportDialog";
import { updatePageSizeLabel } from "../ui/pageList";
import { openQuantitiesDialog } from "../ui/quantityDialog";
import { openSettingsDialog } from "../ui/settingsDialog";
import { openExportMenu, setMenuActions } from "../ui/topMenu";
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

const PROJECT_FILTERS = [{ name: "GridScalr project", extensions: ["gridscalr"] }];

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
      addPages: () => void this.openPdfFlow(),
      refresh: () => this.renderAll(),
      restoreAutosave: () => void this.restoreAutosave(),
      getAutosave: () => store.readAutosavePreview(),
      openRecent: (entry) => void this.openRecent(entry),
    };
    setMenuActions(this.actions);

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
        const autosaveError = store.consumeAutosaveError();
        if (autosaveError) {
          toast(autosaveError.message, "warning", autosaveError.quotaExceeded ? 10000 : 7000);
        }
      }
      if (reason === "project" && this.searchPanel) this.closeSearch();
      this.reference.onStoreChange(reason);
      this.renderAll();
    });

    this.bind();
    this.renderAll();
    void this.bindWindowClose();
    void this.setupDragDrop();
  }

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
      requestMarkupRename(this.refs);
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
    const tool = TOOL_KEYS[key];
    if (tool && !event.shiftKey) {
      event.preventDefault();
      store.setTool(tool);
      return;
    }
  };

  private startCalibration(): void {
    if (!store.project) return;
    const page = store.ui.page;
    if (pageScaleLocked(store.project, page)) {
      toast("This page scale is locked. Unlock it before calibrating.", "warning");
      return;
    }
    store.setTool("calibrate");
    toast("Calibration: click the two ends of a known dimension.", "info");
  }

  private async openManualScaleFlow(): Promise<void> {
    const project = store.project;
    if (!project) return;
    const page = store.ui.page;
    if (pageScaleLocked(project, page)) {
      toast("This page scale is locked. Unlock it before setting a manual scale.", "warning");
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
      toast("No unlocked pages were available for this scale.", "warning");
      return;
    }
    const lockedSkipped = result.applyToAll
      ? totalPageCount(project.documents) - changed.length
      : 0;
    toast(
      `Manual scale 1:${calibration.ratio} set on ${
        changed.length === 1 ? `page ${changed[0]}` : `${changed.length} pages`
      }${lockedSkipped > 0 ? ` · ${lockedSkipped} locked page${lockedSkipped === 1 ? "" : "s"} skipped` : ""}.`,
      "success",
    );
  }

  private setScaleLock(locked: boolean): void {
    const project = store.project;
    if (!project) return;
    const page = store.ui.page;
    if (!pageCalibration(project, page)) {
      toast("Set a scale before locking the page.", "warning");
      return;
    }
    store.mutate((project) => {
      setPageScaleLocked(project, page, locked);
    }, "change");
    toast(
      locked ? `Scale locked on page ${page}.` : `Scale unlocked on page ${page}.`,
      locked ? "success" : "info",
    );
  }

  private async clearCalibrationFlow(): Promise<void> {
    const project = store.project;
    if (!project) return;
    const page = store.ui.page;
    if (!pageCalibration(project, page)) return;
    if (pageScaleLocked(project, page)) {
      toast("This page scale is locked. Unlock it before clearing.", "warning");
      return;
    }
    const confirmed = await confirmDialog(
      "Clear scale",
      `Remove the scale from page ${page}? Existing measurements keep the scale they were created with, but new measurements will be uncalibrated.`,
      "Clear scale",
      { danger: true },
    );
    if (!confirmed) return;
    let cleared = false;
    store.mutate((project) => {
      cleared = clearPageCalibration(project, page);
    }, "change");
    toast(
      cleared ? "Page scale cleared." : "The page scale could not be cleared.",
      cleared ? "info" : "warning",
    );
  }

  private async newProjectFlow(): Promise<void> {
    try {
      const picked = await pickDrawing();
      if (!picked) return;
      if (
        !(await this.confirmUnsavedChanges(
          "Starting a new project will replace the current project.",
        ))
      ) {
        return;
      }
      await this.resetProject();
      await this.loadNewPdf(picked.bytes, picked.name, picked.path);
    } catch (error) {
      await messageDialog("Could not open drawing", errorMessage(error), "warning");
    }
  }

  private async closeProjectFlow(): Promise<void> {
    if (!(await this.confirmUnsavedChanges("Closing the project will discard unsaved changes."))) {
      return;
    }
    await this.resetProject();
    toast("Project closed.", "info");
  }

  private async quitFlow(): Promise<void> {
    if (!(await this.confirmUnsavedChanges("Quitting GridScalr will discard unsaved changes."))) {
      return;
    }
    await store.clearAutosave();
    if (!isTauri) {
      window.close();
      toast("Close the browser tab to quit.", "info");
      return;
    }
    await this.destroyWindow("The window could not be closed. Close it from the title bar.");
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
          if (
            !(await this.confirmUnsavedChanges("Closing GridScalr will discard unsaved changes."))
          ) {
            return;
          }
          await store.clearAutosave();
          await this.destroyWindow("The window could not be closed. Close it from the title bar.");
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
      await messageDialog("Could not open drawing", errorMessage(error), "warning");
    }
  }

  private async openProjectFlow(): Promise<void> {
    try {
      const picked = await pickProject();
      if (!picked) return;
      await this.loadProjectText(picked.text, picked.path);
    } catch (error) {
      await messageDialog("Could not open project", errorMessage(error), "warning");
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
        await messageDialog("Could not import TIF", errorMessage(error), "warning");
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
        toast(
          "This scan has no DPI tags, so 300 DPI was assumed. Calibrate the page before measuring.",
          "warning",
        );
      }
      toast(
        pages.length === pdf.numPages
          ? `Opened ${name}`
          : `Opened ${describePages(pages.length, pdf.numPages)} from ${name}.`,
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
      toast(
        "This scan has no DPI tags, so 300 DPI was assumed. Calibrate the page before measuring.",
        "warning",
      );
    }
    toast(`Added ${describePages(pages.length, pdf.numPages)} from ${name}.`, "success");
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
    if (
      !(await this.confirmUnsavedChanges("Opening another project will replace the current one."))
    ) {
      return;
    }
    let project: Project;
    try {
      project = parseProject(text);
    } catch (error) {
      await messageDialog("Could not open project", errorMessage(error), "warning");
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
          "PDF checksum changed",
          `The PDF file “${documentRef.name}” no longer matches the checksum stored in this project. It may have been replaced or edited. Continue and update the checksum?`,
          "Open anyway",
          { danger: true },
        );
        if (!proceed) return;
      }

      const document = await this.openDocument(bytes, documentRef.name);
      if (!document) return;

      if (documentRef.pageCount !== document.numPages) {
        toast(
          `“${documentRef.name}” now has ${document.numPages} page${document.numPages === 1 ? "" : "s"} instead of ${documentRef.pageCount}.`,
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
    toast(dirty ? "Autosaved session restored." : `Loaded ${project.name}`, "success");
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
          toast("That password was not accepted. Try again.", "error");
          const entered = await passwordDialog(name);
          if (entered === null) return null;
          password = entered;
          continue;
        }
        await messageDialog("Could not open PDF", errorMessage(error), "warning");
        return null;
      }
    }
    toast("Too many incorrect password attempts.", "error");
    return null;
  }

  private async hashBytes(bytes: Uint8Array): Promise<string> {
    try {
      return await sha256Hex(bytes);
    } catch (error) {
      toast(`Could not compute the PDF checksum: ${errorMessage(error)}`, "warning");
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
    if (count) toast(`${count} item${count === 1 ? "" : "s"} copied.`, "info");
  }

  private cutSelection(): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    const resolved = resolveSelection(project, store.ui.selection);
    const removable = resolved.filter((entry) => !entry.locked);
    if (!removable.length) {
      toast("The selected item is locked.", "warning");
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
    toast(
      `${deleted} item${deleted === 1 ? "" : "s"} cut. Paste on any page with Ctrl+V.`,
      "success",
    );
  }

  private pasteSelection(): void {
    const project = store.project;
    if (!project) return;
    if (!hasClipboard(project)) {
      toast("The clipboard is empty.", "info");
      return;
    }
    let refs: SelectionRef[] = [];
    store.mutate((project) => {
      refs = pasteItems(project, store.ui.page);
    }, "change");
    if (!refs.length) {
      toast("Could not paste these items on this page.", "warning");
      return;
    }
    store.setSelectionMany(refs);
    toast(`${refs.length} item${refs.length === 1 ? "" : "s"} pasted.`, "success");
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
      toast("Choose a PNG or JPEG image.", "warning");
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
      toast("Wait until the page has finished rendering, then try again.", "warning");
      return;
    }
    if (store.project !== project) return;
    const layer = this.imageTargetLayer();
    if (!layer) {
      toast("Show and unlock a drawing layer before inserting an image.", "warning");
      return;
    }
    const item = createImageItem(asset, page, pageSize, "background");
    store.registerImageAsset(asset);
    store.mutate((project) => {
      project.assets[asset.id] = asset;
      addItem(project, layer.id, item);
    }, "change");
    store.setSelection({ layerId: layer.id, itemId: item.id });
    toast(`Image added to “${layer.name}”.`, "success");
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
      toast("The selected image is locked.", "warning");
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
      toast("The selected image is locked.", "warning");
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
      toast("The selected item is locked.", "warning");
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
      toast("Select only measurements or only drawings before moving to a layer.", "warning");
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
      toast(
        `${result.moved} item${result.moved === 1 ? "" : "s"} moved to “${layer?.name ?? "layer"}”.${result.skipped ? ` ${result.skipped} locked item${result.skipped === 1 ? "" : "s"} skipped.` : ""}`,
        result.skipped ? "warning" : "success",
      );
    } else if (result.skipped) {
      toast("No items were moved. Locked items stay in place.", "warning");
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
      toast("The layer is hidden. Show the layer first.", "warning");
      return;
    }
    const result = emptyItemCommandResult();
    store.mutate((project) => {
      Object.assign(result, setItemsVisible(project, store.ui.selection, visible));
    }, "change");
    if (!visible) {
      store.clearSelection();
      toast(
        `${result.changed} item${result.changed === 1 ? "" : "s"} hidden. Hidden items are excluded from PDF, PNG and CSV export.`,
        "info",
      );
    } else {
      toast(
        `${result.changed} item${result.changed === 1 ? "" : "s"} shown.${
          result.skippedLayerHidden
            ? ` ${result.skippedLayerHidden} remain hidden because their layer is hidden.`
            : ""
        }`,
        result.skippedLayerHidden ? "warning" : "success",
      );
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
      toast("The layer is locked. Unlock the layer first.", "warning");
      return;
    }
    const result = emptyItemCommandResult();
    store.mutate((project) => {
      Object.assign(result, setItemsLocked(project, store.ui.selection, locked));
    }, "change");
    if (locked) {
      toast(`${result.changed} item${result.changed === 1 ? "" : "s"} locked.`, "success");
    } else {
      toast(
        `${result.changed} item${result.changed === 1 ? "" : "s"} unlocked.${
          result.skippedLayerLocked
            ? ` ${result.skippedLayerLocked} still locked by their layer.`
            : ""
        }`,
        result.skippedLayerLocked ? "warning" : "success",
      );
    }
  }

  private async duplicatePageFlow(page: number): Promise<void> {
    const project = store.project;
    if (!project) return;
    const total = totalPageCount(project.documents);
    const target = Math.max(1, Math.min(total, Math.round(page)));
    const sourceName = pageDisplayName(project, target);
    const defaultName = sourceName ? `${sourceName} copy` : `Page ${target} copy`;
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
      toast("The page could not be duplicated.", "warning");
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
    toast(`Page ${target} duplicated as Page ${result.page}.`, "success");
  }

  private async deletePageFlow(page: number): Promise<void> {
    const project = store.project;
    if (!project) return;
    const source = projectDocumentForPage(project, page);
    const total = totalPageCount(project.documents);
    if (total <= 1) {
      toast("A project must keep at least one page.", "warning");
      return;
    }
    const target = Math.max(1, Math.min(total, Math.round(page)));
    const pageName = pageDisplayName(project, target);
    const confirmed = await confirmDialog(
      "Delete page",
      `Delete ${pageName ? `“${pageName}” (Page ${target})` : `page ${target}`}${source ? ` from “${source.name}”` : ""}? Measurements and page scale on this page will be removed. Measurements and page state on later pages move down one page number. This cannot be undone.`,
      "Delete page",
      { danger: true },
    );
    if (!confirmed) return;
    const result = store.deletePage(target);
    if (!result) {
      toast("The page could not be deleted.", "warning");
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
    toast(`Page ${target} deleted.`, "info");
  }

  private setSelectionStrokeWidth(width: number): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    if (!Number.isFinite(width) || width <= 0) return;
    const resolved = resolveSelection(project, store.ui.selection);
    const editable = resolved.filter((entry) => !entry.locked);
    if (!editable.length) {
      toast("The selected items are locked.", "warning");
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
      toast("The selected item is locked.", "warning");
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
      toast("The selected measurements are locked.", "warning");
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
        `${result.updated} measurement${result.updated === 1 ? "" : "s"} updated. ${result.skippedLocked} locked skipped.`,
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
        const result = await saveTextFile(json, suggested, PROJECT_FILTERS, {
          forbiddenPaths: protectedPaths,
        });
        if (!result) return false;
        store.markSaved(null);
        toast("Project downloaded.", "success");
        return true;
      }

      let path = store.projectPath;
      if (saveAs || !path) {
        const chosen = await chooseSavePath(suggested, PROJECT_FILTERS);
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
      toast("Project saved.", "success");
      return true;
    } catch (error) {
      await messageDialog("Could not save project", errorMessage(error), "warning");
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
        const result = await saveTextFile(serializeProject(project), suggested, PROJECT_FILTERS, {
          forbiddenPaths: protectedPaths,
        });
        if (!result) return false;
        toast("Copy downloaded.", "success");
        return true;
      }

      const path = await chooseSavePath(suggested, PROJECT_FILTERS);
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
      toast(`Copy saved to ${basename(path)}.`, "success");
      return true;
    } catch (error) {
      await messageDialog("Could not save a copy", errorMessage(error), "warning");
      return false;
    }
  }

  private packageHost(): PackageHost {
    return {
      confirmDiscard: () =>
        this.confirmUnsavedChanges("Opening a package will replace the current project."),
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
      throw new Error("The extracted project was not opened. Relink its drawings and try again.");
    }
  }

  private async createPackageDrawingPdf(project: Project): Promise<Uint8Array | null> {
    if (!this.renderer) throw new Error("The source PDF is not available.");
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
      const value = name.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (!commit || !value || value === original) {
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
        panel.setStatus(`OCR page ${page} of ${index.pageCount}…`);
        const ocr = await runOcrPage(project, page, renderer, (message, progress) => {
          if (token !== this.ocrToken) return;
          panel.setStatus(
            `OCR page ${page} of ${index.pageCount}: ${message} ${Math.round(progress * 100)}%`,
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
        panel.setStatus("Every page already has searchable text.");
      } else {
        this.runSearch(this.searchQuery);
        panel.setStatus(`OCR indexed ${scanned} page${scanned === 1 ? "" : "s"}.`);
        toast(`OCR indexed ${scanned} page${scanned === 1 ? "" : "s"}.`, "success");
      }
    } catch (error) {
      if (!this.disposed && token === this.ocrToken) {
        await messageDialog("OCR failed", errorMessage(error), "warning");
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
      toast("No recovery snapshot was found.", "info");
      return;
    }
    let project: Project;
    try {
      project = parseProject(JSON.stringify(payload.project));
    } catch (error) {
      await messageDialog("Could not restore session", errorMessage(error), "warning");
      return;
    }
    await this.loadProjectData(project, payload.projectPath, true);
  }

  private async openRecent(entry: RecentEntry): Promise<void> {
    if (!isTauri) {
      toast("Recent files are available in the desktop app.", "info");
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
      await messageDialog("Could not open recent file", errorMessage(error), "warning");
    }
  }

  private async openPath(path: string): Promise<void> {
    const lower = path.toLowerCase();
    try {
      if (lower.endsWith(".pdf") || lower.endsWith(".tif") || lower.endsWith(".tiff")) {
        const bytes = await readFileBytes(path);
        await this.loadNewPdf(bytes, basename(path), path);
      } else if (lower.endsWith(".gridscalr") || lower.endsWith(".json")) {
        const text = await readFileText(path);
        await this.loadProjectText(text, path);
      } else {
        toast("Drop a PDF or TIF drawing, or a .gridscalr project.", "warning");
      }
    } catch (error) {
      await messageDialog("Could not open dropped file", errorMessage(error), "warning");
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
        toast("Drop a PDF or TIF drawing, or a .gridscalr project.", "warning");
      }
    } catch (error) {
      await messageDialog("Could not open dropped file", errorMessage(error), "warning");
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
        console.warn("Native drag and drop is unavailable", error);
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
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onWindowBlur);
    window.removeEventListener("paste", this.onPaste);
    this.unlistenClose?.();
    this.unlistenClose = null;
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
  if (error instanceof Error) return error.message;
  return String(error);
}

function describePages(count: number, total: number): string {
  if (count === total) return total === 1 ? "1 page" : `${total} pages`;
  return `${count} of ${total} pages`;
}
