import {
  deletePage as deletePageRecord,
  duplicatePage as duplicatePageRecord,
  insertPage as insertPageRecord,
  movePage as movePageRecord,
  movePages as movePagesRecord,
  type DeletePageSummary,
  type DuplicatePageOptions,
  type DuplicatePageSummary,
} from "../features/pageModel";
import { includedLocalPages } from "../model/documents";
import {
  currentPageId,
  ensurePageState,
  makePageId,
  pageNumber,
  pageRecordById,
} from "../model/pages";
import { normalizeColor } from "../model/color";
import type { CloudFillPreset } from "../model/cloud";
import type { ArrowHeads, SheetPaperSize } from "../model/types";
import { DEFAULT_DRAWING_STROKE_WIDTH, mergeDrawStyle, mergeLineStyle } from "../model/style";
import { DEFAULT_LINE_TYPE_ID } from "../model/lineTypes";
import { DEFAULT_SYMBOL_ID } from "../model/symbols";
import { addLayer, ensureActiveLayer, findItem } from "../model/layers";
import {
  addCategory as addCategoryToProject,
  categoryNameError,
  countCategoryItems,
  findCategory,
  moveCategory as moveCategoryInProject,
  removeCategory as removeCategoryFromProject,
  renameCategory as renameCategoryInProject,
  setDefaultCategory as setDefaultCategoryInProject,
} from "../model/categories";
import type { RemoveCategoryResult } from "../model/categories";
import { selectionKey, uniqueSelectionRefs } from "../model/selection";
import { resolveViewOnlyTool } from "../features/viewOnly";
import { pushHistory } from "./history";
import type {
  AreaMode,
  PageId,
  AreaShape,
  HighlightShape,
  Category,
  CountType,
  DocumentRef,
  ImageAsset,
  InspectionStatus,
  LayerKind,
  OcrPage,
  Point,
  Project,
  SelectionRef,
} from "../model/types";

export type ToolId =
  | "select"
  | "pan"
  | "calibrate"
  | "length"
  | "area"
  | "count"
  | "radius"
  | "diameter"
  | "arc"
  | "angle"
  | "slope"
  | "volume"
  | "pen"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "highlight"
  | "text"
  | "textbox"
  | "polyline"
  | "rail"
  | "cloud"
  | "callout"
  | "stamp"
  | "delta"
  | "symbol";

export type LeftTab = "pages" | "layers" | "symbols";

/**
 * Tools armed from the symbol library keep that tab open so the tile stays
 * visibly selected, including for library-only operation-card tools such as
 * the I/O rail.
 */
const LIBRARY_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(["symbol", "rail"]);

export interface DrawStyle {
  color: string;
  strokeWidth: number;
  fillOpacity: number;
  fontSize: number;
  /** Fill mode for new rectangles and ellipses. */
  shapeFill: "outline" | "filled";
  /** Whether new shape outlines are dashed. */
  dashed: boolean;
}

export interface UIState {
  activeTool: ToolId;
  page: number;
  zoom: number;
  panX: number;
  panY: number;
  selection: SelectionRef[];
  hover: { layerId: string; itemId: string; vertexIndex: number } | null;
  cursor: Point | null;
  leftTab: LeftTab;
  style: DrawStyle;
  /** Text used by the next stamp or revision delta. */
  stampText: string;
  deltaText: string;
  highlightShape: HighlightShape;
  cloudText: boolean;
  cloudFill: CloudFillPreset;
  arrowHeads: ArrowHeads;
  /** Category for new measurements. null means the project default. */
  measureCategoryId: string | null;
  /** Sticky room for new measurements, trimmed when an item is created. */
  measureRoom: string;
  /** Sticky object type for new count measurements. */
  measureCountType: CountType;
  /** Sticky pieces per count object for new count measurements. */
  measureCountQuantity: number;
  /** Sticky add/subtract mode for new area measurements. */
  measureAreaMode: AreaMode;
  /** Sticky quick-area shape for the area tool. */
  measureAreaShape: AreaShape;
  /** Symbol used by the next placement. */
  symbolId: string;
  /** Sticky inspection status for new symbols. null means Not assessed. */
  symbolStatus: InspectionStatus | null;
  /** Sticky line type for new schematic polylines. */
  lineTypeId: string;
  /** Editable line style for the next pipe/duct run. */
  lineStyle: { color: string; widthPt: number; dashed: boolean };
}

