import type { PDFDocumentProxy } from "pdfjs-dist";
import { CanvasView } from "../canvas/CanvasView";
import {
  clearPageCalibration,
  pageCalibration,
} from "../model/calibration";
import { copyItems, duplicateItems, hasClipboard, pasteItems } from "../model/clipboard";
import {
  createProject,
  findItem,
  isMeasurementKind,
  itemIsLocked,
  itemIsVisible,
  moveItemsToLayer,
} from "../model/layers";
import { applyMeasurementBulkEdit } from "../model/bulkEdit";
import type { MeasurementBulkPatch, MeasurementBulkResult } from "../model/bulkEdit";
import { itemKindLabel, itemMetrics } from "../model/measure";
import { resolveSelection } from "../model/selection";
import type {
  AreaMode,
  CountType,
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
  suggestedProjectName,
} from "../io/projectFile";
import {
  addRecent,
  basename,
  chooseSavePath,
  isTauri,
  pathExists,
  pickPdf,
  pickProject,
  readFileBytes,
  readFileText,
  saveBinaryFile,
  saveTextFile,
  sha256Hex,
  writeTextFile,
} from "../io/platform";
import {
  loadPdfDocument,
  PasswordRequiredError,
  PdfPasswordError,
  PdfRenderer,
} from "../pdf/pdfRenderer";
import { exportProjectPdf } from "../pdf/pdfExport";
import { store, type ToolId } from "../state/store";
import { isEditableTarget } from "../ui/dom";
import { confirmDialog, messageDialog, passwordDialog } from "../ui/dialogs";
import {
  renderChrome,
  renderTopbar,
  requestMarkupRename,
  showExportMenu,
  showSelectionMenuAt,
  updateStatus,
  type PanelActions,
} from "../ui/panels";
import { createShell, type ShellRefs } from "../ui/shell";
import { toast } from "../ui/toast";

const PROJECT_FILTERS = [{ name: "GridScalr project", extensions: ["gridscalr"] }];
const JSON_FILTERS = [{ name: "JSON project", extensions: ["json"] }];
const CSV_FILTERS = [{ name: "CSV markups", extensions: ["csv"] }];
const PNG_FILTERS = [{ name: "PNG image", extensions: ["png"] }];
const PDF_FILTERS = [{ name: "PDF document", extensions: ["pdf"] }];

const TOOL_KEYS: Record<string, ToolId> = {
  v: "select",
  h: "pan",
  k: "calibrate",
  l: "length",
  a: "area",
  c: "count",
  p: "pen",
  i: "line",
  u: "arrow",
  r: "rect",
  o: "ellipse",
  g: "highlight",
  t: "text",
};

interface SizeTask {
  page: number;
  renderer: PdfRenderer;
  epoch: number;
  resolve: (value: PageSize | undefined) => void;
}

export class App {
  private refs: ShellRefs;
  private canvas: CanvasView;
  private actions: PanelActions;
  private renderer: PdfRenderer | null = null;
  private pageSizes = new Map<number, PageSize>();
  private pageSizePromises = new Map<number, Promise<PageSize | undefined>>();
  private sizeQueue: SizeTask[] = [];
  private sizeActive = 0;
  private sizeEpoch = 0;
  private unsubscribe: () => void;
  private disposed = false;

