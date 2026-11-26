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
import { perfMark } from "../features/perfMonitor";
import type { CloudFillPreset } from "../model/cloud";
import {
  setCategoryQuantityOverride as applyCategoryQuantityOverride,
  setQuantityDefaults as applyQuantityDefaults,
} from "../model/commands/settings";
import { includedLocalPages } from "../model/documents";
import { addLayer } from "../model/layers";
import {
  currentPageId,
  ensurePageState,
  makePageId,
  pageNumber,
  pageRecordById,
} from "../model/pages";
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
import type {
  AreaMode,
  AreaShape,
  ArrowHeads,
  Category,
  CountType,
  DocumentRef,
  HighlightShape,
  ImageAsset,
  InspectionStatus,
  LayerKind,
  OcrPage,
  PageId,
  Point,
  Project,
  SelectionRef,
  SheetPaperSize,
} from "../model/types";
import { ProjectStore } from "./projectStore";
import { SessionStore } from "./sessionStore";
import type {
  AutosaveFailure,
  ChangeReason,
  DrawStyle,
  FileStamp,
  LeftTab,
  ToolId,
  UIState,
} from "./types";

export { toolLayerKind } from "./sessionStore";
export type { AutosaveFailure, ChangeReason, DrawStyle, FileStamp, LeftTab, ToolId, UIState };

type Listener = (reason: ChangeReason) => void;

/**
 * Compatibility facade over the project and session stores.
 *
 * Project data, history and the dirty flag live in `ProjectStore`; UI state
 * lives in `SessionStore`. Callers keep the single `store` surface, while the
 * facade owns the wiring: one notification after an open or close, and the
 * session cleanup that follows undo or redo. Page, category, quantity and image
 * methods remain here until their own extraction phases.
 */
export class Store {
  /**
   * Session and UI state, split out of the project store. The `ui` getter below
   * keeps the existing facade for every caller.
   */
  readonly session = new SessionStore({
    notify: (reason) => this.emit(reason),
    project: () => this.project,
    readOnly: () => this.readOnly,
  });
  readonly projectState = new ProjectStore({
    session: this.session,
    mark: (name) => perfMark(name),
  });

  get project(): Project | null {
    return this.projectState.project;
  }

  set project(project: Project | null) {
    this.projectState.project = project;
  }

  get projectPath(): string | null {
    return this.projectState.projectPath;
  }

  set projectPath(projectPath: string | null) {
    this.projectState.projectPath = projectPath;
  }

  /** Expected disk state captured on open and after a verified save. */
  get fileStamp(): FileStamp | null {
    return this.projectState.fileStamp;
  }

  set fileStamp(fileStamp: FileStamp | null) {
    this.projectState.fileStamp = fileStamp;
  }

  get dirty(): boolean {
    return this.projectState.dirty;
  }

  set dirty(dirty: boolean) {
    this.projectState.dirty = dirty;
  }

  /**
   * View-only: inspection, export, package and Save a copy work, but no command
   * may change project data. The guards and the UI enforce it.
   */
  get readOnly(): boolean {
    return this.projectState.readOnly;
  }

  set readOnly(readOnly: boolean) {
    this.projectState.readOnly = readOnly;
  }

  /** Last recovery-snapshot error, consumed by the UI after an autosave attempt. */
  get autosaveError(): AutosaveFailure | null {
    return this.projectState.autosaveError;
  }

  set autosaveError(autosaveError: AutosaveFailure | null) {
    this.projectState.autosaveError = autosaveError;
  }

  /** Increments whenever project data changes, including undo and redo. */
  get revision(): number {
    return this.projectState.revision;
  }

  set revision(revision: number) {
    this.projectState.revision = revision;
  }

  subscribe(listener: Listener): () => void {
    return this.projectState.subscribe(listener);
  }

  emit(reason: ChangeReason): void {
    this.projectState.emit(reason);
  }

  get ui(): UIState {
    return this.session.ui;
  }

  get canUndo(): boolean {
    return this.projectState.canUndo;
  }

  get canRedo(): boolean {
    return this.projectState.canRedo;
  }

  setProject(project: Project, projectPath: string | null, dirty = false): void {
    this.projectState.loadProject(project, projectPath, dirty);
    this.session.reset(project);
    this.emit("project");
  }

  closeProject(): void {
    this.projectState.unloadProject();
    this.session.resetDefaults();
    this.emit("project");
  }

  setReadOnly(readOnly: boolean): void {
    this.projectState.setReadOnly(readOnly);
  }