export type ChangeReason =
  | "project"
  | "change"
  | "view"
  | "page"
  | "tool"
  | "selection"
  | "cursor"
  | "layers"
  | "save"
  | "undo";

type Listener = (reason: ChangeReason) => void;

/** Runtime-only fingerprint of the file the editor loaded. Never serialized. */
export interface FileStamp {
  sha256: string;
  sizeBytes: number;
  modifiedAt: number;
}

/** Runtime autosave state consumed by the status bar and diagnostics. */
export interface AutosaveFailure {
  message: string;
  quotaExceeded: boolean;
}

export function toolLayerKind(tool: ToolId): LayerKind | null {
  switch (tool) {
    case "length":
    case "area":
    case "count":
    case "radius":
    case "diameter":
    case "arc":
    case "angle":
    case "slope":
    case "volume":
    case "calibrate":
      return "measure";
    case "pen":
    case "line":
    case "arrow":
    case "rect":
    case "ellipse":
    case "highlight":
    case "text":
    case "textbox":
    case "polyline":
    case "rail":
    case "cloud":
    case "callout":
    case "stamp":
    case "delta":
    case "symbol":
      return "draw";
    case "pan":
    case "select":
      return null;
    default:
      return null;
  }
}

function defaultUI(): UIState {
  return {
    activeTool: "select",
    page: 1,
    zoom: 1,
    panX: 0,
    panY: 0,
    selection: [],
    hover: null,
    cursor: null,
    leftTab: "pages",
    style: {
      color: "#f2a93b",
      strokeWidth: DEFAULT_DRAWING_STROKE_WIDTH,
      fillOpacity: 0.15,
      fontSize: 12,
      shapeFill: "outline",
      dashed: false,
    },
    stampText: "APPROVED",
    deltaText: "A",
    highlightShape: "stroke",
    cloudText: false,
    cloudFill: "none",
    arrowHeads: "end",
    measureCategoryId: null,
    measureRoom: "",
    measureCountType: "other",
    measureCountQuantity: 1,
    measureAreaMode: "add",
    measureAreaShape: "polygon",
    symbolId: DEFAULT_SYMBOL_ID,
    symbolStatus: null,
    lineTypeId: DEFAULT_LINE_TYPE_ID,
    lineStyle: { color: "#e30613", widthPt: 2, dashed: false },
  };
}

