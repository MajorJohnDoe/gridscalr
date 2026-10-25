import { deletePageFromProject, totalPageCount, type DeletePageResult } from "../model/documents";
import type { CloudFillPreset } from "../model/cloud";
import type { ArrowHeads } from "../model/types";
import { DEFAULT_DRAWING_STROKE_WIDTH } from "../model/style";
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
import {
  clearAutosave as clearAutosaveStorage,
  readAutosavePreview,
  readAutosave as readAutosaveStorage,
  writeAutosave as writeAutosaveStorage,
  type AutosavePayload,
  type AutosavePreview,
} from "./autosave";
import type {
  AreaMode,
  AreaShape,
  HighlightShape,
  Category,
  CountType,
  DocumentRef,
  ImageAsset,
  LayerKind,
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
  | "pen"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "highlight"
  | "text"
  | "cloud"
  | "callout"
  | "stamp"
  | "delta";

export type LeftTab = "pages" | "layers";

export interface DrawStyle {
  color: string;
  strokeWidth: number;
  fillOpacity: number;
  fontSize: number;
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
  /** Sticky add/subtract mode for new area measurements. */
  measureAreaMode: AreaMode;
  /** Sticky quick-area shape for the area tool. */
  measureAreaShape: AreaShape;
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

const HISTORY_LIMIT = 80;

export type { AutosavePayload, AutosavePreview };

export function toolLayerKind(tool: ToolId): LayerKind | null {
  switch (tool) {
    case "length":
    case "area":
    case "count":
    case "calibrate":
      return "measure";
    case "pen":
    case "line":
    case "arrow":
    case "rect":
    case "ellipse":
    case "highlight":
    case "text":
    case "cloud":
    case "callout":
    case "stamp":
    case "delta":
      return "draw";
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
    measureAreaMode: "add",
    measureAreaShape: "polygon",
  };
}

export class Store {
  project: Project | null = null;
  ui: UIState = defaultUI();
  projectPath: string | null = null;
  dirty = false;
  /** Last recovery-snapshot error, consumed by the UI after an autosave attempt. */
  autosaveError: string | null = null;
  /** Increments whenever project data changes, including undo and redo. */
  revision = 0;
  private listeners = new Set<Listener>();
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private gestureSnapshot: string | null = null;
  private autosaveTimer: number | null = null;
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
    this.dirty = dirty;
    this.autosaveError = null;
    this.revision += 1;
    this.undoStack = [];
    this.redoStack = [];
    this.gestureSnapshot = null;
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
    this.emit("project");
    this.scheduleAutosave();
  }

  closeProject(): void {
    this.project = null;
    this.projectPath = null;
    this.dirty = false;
    this.autosaveError = null;
    this.revision += 1;
    this.undoStack = [];
    this.redoStack = [];
    this.assetPayloads.clear();
    this.ui = defaultUI();
    if (this.autosaveTimer !== null) {
      window.clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    this.emit("project");
    void this.clearAutosave();
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
    if (!this.project) return;
    this.project.documents.push(document);
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = true;
    this.revision += 1;
    this.emit("project");
    this.scheduleAutosave();
  }

  /**
   * Deletes one page and remaps measurements on later pages. Structural like
   * importing a document: the source files are untouched and the operation is
   * not added to the undo stack.
   */
  deletePage(page: number): DeletePageResult | null {
    if (!this.project) return null;
    const result = deletePageFromProject(this.project, page);
    if (!result) return null;
    this.undoStack = [];
    this.redoStack = [];
    this.gestureSnapshot = null;
    for (const assetId of [...this.assetPayloads.keys()]) {
      if (!this.project.assets[assetId]) this.assetPayloads.delete(assetId);
    }
    this.ui.page = result.page;
    this.ui.selection = [];
    this.ui.hover = null;
    this.dirty = true;
    this.revision += 1;
    this.emit("project");
    this.scheduleAutosave();
    return result;
  }

  setPage(page: number): void {
    if (!this.project) return;
    const clamped = Math.max(1, Math.min(totalPageCount(this.project.documents), Math.round(page)));
    if (clamped === this.ui.page) return;
    this.ui.page = clamped;
    this.ui.selection = [];
    this.ui.hover = null;
    this.emit("page");
  }

  setTool(tool: ToolId): void {
    this.ui.activeTool = tool;
    if (this.project) {
      const kind = toolLayerKind(tool);
      if (kind) {
        ensureActiveLayer(this.project, kind);
        // Every markup tool targets a layer, so surface the Layers tab while
        // the user draws. Select and Pan leave the current tab alone.
        this.ui.leftTab = "layers";
      }
    }
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
    this.ui.style = { ...this.ui.style, ...style };
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
    if (!this.project) return;
    if (!this.project.layers.some((l) => l.id === layerId)) return;
    this.project.activeLayerId = layerId;
    this.emit("layers");
  }

  createLayer(kind: LayerKind): void {
    if (!this.project) return;
    this.mutate((project) => {
      addLayer(project, kind);
    }, "layers");
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
      patch.roundingStep === undefined
        ? quantity.roundingStep
        : Math.max(0, patch.roundingStep);
    if (
      wastePercent === quantity.wastePercent &&
      roundingStep === quantity.roundingStep
    ) {
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
    options: { history?: boolean; dirty?: boolean; autosave?: boolean } = {},
  ): void {
    if (!this.project) return;
    const history = options.history !== false;
    if (history) {
      const before = this.snapshot();
      if (before) {
        this.undoStack.push(before);
        if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      }
      this.redoStack = [];
    }
    mutator(this.project);
    this.revision += 1;
    if (options.dirty !== false) this.dirty = true;
    this.emit(reason);
    if (options.autosave !== false) this.scheduleAutosave();
  }

  beginGesture(): void {
    if (!this.project) return;
    this.gestureSnapshot = this.snapshot();
  }

  endGesture(reason: ChangeReason = "change"): void {
    if (!this.gestureSnapshot || !this.project) {
      this.gestureSnapshot = null;
      return;
    }
    const after = this.snapshot();
    if (after && after !== this.gestureSnapshot) {
      this.undoStack.push(this.gestureSnapshot);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
      this.dirty = true;
      this.emit(reason);
      this.scheduleAutosave();
    }
    this.gestureSnapshot = null;
  }

  cancelGesture(): void {
    if (this.gestureSnapshot && this.project) {
      this.project = this.restoreSnapshot(this.gestureSnapshot);
    }
    this.gestureSnapshot = null;
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous || !this.project) return;
    this.redoStack.push(this.snapshot() ?? JSON.stringify(this.project));
    this.project = this.restoreSnapshot(previous);
    this.afterHistoryRestore();
    this.emit("undo");
    this.scheduleAutosave();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next || !this.project) return;
    this.undoStack.push(this.snapshot() ?? JSON.stringify(this.project));
    this.project = this.restoreSnapshot(next);
    this.afterHistoryRestore();
    this.emit("undo");
    this.scheduleAutosave();
  }

  private afterHistoryRestore(): void {
    if (!this.project) return;
    this.revision += 1;
    this.dirty = true;
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
    this.scheduleAutosave();
  }

  private scheduleAutosave(): void {
    if (this.autosaveTimer !== null) window.clearTimeout(this.autosaveTimer);
    this.autosaveTimer = window.setTimeout(() => {
      this.autosaveTimer = null;
      void this.writeAutosave();
    }, 900);
  }

  private async writeAutosave(): Promise<void> {
    const project = this.project;
    if (!project) return;
    const payload: AutosavePayload = {
      project,
      projectPath: this.projectPath,
      savedAt: new Date().toISOString(),
    };
    try {
      await writeAutosaveStorage(payload);
      this.autosaveError = null;
    } catch (error) {
      this.autosaveError =
        error instanceof Error ? error.message : "The recovery snapshot could not be saved.";
      this.emit("save");
    }
  }

  readAutosavePreview(): AutosavePreview | null {
    return readAutosavePreview();
  }

  readAutosave(): Promise<AutosavePayload | null> {
    return readAutosaveStorage();
  }

  consumeAutosaveError(): string | null {
    const error = this.autosaveError;
    this.autosaveError = null;
    return error;
  }

  clearAutosave(): Promise<void> {
    if (this.autosaveTimer !== null) {
      window.clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    return clearAutosaveStorage();
  }
}

export const store = new Store();