  constructor(root: HTMLElement) {
    this.refs = createShell(root);
    this.actions = {
      openPdf: () => void this.openPdfFlow(),
      openProject: () => void this.openProjectFlow(),
      saveProject: () => void this.saveProjectFlow(false),
      exportAs: (kind) => void this.exportAs(kind),
      startCalibration: () => this.startCalibration(),
      clearCalibration: () => void this.clearCalibrationFlow(),
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
      setSelectionCategory: (categoryId) => this.setSelectionCategory(categoryId),
      setSelectionRoom: (room) => this.setSelectionRoom(room),
      setSelectionAreaMode: (mode) => this.setSelectionAreaMode(mode),
      setSelectionCountType: (type) => this.setSelectionCountType(type),
      goToPage: (page, fit = true) => void this.goToPage(page, fit),
      navigateToItem: (page, layerId, itemId) => void this.navigateToItem(page, layerId, itemId),
      ensurePageSize: (page) => void this.enqueuePageSize(page),
      getPageSize: (page) => this.pageSizes.get(page),
      refresh: () => this.renderAll(),
      restoreAutosave: () => void this.restoreAutosave(),
      getAutosave: () => store.readAutosave(),
      openRecent: (entry) => void this.openRecent(entry),
    };

    this.canvas = new CanvasView(this.refs.canvasHost, {
      getRenderer: () => this.renderer,
      getPageSize: (page) => this.pageSizes.get(page),
      ensurePageSize: (page) => void this.enqueuePageSize(page),
      onError: (message) => toast(message, "error"),
      onContextMenu: ({ clientX, clientY }) =>
        showSelectionMenuAt(clientX, clientY, this.actions),
    });

    this.unsubscribe = store.subscribe((reason) => {
      if (this.disposed) return;
      if (reason === "cursor") {
        updateStatus(this.refs);
        return;
      }
      if (reason === "view") {
        renderTopbar(this.refs, this.actions);
        updateStatus(this.refs);
        this.updateTitle();
        return;
      }
      this.renderAll();
    });

    this.bind();
    this.renderAll();
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
    refs.openPdfBtn.addEventListener("click", () => void this.openPdfFlow());
    refs.openProjectBtn.addEventListener("click", () => void this.openProjectFlow());
    refs.saveBtn.addEventListener("click", () => void this.saveProjectFlow(false));
    refs.exportBtn.addEventListener("click", () => showExportMenu(refs.exportBtn, this.actions));

    refs.undoBtn.addEventListener("click", () => store.undo());
    refs.redoBtn.addEventListener("click", () => store.redo());
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
  }