export class Store {
  project: Project | null = null;
  ui: UIState = defaultUI();
  projectPath: string | null = null;
  /** Expected disk state captured on open and after a verified save. */
  fileStamp: FileStamp | null = null;
  dirty = false;
  /**
   * View-only: inspection, export, package and Save a copy work, but no command
   * may change project data. The guards below and in the UI enforce it.
   */
  readOnly = false;
  /** Last recovery-snapshot error, consumed by the UI after an autosave attempt. */
  autosaveError: AutosaveFailure | null = null;
  /** Increments whenever project data changes, including undo and redo. */
  revision = 0;
  private listeners = new Set<Listener>();
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private gestureSnapshot: string | null = null;
  private assetPayloads = new Map<string, string>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(reason: ChangeReason): void {
    for (const listener of this.listeners) listener(reason);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  setProject(project: Project, projectPath: string | null, dirty = false): void {
    this.project = project;
    this.projectPath = projectPath;
    this.fileStamp = null;
    this.dirty = dirty;
    this.readOnly = false;
    this.autosaveError = null;
    this.revision += 1;
    this.clearHistory();
    this.assetPayloads.clear();
    if (!project.assets) project.assets = {};
    for (const asset of Object.values(project.assets)) {
      if (asset.data) this.assetPayloads.set(asset.id, asset.data);
    }
    this.ui.page = 1;
    this.ui.selection = [];
    this.ui.hover = null;
    this.ui.activeTool = "select";
    this.ui.cursor = null;
    this.ui.leftTab = "pages";
    this.ui.stampText = project.settings.stampPresets[0] ?? "APPROVED";
    this.ui.measureCategoryId = null;
    this.ui.measureRoom = "";
    this.ui.measureCountType = "other";
    this.ui.measureAreaMode = "add";
    this.ui.measureAreaShape = "polygon";
    this.ui.symbolId = DEFAULT_SYMBOL_ID;
    this.ui.lineTypeId = project.lineTypes.some((entry) => entry.id === this.ui.lineTypeId)
      ? this.ui.lineTypeId
      : (project.lineTypes[0]?.id ?? DEFAULT_LINE_TYPE_ID);
    const activeLineType = project.lineTypes.find((entry) => entry.id === this.ui.lineTypeId);
    if (activeLineType) {
      this.ui.lineStyle = {
        color: activeLineType.color,
        widthPt: activeLineType.widthPt,
        dashed: activeLineType.style === "dashed",
      };
    }
    this.ui.symbolStatus = null;
    this.emit("project");
  }

  closeProject(): void {
    this.project = null;
    this.projectPath = null;
    this.fileStamp = null;
    this.dirty = false;
    this.readOnly = false;
    this.autosaveError = null;
    this.revision += 1;
    this.clearHistory();
    this.assetPayloads.clear();
    this.ui = defaultUI();
    this.emit("project");
  }

  setReadOnly(readOnly: boolean): void {
    if (this.readOnly === readOnly) return;
    this.readOnly = readOnly;
    this.emit("save");
  }

  setView(zoom: number, panX: number, panY: number): void {
    this.ui.zoom = zoom;
    this.ui.panX = panX;
    this.ui.panY = panY;
    this.emit("view");
  }

  /**
   * Appends a source document. Document import is structural like opening a
   * file, so it clears the undo history instead of pretending to be undoable.
   * Pages are append-only; existing page indexes never move.
   */
  addDocument(document: DocumentRef): void {
    if (!this.project || this.readOnly) return;
    this.project.documents.push(document);
    for (const localPage of includedLocalPages(document)) {
      this.project.pages.push({
        id: makePageId(),
        documentId: document.id,
        localPage,
        state: {},
      });
    }
    this.clearHistory();
    this.dirty = true;
    this.revision += 1;
    this.emit("project");
  }

  /**
   * Applies an explicit source-storage change (managed copy, detach or
   * relink). It changes document references, not drawing geometry, but it
   * clears history so an older snapshot cannot silently restore the previous
   * source path over the new one.
   */
  applySourceStorageChange(mutate: (documents: DocumentRef[]) => void): void {
    if (!this.project || this.readOnly) return;
    mutate(this.project.documents);
    this.clearHistory();
    this.dirty = true;
    this.revision += 1;
    this.emit("project");
  }

  /** Changes a template sheet's paper. Structural like adding or deleting a page. */
  setTemplatePaper(pageId: PageId, paper: SheetPaperSize): void {
    if (!this.project || this.readOnly) return;
    const record = pageRecordById(this.project, pageId);
    const document = this.project.documents.find((entry) => entry.id === record?.documentId);
    if (!document?.template) return;
    document.template.paper = paper;
    this.clearHistory();
    this.dirty = true;
    this.revision += 1;
    this.emit("project");
  }

  /**
   * Clears undo and redo at an explicit structural boundary such as a page
   * delete, a duplicate, a document import or a source-storage change. A
   * snapshot from before the boundary cannot describe the new page or source
   * structure. Page reorder and page insert are undoable and never call this.
   */
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.gestureSnapshot = null;
  }

  /**
   * Deletes one page together with its items, its layer page state and any
   * layer that only pointed at it. Deleting stays an explicit, checkpointed
   * boundary rather than an undo step, so a history restore can never silently
   * bring back a page the user removed.
   */
  deletePage(pageId: PageId): DeletePageSummary | null {
    if (!this.project || this.readOnly) return null;
    const result = deletePageRecord(this.project, pageId);
    if (!result) return null;
    this.clearHistory();
    for (const assetId of [...this.assetPayloads.keys()]) {
      if (!this.project.assets[assetId]) this.assetPayloads.delete(assetId);
    }
    this.ui.page = result.nextPageId ? pageNumber(this.project, result.nextPageId) : 1;
    this.ui.selection = [];
    this.ui.hover = null;
    this.dirty = true;
    this.revision += 1;
    this.emit("project");
    return result;
  }

  /**
   * Applies one undoable page-list change. The before-snapshot is only pushed
   * when the change actually happened, so a drop that changes nothing adds no
   * empty undo step. Deleting, duplicating or replacing pages is a different,
   * explicit boundary that clears history instead.
   */
  private mutatePageList(change: (project: Project) => boolean): boolean {
    if (!this.project || this.readOnly) return false;
    const before = this.snapshot();
    if (!before) return false;
    if (!change(this.project)) return false;
    pushHistory(this.undoStack, before);
    this.redoStack = [];
    this.dirty = true;
    this.revision += 1;
    this.emit("project");
    return true;
  }