  setView(zoom: number, panX: number, panY: number): void {
    this.session.setView(zoom, panX, panY);
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
    this.projectState.clearHistory();
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
    this.projectState.prunePayloads();
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
    return this.projectState.mutateIfChanged(change, "project");
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
    let createdId: PageId | null = null;
    const changed = this.projectState.mutateIfChanged(
      (project) => {
        const record = insertPageRecord(project, {
          documentId: source.documentId,
          localPage: source.localPage,
          index,
        });
        if (!record) return false;
        createdId = record.id;
        return true;
      },
      "project",
      (project) => {
        if (!createdId) return;
        this.ui.page = pageNumber(project, createdId);
        this.ui.selection = [];
        this.ui.hover = null;
      },
    );
    return changed ? createdId : null;
  }

  setLineType(id: string): void {
    this.session.setLineType(id);
  }

  setLineStyle(patch: Partial<UIState["lineStyle"]>): void {
    this.session.setLineStyle(patch);
  }

  setPage(page: number): void {
    this.session.setPage(page);
  }

  setTool(tool: ToolId): void {
    this.session.setTool(tool);
  }

  /** Arms a built-in symbol and keeps the Symbols tab open for repeated use. */
  selectSymbol(symbolId: string): void {
    this.session.selectSymbol(symbolId);
  }

  setSymbolStatus(status: InspectionStatus | null): void {
    this.session.setSymbolStatus(status);
  }

  setLeftTab(tab: LeftTab): void {
    this.session.setLeftTab(tab);
  }

  setStampText(text: string): void {
    this.session.setStampText(text);
  }

  setDeltaText(text: string): void {
    this.session.setDeltaText(text);
  }

  setHighlightShape(shape: HighlightShape): void {
    this.session.setHighlightShape(shape);
  }

  setCloudText(enabled: boolean): void {
    this.session.setCloudText(enabled);
  }

  setCloudFill(preset: CloudFillPreset): void {
    this.session.setCloudFill(preset);
  }

  setArrowHeads(heads: ArrowHeads): void {
    this.session.setArrowHeads(heads);
  }

  get primarySelection(): SelectionRef | null {
    return this.session.primarySelection;
  }

  setSelection(selection: SelectionRef | SelectionRef[] | null): void {
    this.session.setSelection(selection);
  }

  setSelectionMany(selection: SelectionRef[]): void {
    this.session.setSelectionMany(selection);
  }

  toggleSelection(ref: SelectionRef): void {
    this.session.toggleSelection(ref);
  }

  isSelected(ref: SelectionRef): boolean {
    return this.session.isSelected(ref);
  }

  clearSelection(): void {
    this.session.clearSelection();
  }

  setHover(hover: UIState["hover"]): void {
    this.session.setHover(hover);
  }

  setCursor(cursor: Point | null): void {
    this.session.setCursor(cursor);
  }

  setStyle(style: Partial<DrawStyle>): void {
    this.session.setStyle(style);
  }

  /**
   * Pending category and room are session state, not project data: they emit
   * "cursor" so typing a room name does not rebuild the panels and steal focus.
   */
  setMeasureCategory(categoryId: string | null): void {
    this.session.setMeasureCategory(categoryId);
  }

  setMeasureRoom(room: string): void {
    this.session.setMeasureRoom(room);
  }

  setMeasureCountType(type: CountType): void {
    this.session.setMeasureCountType(type);
  }

  setMeasureCountQuantity(quantity: number): void {
    this.session.setMeasureCountQuantity(quantity);
  }

  setMeasureAreaMode(mode: AreaMode): void {
    this.session.setMeasureAreaMode(mode);
  }

  setMeasureAreaShape(shape: AreaShape): void {
    this.session.setMeasureAreaShape(shape);
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
    this.projectState.mutateIfChanged((project) => applyQuantityDefaults(project, patch), "change");
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
    this.projectState.mutateIfChanged(
      (next) => applyCategoryQuantityOverride(next, id, field, value),
      "change",
    );
    return true;
  }

  /** Keeps embedded image payloads available across undo and redo. */
  registerImageAsset(asset: ImageAsset): void {
    this.projectState.registerImageAsset(asset);
  }

  mutate(
    mutator: (project: Project) => void,
    reason: ChangeReason = "change",
    options: { history?: boolean; dirty?: boolean } = {},
  ): void {
    this.projectState.mutate(mutator, reason, options);
  }

  beginGesture(): void {
    this.projectState.beginGesture();
  }

  /**
   * Records a direct project edit made while a gesture is open. Drags change
   * items in place, so this bumps the revision once and `endGesture()` compares
   * that counter instead of serialising the project a second time.
   */
  noteGestureChange(): void {
    this.projectState.noteGestureChange();
  }

  endGesture(reason: ChangeReason = "change"): void {
    this.projectState.endGesture(reason);
  }

  cancelGesture(): void {
    this.projectState.cancelGesture();
  }

  undo(): void {
    this.projectState.undo();
  }

  redo(): void {
    this.projectState.redo();
  }

  markSaved(path: string | null): void {
    this.projectState.markSaved(path);
  }
}

export const store = new Store();