  private onWindowBlur = (): void => {
    this.canvas.setSpaceDown(false);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === "Space") this.canvas.setSpaceDown(false);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.disposed) return;
    if (document.querySelector(".modal-backdrop")) return;
    if (isEditableTarget(event.target)) return;

    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (mod) {
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
        case "v":
          event.preventDefault();
          this.pasteSelection();
          return;
        case "o":
          event.preventDefault();
          if (event.shiftKey) void this.openProjectFlow();
          else void this.openPdfFlow();
          return;
        case "e":
          event.preventDefault();
          showExportMenu(this.refs.exportBtn, this.actions);
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

    if (key === "?" || (event.shiftKey && key === "/")) {
      event.preventDefault();
      void messageDialog(
        "Keyboard shortcuts",
        "Tools: V select · H pan · K calibrate · L length · A area · C count · P pen · I line · U arrow · R rectangle · O ellipse · G highlight · T text. " +
          "Editing: Enter finish · Esc cancel/clear · Delete remove · arrows nudge · Ctrl+C/X/V copy, cut and paste · Ctrl+Z undo · Ctrl+Shift+Z redo. " +
          "View: Ctrl+wheel zoom · Space+drag pan · Ctrl+0 fit · Ctrl+1 actual size · PageUp/PageDown change page.",
      );
    }
  };

  private startCalibration(): void {
    if (!store.project) return;
    store.setTool("calibrate");
    toast("Calibration: click the two ends of a known dimension.", "info");
  }

  private async clearCalibrationFlow(): Promise<void> {
    const project = store.project;
    if (!project) return;
    const page = store.ui.page;
    if (!pageCalibration(project, page)) return;
    const confirmed = await confirmDialog(
      "Clear scale",
      `Remove the calibration from page ${page}? Existing measurements keep the scale they were created with, but new measurements will be uncalibrated.`,
      "Clear scale",
      { danger: true },
    );
    if (!confirmed) return;
    store.mutate(
      (project) => {
        clearPageCalibration(project, page);
      },
      "change",
    );
    toast("Page scale cleared.", "info");
  }

  private async openPdfFlow(): Promise<void> {
    try {
      const picked = await pickPdf();
      if (!picked) return;
      await this.loadNewPdf(picked.bytes, picked.name, picked.path);
    } catch (error) {
      await messageDialog("Could not open PDF", errorMessage(error), "warning");
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

  private async confirmReplaceProject(): Promise<boolean> {
    if (!store.project || !store.dirty) return true;
    return confirmDialog(
      "Discard unsaved changes?",
      "The current project has unsaved changes. Opening another file will replace it and discard those changes.",
      "Discard changes",
      { danger: true },
    );
  }

  private async loadNewPdf(bytes: Uint8Array, name: string, path: string | null): Promise<void> {
    if (!(await this.confirmReplaceProject())) return;
    const document = await this.openDocument(bytes, name);
    if (!document) return;
    const hash = await this.hashBytes(bytes);
    const project = createProject({
      name,
      path,
      relativePath: null,
      sha256: hash,
      pageCount: document.numPages,
      sizeBytes: bytes.byteLength,
    });
    await this.installDocument(document, project, null, false);
    if (path) {
      addRecent({ kind: "pdf", path, name, at: new Date().toISOString() });
    }
    toast(`Opened ${name}`, "success");
  }

  private async loadProjectText(text: string, projectPath: string | null): Promise<void> {
    if (!(await this.confirmReplaceProject())) return;
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
    let pdfPath = project.document.path;
    let bytes: Uint8Array | null = null;
    let pickedName: string | null = null;

    if (isTauri) {
      const candidates: string[] = [];
      if (project.document.path) candidates.push(project.document.path);
      if (projectPath && project.document.relativePath) {
        const resolved = resolveRelativePath(projectPath, project.document.relativePath);
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
      pickedName = picked.name;
    }

    const hash = await this.hashBytes(bytes);
    if (project.document.sha256 && hash && project.document.sha256 !== hash) {
      const proceed = await confirmDialog(
        "PDF checksum changed",
        `The PDF file “${project.document.name}” no longer matches the checksum stored in this project. It may have been replaced or edited. Continue and update the checksum?`,
        "Open anyway",
        { danger: true },
      );
      if (!proceed) return;
    }

    const document = await this.openDocument(bytes, project.document.name);
    if (!document) return;

    if (project.document.pageCount !== document.numPages) {
      toast(
        `The PDF now has ${document.numPages} page${document.numPages === 1 ? "" : "s"} instead of ${project.document.pageCount}.`,
        "warning",
      );
    }

    project.document.path = isTauri ? pdfPath : null;
    project.document.relativePath = null;
    project.document.sizeBytes = bytes.byteLength;
    if (pickedName) project.document.name = pickedName;
    if (hash) project.document.sha256 = hash;

    await this.installDocument(document, project, projectPath, dirty);
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

  private async installDocument(
    document: PDFDocumentProxy,
    project: Project,
    projectPath: string | null,
    dirty: boolean,
  ): Promise<void> {
    const previous = this.renderer;
    this.renderer = new PdfRenderer(document);
    this.sizeEpoch++;
    this.pageSizes.clear();
    this.pageSizePromises.clear();
    this.sizeQueue = [];
    if (previous) {
      try {
        await previous.destroy();
      } catch {
        // The old document may already be closed.
      }
    }
    project.document.pageCount = document.numPages;
    if (projectPath && project.document.path) {
      project.document.relativePath = relativeDocumentPath(projectPath, project.document.path);
    }
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
    const target = Math.max(1, Math.min(project.document.pageCount, Math.round(page)));
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
    const target = Math.max(1, Math.min(project.document.pageCount, Math.round(page)));
    const selection = store.primarySelection;
    if (
      target === store.ui.page &&
      store.ui.selection.length === 1 &&
      selection?.layerId === layerId &&
      selection.itemId === itemId
    ) {
      this.canvas.fitPage();
      this.canvas.invalidate();
      return;
    }
    if (target !== store.ui.page) store.setPage(target);
    await this.enqueuePageSize(target);
    this.canvas.fitPage();
    store.setSelection({ layerId, itemId });
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
    const count = copyItems(project, removable.map((entry) => entry.ref));
    if (!count) return;
    store.mutate(
      (project) => {
        for (const entry of removable) {
          const layer = project.layers.find((candidate) => candidate.id === entry.ref.layerId);
          if (!layer) continue;
          layer.items = layer.items.filter((item) => item.id !== entry.ref.itemId);
        }
      },
      "change",
    );
    store.clearSelection();
    toast(
      `${count} item${count === 1 ? "" : "s"} cut. Paste on any page with Ctrl+V.`,
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
    store.mutate(
      (project) => {
        refs = pasteItems(project, store.ui.page);
      },
      "change",
    );
    if (!refs.length) {
      toast("Could not paste these items on this page.", "warning");
      return;
    }
    store.setSelectionMany(refs);
    toast(`${refs.length} item${refs.length === 1 ? "" : "s"} pasted.`, "success");
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
    store.mutate(
      (project) => {
        refs = duplicateItems(project, store.ui.selection, 12);
      },
      "change",
    );
    if (refs.length) store.setSelectionMany(refs);
  }

  private moveSelectionToLayer(layerId: string): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    let result = { moved: 0, skipped: 0, mixedKinds: false };
    store.mutate(
      (project) => {
        result = moveItemsToLayer(project, store.ui.selection, layerId);
      },
      "change",
    );
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
      ? resolved.filter((entry) => entry.layer.visible)
      : resolved;
    if (!targetable.length) {
      toast("The layer is hidden. Show the layer first.", "warning");
      return;
    }
    store.mutate(
      (project) => {
        for (const entry of targetable) {
          const item = findItem(project, entry.ref.itemId)?.item;
          if (item) item.visible = visible;
        }
      },
      "change",
    );
    if (!visible) {
      store.clearSelection();
      toast(
        `${targetable.length} item${targetable.length === 1 ? "" : "s"} hidden. Hidden items are excluded from PDF, PNG and CSV export.`,
        "info",
      );
    } else {
      const stillHidden = resolved.length - targetable.length;
      toast(
        `${targetable.length} item${targetable.length === 1 ? "" : "s"} shown.${stillHidden ? ` ${stillHidden} remain hidden because their layer is hidden.` : ""}`,
        stillHidden ? "warning" : "success",
      );
    }
  }

  private setSelectionLocked(locked: boolean): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    const resolved = resolveSelection(project, store.ui.selection);
    const targetable = locked
      ? resolved
      : resolved.filter((entry) => !entry.layer.locked);
    if (!targetable.length) {
      toast("The layer is locked. Unlock the layer first.", "warning");
      return;
    }
    store.mutate(
      (project) => {
        for (const entry of targetable) {
          const item = findItem(project, entry.ref.itemId)?.item;
          if (item) item.locked = locked;
        }
      },
      "change",
    );
    if (locked) {
      toast(
        `${targetable.length} item${targetable.length === 1 ? "" : "s"} locked.`,
        "success",
      );
    } else {
      const stillLocked = resolved.length - targetable.length;
      toast(
        `${targetable.length} item${targetable.length === 1 ? "" : "s"} unlocked.${stillLocked ? ` ${stillLocked} still locked by their layer.` : ""}`,
        stillLocked ? "warning" : "success",
      );
    }
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
    store.mutate(
      (project) => {
        for (const entry of editable) {
          const item = findItem(project, entry.ref.itemId)?.item;
          if (item) item.color = color;
        }
      },
      "change",
    );
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
    store.mutate(
      (project) => {
        result = applyMeasurementBulkEdit(project, store.ui.selection, patch);
      },
      "change",
    );
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

  private async saveProjectFlow(saveAs: boolean): Promise<void> {
    const project = store.project;
    if (!project) return;
    try {
      const suggested = suggestedProjectName(project);
      if (!isTauri) {
        project.document.relativePath = null;
        const json = serializeProject(project);
        const result = await saveTextFile(json, suggested, PROJECT_FILTERS);
        if (!result) return;
        store.markSaved(null);
        toast("Project downloaded.", "success");
        return;
      }

      let path = store.projectPath;
      if (saveAs || !path) {
        const chosen = await chooseSavePath(suggested, PROJECT_FILTERS);
        if (!chosen) return;
        path = chosen;
      }
      project.document.relativePath = relativeDocumentPath(path, project.document.path);
      const json = serializeProject(project);
      await writeTextFile(path, json);
      store.markSaved(path);
      addRecent({
        kind: "project",
        path,
        name: basename(path),
        at: new Date().toISOString(),
      });
      toast("Project saved.", "success");
    } catch (error) {
      await messageDialog("Could not save project", errorMessage(error), "warning");
    }
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
      store.mutate(
        (current) => {
          current.name = value;
        },
        "change",
      );
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

  private async exportAs(kind: "csv" | "json" | "png" | "pdf"): Promise<void> {
    const project = store.project;
    if (!project) return;
    const safe = project.name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "gridscalr";
    try {
      if (kind === "csv") {
        const rows: string[][] = [
          ["Page", "Type", "Layer", "Label", "Value", "Unit", "Details", "Points"],
        ];
        for (const layer of project.layers) {
          if (!layer.visible) continue;
          for (const item of layer.items) {
            if (!itemIsVisible(item, layer)) continue;
            const metrics = itemMetrics(item, project);
            rows.push([
              String(item.page),
              itemKindLabel(item.kind),
              layer.name,
              item.label ?? "",
              metrics?.primary ?? item.text ?? "",
              metrics?.unit ?? "",
              metrics?.secondary ?? "",
              item.points.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join("; "),
            ]);
          }
        }
        const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
        const path = await saveTextFile(csv, `${safe}-markups.csv`, CSV_FILTERS);
        if (path) toast("Markups exported to CSV.", "success");
        return;
      }

      if (kind === "json") {
        const json = serializeProject(project);
        const path = await saveTextFile(json, `${safe}.json`, JSON_FILTERS);
        if (path) toast("Project exported to JSON.", "success");
        return;
      }

      if (kind === "pdf") {
        if (!this.renderer) throw new Error("The source PDF is not available.");
        try {
          const bytes = await exportProjectPdf(project, this.renderer);
          const path = await saveBinaryFile(
            bytes,
            `${safe}-markups.pdf`,
            PDF_FILTERS,
            "application/pdf",
            project.document.path,
          );
          if (path) toast("Flattened PDF exported.", "success");
        } catch (error) {
          if (error instanceof Error && /encrypt/i.test(error.message)) {
            await messageDialog(
              "Cannot export this PDF",
              "The source PDF is encrypted, so it cannot be flattened without its owner password. Open an unencrypted copy and try again.",
              "warning",
            );
            return;
          }
          throw error;
        }
        return;
      }

      const canvas = this.canvas.getCompositeCanvas();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("The canvas could not be exported.");
      const path = await saveBinaryFile(
        new Uint8Array(await blob.arrayBuffer()),
        `${safe}.png`,
        PNG_FILTERS,
        "image/png",
      );
      if (path) toast("View exported as PNG.", "success");
    } catch (error) {
      await messageDialog("Export failed", errorMessage(error), "warning");
    }
  }

  private async restoreAutosave(): Promise<void> {
    const payload = store.readAutosave();
    if (!payload) return;
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
      if (lower.endsWith(".pdf")) {
        const bytes = await readFileBytes(path);
        await this.loadNewPdf(bytes, basename(path), path);
      } else if (lower.endsWith(".gridscalr") || lower.endsWith(".json")) {
        const text = await readFileText(path);
        await this.loadProjectText(text, path);
      } else {
        toast("Drop a PDF drawing or a .gridscalr project.", "warning");
      }
    } catch (error) {
      await messageDialog("Could not open dropped file", errorMessage(error), "warning");
    }
  }

  private async openDroppedFile(file: File): Promise<void> {
    try {
      if (file.name.toLowerCase().endsWith(".pdf")) {
        await this.loadNewPdf(new Uint8Array(await file.arrayBuffer()), file.name, null);
      } else if (
        file.name.toLowerCase().endsWith(".gridscalr") ||
        file.name.toLowerCase().endsWith(".json")
      ) {
        await this.loadProjectText(await file.text(), null);
      } else {
        toast("Drop a PDF drawing or a .gridscalr project.", "warning");
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

  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onWindowBlur);
    this.canvas.destroy();
    if (this.renderer) void this.renderer.destroy();
  }
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