  /**
   * Page reorder. Display numbers change; every `PageId`, item and page-state
   * key stays attached to its page. Rearranging existing records is reversible
   * from a snapshot, so one drag is exactly one undo step.
   */
  reorderPage(pageId: PageId, targetIndex: number): boolean {
    return this.mutatePageList((project) => movePageRecord(project, pageId, targetIndex));
  }

  /**
   * Multi-page reorder. The whole selection moves as one block to
   * `insertionIndex`; one call is one undo step, regardless of page count.
   */
  reorderPages(pageIds: readonly PageId[], insertionIndex: number): boolean {
    return this.mutatePageList((project) => movePagesRecord(project, pageIds, insertionIndex));
  }

  /**
   * Inserts a new page record for an existing document page at an index. The
   * record keeps its own `PageId` and page state, so undo removes exactly that
   * page and redo restores it with the same identity.
   */
  insertPageRecord(pageId: PageId, index: number): PageId | null {
    if (!this.project || this.readOnly) return null;
    const source = pageRecordById(this.project, pageId);
    if (!source) return null;
    const before = this.snapshot();
    if (!before) return null;
    const record = insertPageRecord(this.project, {
      documentId: source.documentId,
      localPage: source.localPage,
      index,
    });
    if (!record) return null;
    pushHistory(this.undoStack, before);
    this.redoStack = [];
    this.ui.page = pageNumber(this.project, record.id);
    this.ui.selection = [];
    this.ui.hover = null;
    this.dirty = true;
    this.revision += 1;
    this.emit("project");
    return record.id;
  }

  setLineType(id: string): void {
    const lineType = this.project?.lineTypes.find((entry) => entry.id === id);
    if (!lineType) return;
    this.ui.lineTypeId = id;
    this.ui.lineStyle = {
      color: normalizeColor(lineType.color, this.ui.lineStyle.color),
      widthPt: lineType.widthPt,
      dashed: lineType.style === "dashed",
    };
    this.emit("tool");
  }

  setLineStyle(patch: Partial<UIState["lineStyle"]>): void {
    this.ui.lineStyle = mergeLineStyle(this.ui.lineStyle, patch);
    this.emit("tool");
  }

  setPage(page: number): void {
    if (!this.project) return;
    const clamped = Math.max(1, Math.min(Math.max(1, this.project.pages.length), Math.round(page)));
    if (clamped === this.ui.page) return;
    this.ui.page = clamped;
    this.ui.selection = [];
    this.ui.hover = null;
    this.emit("page");
  }

  setTool(tool: ToolId): void {
    const next = this.readOnly ? resolveViewOnlyTool(tool) : tool;
    if (this.readOnly && next === this.ui.activeTool) return;
    this.ui.activeTool = next;
    if (this.project && !this.readOnly) {
      const kind = toolLayerKind(tool);
      if (kind) {
        ensureActiveLayer(
          this.project,
          kind,
          currentPageId(this.project, this.ui.page) ?? undefined,
        );
        // Every markup tool targets a layer, so surface the Layers tab while
        // the user draws. Library tools keep the symbol library in view.
        this.ui.leftTab = LIBRARY_TOOLS.has(tool) ? "symbols" : "layers";
      }
    }
    this.emit("tool");
  }

  /** Arms a built-in symbol and keeps the Symbols tab open for repeated use. */
  selectSymbol(symbolId: string): void {
    this.ui.symbolId = symbolId;
    this.setTool("symbol");
  }

  setSymbolStatus(status: InspectionStatus | null): void {
    this.ui.symbolStatus = status;
    this.emit("tool");
  }

  setLeftTab(tab: LeftTab): void {
    this.ui.leftTab = tab;
    this.emit("change");
  }

  setStampText(text: string): void {
    this.ui.stampText = text;
    this.emit("tool");
  }

  setDeltaText(text: string): void {
    this.ui.deltaText = text;
    // Typing must not rebuild the context bar and steal focus.
    this.emit("cursor");
  }

  setHighlightShape(shape: HighlightShape): void {
    this.ui.highlightShape = shape;
    this.emit("tool");
  }

  setCloudText(enabled: boolean): void {
    this.ui.cloudText = enabled;
    this.emit("tool");
  }

  setCloudFill(preset: CloudFillPreset): void {
    this.ui.cloudFill = preset;
    this.emit("tool");
  }

