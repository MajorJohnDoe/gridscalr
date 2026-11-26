import type { RemoveCategoryResult } from "../model/categories";
import type { CloudFillPreset } from "../model/cloud";
import type {
  DeletePageSummary,
  DuplicatePageOptions,
  DuplicatePageSummary,
} from "../model/pageList";
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
import { ProjectPages } from "./projectPages";
import { ProjectStore } from "./projectStore";
import { ProjectTaxonomy } from "./projectTaxonomy";
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
type PerfMark = (name: "undo" | "redo") => void;

/**
 * Compatibility facade over the project, session, page and taxonomy stores.
 *
 * Callers keep the single `store` surface; this class only wires the parts
 * together and never duplicates their rules.
 */
export class Store {
  private perfMark: PerfMark = () => {};

  /** Session and UI state; the `ui` getter below keeps the existing facade. */
  readonly session = new SessionStore({
    notify: (reason) => this.emit(reason),
    project: () => this.project,
    readOnly: () => this.readOnly,
  });
  readonly projectState = new ProjectStore({
    session: this.session,
    mark: (name) => this.perfMark(name),
  });
  private readonly pages = new ProjectPages(this.projectState, this.session);
  private readonly taxonomy = new ProjectTaxonomy(this.projectState);

  /** Registers the opt-in performance marker; the state layer never imports it. */
  setPerfMark(mark: PerfMark): void {
    this.perfMark = mark;
  }

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

  addDocument(document: DocumentRef): void {
    this.pages.addDocument(document);
  }
  applySourceStorageChange(mutate: (documents: DocumentRef[]) => void): void {
    this.pages.applySourceStorageChange(mutate);
  }
  setTemplatePaper(pageId: PageId, paper: SheetPaperSize): void {
    this.pages.setTemplatePaper(pageId, paper);
  }
  clearHistory(): void {
    this.projectState.clearHistory();
  }
  deletePage(pageId: PageId): DeletePageSummary | null {
    return this.pages.deletePage(pageId);
  }
  reorderPage(pageId: PageId, targetIndex: number): boolean {
    return this.pages.reorderPage(pageId, targetIndex);
  }
  reorderPages(pageIds: readonly PageId[], insertionIndex: number): boolean {
    return this.pages.reorderPages(pageIds, insertionIndex);
  }
  insertPageRecord(pageId: PageId, index: number): PageId | null {
    return this.pages.insertPageRecord(pageId, index);
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
    this.pages.setActiveLayer(layerId);
  }
  createLayer(kind: LayerKind): void {
    this.pages.createLayer(kind);
  }
  setPageOcr(pageId: PageId, ocr: OcrPage | undefined): void {
    this.pages.setPageOcr(pageId, ocr);
  }
  renamePage(pageId: PageId, name: string): void {
    this.pages.renamePage(pageId, name);
  }
  duplicatePage(pageId: PageId, options: DuplicatePageOptions): DuplicatePageSummary | null {
    return this.pages.duplicatePage(pageId, options);
  }

  addCategory(name: string): Category | null {
    return this.taxonomy.addCategory(name);
  }
  renameCategory(id: string, name: string): boolean {
    return this.taxonomy.renameCategory(id, name);
  }
  moveCategory(id: string, direction: -1 | 1): boolean {
    return this.taxonomy.moveCategory(id, direction);
  }
  removeCategory(id: string, targetId?: string): RemoveCategoryResult {
    return this.taxonomy.removeCategory(id, targetId);
  }
  setDefaultCategory(id: string): boolean {
    return this.taxonomy.setDefaultCategory(id);
  }
  categoryItemCount(id: string): number {
    return this.taxonomy.categoryItemCount(id);
  }
  setQuantityDefaults(patch: { wastePercent?: number; roundingStep?: number }): boolean {
    return this.taxonomy.setQuantityDefaults(patch);
  }
  setCategoryQuantityOverride(
    id: string,
    field: "wastePercent" | "roundingStep",
    value: number | null,
  ): boolean {
    return this.taxonomy.setCategoryQuantityOverride(id, field, value);
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
