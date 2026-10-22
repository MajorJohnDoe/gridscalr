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
import type { Category, LayerKind, Point, Project, SelectionRef } from "../model/types";

export type ToolId =
  | "select"
  | "pan"
  | "calibrate"
  | "length"
  | "area"
  | "pen"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "highlight"
  | "text";

export type LeftTab = "pages" | "layers" | "markups";

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
  /** Category for new measurements. null means the project default. */
  measureCategoryId: string | null;
  /** Sticky room for new measurements, trimmed when an item is created. */
  measureRoom: string;
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

const AUTOSAVE_KEY = "gridscalr.autosave.v1";
const HISTORY_LIMIT = 80;

export interface AutosavePayload {
  project: Project;
  projectPath: string | null;
  savedAt: string;
}

export function toolLayerKind(tool: ToolId): LayerKind | null {
  switch (tool) {
    case "length":
    case "area":
    case "calibrate":
      return "measure";
    case "pen":
    case "line":
    case "arrow":
    case "rect":
    case "ellipse":
    case "highlight":
    case "text":
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
    leftTab: "layers",
    style: {
      color: "#f2a93b",
      strokeWidth: 2,
      fillOpacity: 0.15,
      fontSize: 12,
    },
    measureCategoryId: null,
    measureRoom: "",
  };
}

export class Store {
  project: Project | null = null;
  ui: UIState = defaultUI();
  projectPath: string | null = null;
  dirty = false;
  private listeners = new Set<Listener>();
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private gestureSnapshot: string | null = null;
  private autosaveTimer: number | null = null;

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
    this.undoStack = [];
    this.redoStack = [];
    this.gestureSnapshot = null;
    this.ui.page = 1;
    this.ui.selection = [];
    this.ui.hover = null;
    this.ui.activeTool = "select";
    this.ui.cursor = null;
    this.ui.leftTab = "layers";
    this.ui.measureCategoryId = null;
    this.ui.measureRoom = "";
    this.emit("project");
    this.scheduleAutosave();
  }

  closeProject(): void {
    this.project = null;
    this.projectPath = null;
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    this.ui = defaultUI();
    this.emit("project");
    this.clearAutosave();
  }

  setView(zoom: number, panX: number, panY: number): void {
    this.ui.zoom = zoom;
    this.ui.panX = panX;
    this.ui.panY = panY;
    this.emit("view");
  }

  setPage(page: number): void {
    if (!this.project) return;
    const clamped = Math.max(1, Math.min(this.project.document.pageCount, Math.round(page)));
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
      if (kind) ensureActiveLayer(this.project, kind);
    }
    this.emit("tool");
  }

  setLeftTab(tab: LeftTab): void {
    this.ui.leftTab = tab;
    this.emit("change");
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

  private snapshot(): string | null {
    return this.project ? JSON.stringify(this.project) : null;
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
      this.project = JSON.parse(this.gestureSnapshot) as Project;
    }
    this.gestureSnapshot = null;
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous || !this.project) return;
    this.redoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(previous) as Project;
    this.afterHistoryRestore();
    this.emit("undo");
    this.scheduleAutosave();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next || !this.project) return;
    this.undoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(next) as Project;
    this.afterHistoryRestore();
    this.emit("undo");
    this.scheduleAutosave();
  }

  private afterHistoryRestore(): void {
    if (!this.project) return;
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
      this.writeAutosave();
    }, 900);
  }

  private writeAutosave(): void {
    if (!this.project) return;
    try {
      const payload: AutosavePayload = {
        project: this.project,
        projectPath: this.projectPath,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
    } catch {
      // Storage can be full or unavailable; explicit saves still work.
    }
  }

  readAutosave(): AutosavePayload | null {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AutosavePayload;
      if (!parsed?.project?.document) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  clearAutosave(): void {
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }
}

export const store = new Store();