  setArrowHeads(heads: ArrowHeads): void {
    this.ui.arrowHeads = heads;
    this.emit("tool");
  }

  get primarySelection(): SelectionRef | null {
    return this.ui.selection[0] ?? null;
  }

  setSelection(selection: SelectionRef | SelectionRef[] | null): void {
    this.setSelectionMany(
      selection === null ? [] : Array.isArray(selection) ? selection : [selection],
    );
  }

  setSelectionMany(selection: SelectionRef[]): void {
    const next = uniqueSelectionRefs(selection);
    if (
      next.length === this.ui.selection.length &&
      next.every((ref, index) => selectionKey(ref) === selectionKey(this.ui.selection[index]))
    ) {
      return;
    }
    this.ui.selection = next;
    this.emit("selection");
  }

  toggleSelection(ref: SelectionRef): void {
    const key = selectionKey(ref);
    if (this.ui.selection.some((entry) => selectionKey(entry) === key)) {
      this.setSelectionMany(this.ui.selection.filter((entry) => selectionKey(entry) !== key));
    } else {
      this.setSelectionMany([...this.ui.selection, ref]);
    }
  }

  isSelected(ref: SelectionRef): boolean {
    const key = selectionKey(ref);
    return this.ui.selection.some((entry) => selectionKey(entry) === key);
  }

  clearSelection(): void {
    this.setSelectionMany([]);
  }

  setHover(hover: UIState["hover"]): void {
    this.ui.hover = hover;
    this.emit("cursor");
  }

  setCursor(cursor: Point | null): void {
    this.ui.cursor = cursor;
    this.emit("cursor");
  }

  setStyle(style: Partial<DrawStyle>): void {
    this.ui.style = mergeDrawStyle(this.ui.style, style);
    this.emit("tool");
  }

  /**
   * Pending category and room are session state, not project data: they emit
   * "cursor" so typing a room name does not rebuild the panels and steal focus.
   */
  setMeasureCategory(categoryId: string | null): void {
    if (!this.project) return;
    if (categoryId !== null && !findCategory(this.project, categoryId)) return;
    if (this.ui.measureCategoryId === categoryId) return;
    this.ui.measureCategoryId = categoryId;
    this.emit("cursor");
  }

  setMeasureRoom(room: string): void {
    if (this.ui.measureRoom === room) return;
    this.ui.measureRoom = room;
    this.emit("cursor");
  }

  setMeasureCountType(type: CountType): void {
    if (this.ui.measureCountType === type) return;
    this.ui.measureCountType = type;
    this.emit("cursor");
  }

  setMeasureCountQuantity(quantity: number): void {
    if (!Number.isFinite(quantity)) return;
    const value = Math.max(1, Math.min(100000, Math.round(quantity)));
    if (this.ui.measureCountQuantity === value) return;
    this.ui.measureCountQuantity = value;
    this.emit("cursor");
  }

  setMeasureAreaMode(mode: AreaMode): void {
    if (this.ui.measureAreaMode === mode) return;
    this.ui.measureAreaMode = mode;
    this.emit("cursor");
  }

  setMeasureAreaShape(shape: AreaShape): void {
    if (this.ui.measureAreaShape === shape) return;
    this.ui.measureAreaShape = shape;
    this.emit("cursor");
  }

  setActiveLayer(layerId: string): void {
    if (!this.project || this.readOnly) return;
    if (!this.project.layers.some((l) => l.id === layerId)) return;
    this.project.activeLayerId = layerId;
    this.emit("layers");
  }

  createLayer(kind: LayerKind): void {
    if (!this.project) return;
    this.mutate((project) => {
      addLayer(project, kind, currentPageId(project, this.ui.page) ?? undefined);
    }, "layers");
  }

  /** Stores or clears derived OCR data without adding an undo step. */
  setPageOcr(pageId: PageId, ocr: OcrPage | undefined): void {
    if (!this.project || this.readOnly) return;
    const state = ensurePageState(this.project, pageId);
    if (!state) return;
    if (ocr) state.ocr = ocr;
    else delete state.ocr;
    this.dirty = true;
    this.revision += 1;
    this.emit("change");
  }

  renamePage(pageId: PageId, name: string): void {
    if (!this.project) return;
    const trimmed = name.trim().slice(0, 80);
    this.mutate((project) => {
      const state = ensurePageState(project, pageId);
      if (!state) return;
      if (trimmed) state.name = trimmed;
      else delete state.name;
    }, "change");
  }

  /**
   * Appends a duplicate of one page. Like importing a document, this is
   * structural and clears the undo history.
   */
  duplicatePage(pageId: PageId, options: DuplicatePageOptions): DuplicatePageSummary | null {
    if (!this.project || this.readOnly) return null;
    const result = duplicatePageRecord(this.project, pageId, options);
    if (!result) return null;
    this.clearHistory();
    this.ui.page = result.pageNumber;
    this.ui.selection = [];
    this.ui.hover = null;
    this.dirty = true;
    this.revision += 1;
    this.emit("project");
    return result;
  }

  addCategory(name: string): Category | null {
    if (!this.project) return null;
    if (categoryNameError(this.project.categories, name)) return null;
    let created: Category | null = null;
    this.mutate((project) => {
      created = addCategoryToProject(project, name);
    }, "change");
    return created;
  }

  renameCategory(id: string, name: string): boolean {
    if (!this.project) return false;
    if (!findCategory(this.project, id)) return false;
    if (categoryNameError(this.project.categories, name, id)) return false;
    this.mutate((project) => {
      renameCategoryInProject(project, id, name);
    }, "change");
    return true;
  }

  moveCategory(id: string, direction: -1 | 1): boolean {
    if (!this.project) return false;
    const index = this.project.categories.findIndex((category) => category.id === id);
    if (index < 0) return false;
    const target = index + direction;
    if (target < 0 || target >= this.project.categories.length) return false;
    this.mutate((project) => {
      moveCategoryInProject(project, id, direction);
    }, "change");
    return true;
  }

  removeCategory(id: string, targetId?: string): RemoveCategoryResult {
    if (!this.project) return { removed: false, moved: 0, reason: "missing" };
    if (!findCategory(this.project, id)) return { removed: false, moved: 0, reason: "missing" };
    if (this.project.categories.length <= 1) return { removed: false, moved: 0, reason: "last" };
    let result: RemoveCategoryResult = { removed: false, moved: 0 };
    this.mutate((project) => {
      result = removeCategoryFromProject(project, id, targetId);
    }, "change");
    return result;
  }

  setDefaultCategory(id: string): boolean {
    if (!this.project || !findCategory(this.project, id)) return false;
    if (this.project.settings.quantity.defaultCategoryId === id) return true;
    this.mutate((project) => {
      setDefaultCategoryInProject(project, id);
    }, "change");
    return true;
  }

  categoryItemCount(id: string): number {
    return this.project ? countCategoryItems(this.project, id) : 0;
  }

  setQuantityDefaults(patch: { wastePercent?: number; roundingStep?: number }): boolean {
    if (!this.project) return false;
    if (
      (patch.wastePercent !== undefined && !Number.isFinite(patch.wastePercent)) ||
      (patch.roundingStep !== undefined && !Number.isFinite(patch.roundingStep))
    ) {
      return false;
    }
    const quantity = this.project.settings.quantity;
    const wastePercent =
      patch.wastePercent === undefined
        ? quantity.wastePercent
        : Math.max(0, Math.min(100, patch.wastePercent));
    const roundingStep =
      patch.roundingStep === undefined ? quantity.roundingStep : Math.max(0, patch.roundingStep);
    if (wastePercent === quantity.wastePercent && roundingStep === quantity.roundingStep) {
      return true;
    }
    this.mutate((project) => {
      project.settings.quantity.wastePercent = wastePercent;
      project.settings.quantity.roundingStep = roundingStep;
    }, "change");
    return true;
  }

  setCategoryQuantityOverride(
    id: string,
    field: "wastePercent" | "roundingStep",
    value: number | null,
  ): boolean {
    const project = this.project;
    if (!project || !findCategory(project, id)) return false;
    if (value !== null && !Number.isFinite(value)) return false;
    const normalized =
      value === null
        ? undefined
        : field === "wastePercent"
          ? Math.max(0, Math.min(100, value))
          : Math.max(0, value);
    const category = findCategory(project, id);
    if (!category) return false;
    if (category[field] === normalized) return true;
    this.mutate((project) => {
      const target = findCategory(project, id);
      if (!target) return;
      if (normalized === undefined) delete target[field];
      else target[field] = normalized;
    }, "change");
    return true;
  }

  private snapshot(): string | null {
    if (!this.project) return null;
    const imagePayloads = new Set<string>();
    for (const asset of Object.values(this.project.assets ?? {})) {
      if (!asset.data) continue;
      this.assetPayloads.set(asset.id, asset.data);
      imagePayloads.add(asset.data);
    }
    return JSON.stringify(this.project, (_key, value) =>
      typeof value === "string" && imagePayloads.has(value) ? undefined : value,
    );
  }

  /** Keeps embedded image payloads available across undo and redo. */
  registerImageAsset(asset: ImageAsset): void {
    if (this.readOnly) return;
    this.assetPayloads.set(asset.id, asset.data);
  }

  private restoreSnapshot(snapshot: string): Project {
    const project = JSON.parse(snapshot) as Project;
    if (!project.assets) project.assets = {};
    for (const asset of Object.values(project.assets)) {
      if (asset.data) {
        this.assetPayloads.set(asset.id, asset.data);
      } else {
        const data = this.assetPayloads.get(asset.id);
        if (data) asset.data = data;
      }
    }
    return project;
  }

  mutate(
    mutator: (project: Project) => void,
    reason: ChangeReason = "change",
    options: { history?: boolean; dirty?: boolean } = {},
  ): void {
    if (!this.project || this.readOnly) return;
    const history = options.history !== false;
    if (history) {
      const before = this.snapshot();
      if (before) pushHistory(this.undoStack, before);
      this.redoStack = [];
    }
    mutator(this.project);
    this.revision += 1;
    if (options.dirty !== false) this.dirty = true;
    this.emit(reason);
  }

  beginGesture(): void {
    if (!this.project || this.readOnly) return;
    this.gestureSnapshot = this.snapshot();
  }

  endGesture(reason: ChangeReason = "change"): void {
    if (!this.gestureSnapshot || !this.project) {
      this.gestureSnapshot = null;
      return;
    }
    const after = this.snapshot();
    if (after && after !== this.gestureSnapshot) {
      pushHistory(this.undoStack, this.gestureSnapshot);
      this.redoStack = [];
      this.dirty = true;
      this.revision += 1;
      this.emit(reason);
    }
    this.gestureSnapshot = null;
  }

  cancelGesture(): void {
    if (this.gestureSnapshot && this.project) {
      this.project = this.restoreSnapshot(this.gestureSnapshot);
      this.revision += 1;
    }
    this.gestureSnapshot = null;
  }

  undo(): void {
    if (this.readOnly) return;
    const previous = this.undoStack.pop();
    if (!previous || !this.project) return;
    const visiblePageId = currentPageId(this.project, this.ui.page);
    pushHistory(this.redoStack, this.snapshot() ?? JSON.stringify(this.project));
    this.project = this.restoreSnapshot(previous);
    this.afterHistoryRestore(visiblePageId);
    this.emit("undo");
  }

  redo(): void {
    if (this.readOnly) return;
    const next = this.redoStack.pop();
    if (!next || !this.project) return;
    const visiblePageId = currentPageId(this.project, this.ui.page);
    pushHistory(this.undoStack, this.snapshot() ?? JSON.stringify(this.project));
    this.project = this.restoreSnapshot(next);
    this.afterHistoryRestore(visiblePageId);
    this.emit("undo");
  }

  /**
   * Restores view state after undo or redo. The visible page follows its
   * `PageId` while that page still exists, so undoing a reorder or a page
   * insert keeps the same drawing on screen. When the page is gone, the display
   * position is clamped instead. Display numbers are never stored references.
   */
  private afterHistoryRestore(visiblePageId: PageId | null): void {
    if (!this.project) return;
    this.revision += 1;
    this.dirty = true;
    const followed = visiblePageId ? pageNumber(this.project, visiblePageId) : 0;
    this.ui.page =
      followed > 0
        ? followed
        : Math.max(1, Math.min(Math.max(1, this.project.pages.length), this.ui.page));
    this.ui.selection = this.ui.selection.filter((ref) => {
      const found = findItem(this.project!, ref.itemId);
      return Boolean(found && found.layer.id === ref.layerId);
    });
    if (!this.project.layers.some((l) => l.id === this.project!.activeLayerId)) {
      this.project.activeLayerId = this.project.layers[0]?.id ?? "";
    }
  }

  markSaved(path: string | null): void {
    this.projectPath = path;
    this.dirty = false;
    this.emit("save");
  }
}

export const store = new Store();
