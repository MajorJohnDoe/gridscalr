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
  deletePage as deletePageRecord,
  deletePages as deletePagesRecord,
  duplicatePage as duplicatePageRecord,
  duplicatePages as duplicatePagesRecord,
  insertPage as insertPageRecord,
  movePage as movePageRecord,
  movePages as movePagesRecord,
  type DeletePageSummary,
  type DeletePagesSummary,
  type DuplicatePageOptions,
  type DuplicatePageSummary,
  type DuplicatePagesSummary,
} from "../model/pageList";
import type {
  DocumentRef,
  LayerKind,
  OcrPage,
  PageId,
  Project,
  SheetPaperSize,
} from "../model/types";
import type { ProjectStore } from "./projectStore";
import type { SessionStore } from "./sessionStore";

/**
 * Page, document and layer-selection actions of the compatibility store.
 *
 * The page and document methods are the explicit structural boundaries: import,
 * duplicate, delete and source replacement clear the undo history, while reorder
 * and insert stay one undo step. The project store owns history, dirty state and
 * the notification; the session store owns the visible page and selection. This
 * module only sequences those calls, so it never duplicates the rules.
 */
export class ProjectPages {
  constructor(
    private readonly state: ProjectStore,
    private readonly session: SessionStore,
  ) {}

  /**
   * Appends a source document. Document import is structural like opening a
   * file, so it clears the undo history instead of pretending to be undoable.
   * Pages are append-only; existing page indexes never move.
   */
  addDocument(document: DocumentRef): void {
    const project = this.state.project;
    if (!project || this.state.readOnly) return;
    project.documents.push(document);
    for (const localPage of includedLocalPages(document)) {
      project.pages.push({
        id: makePageId(),
        documentId: document.id,
        localPage,
        state: {},
      });
    }
    this.state.clearHistory();
    this.state.dirty = true;
    this.state.revision += 1;
    this.state.emit("project");
  }

  /**
   * Applies an explicit source-storage change (managed copy, detach or
   * relink). It changes document references, not drawing geometry, but it
   * clears history so an older snapshot cannot silently restore the previous
   * source path over the new one.
   */
  applySourceStorageChange(mutate: (documents: DocumentRef[]) => void): void {
    const project = this.state.project;
    if (!project || this.state.readOnly) return;
    mutate(project.documents);
    this.state.clearHistory();
    this.state.dirty = true;
    this.state.revision += 1;
    this.state.emit("project");
  }

  /** Changes a template sheet's paper. Structural like adding or deleting a page. */
  setTemplatePaper(pageId: PageId, paper: SheetPaperSize): void {
    const project = this.state.project;
    if (!project || this.state.readOnly) return;
    const record = pageRecordById(project, pageId);
    const document = project.documents.find((entry) => entry.id === record?.documentId);
    if (!document?.template) return;
    document.template.paper = paper;
    this.state.clearHistory();
    this.state.dirty = true;
    this.state.revision += 1;
    this.state.emit("project");
  }

  /**
   * Deletes one page together with its items, its layer page state and any
   * layer that only pointed at it. Deleting stays an explicit, checkpointed
   * boundary rather than an undo step, so a history restore can never silently
   * bring back a page the user removed.
   */
  deletePage(pageId: PageId): DeletePageSummary | null {
    const project = this.state.project;
    if (!project || this.state.readOnly) return null;
    const result = deletePageRecord(project, pageId);
    if (!result) return null;
    this.state.clearHistory();
    this.state.prunePayloads();
    this.session.ui.page = result.nextPageId ? pageNumber(project, result.nextPageId) : 1;
    this.session.ui.selection = [];
    this.session.ui.hover = null;
    this.state.dirty = true;
    this.state.revision += 1;
    this.state.emit("project");
    return result;
  }

  /**
   * Deletes a page selection as one explicit structural operation. It writes
   * one checkpoint outside the store, clears history once and emits once, so
   * the cascade for every page is atomic and cannot be undone page by page.
   */
  deletePages(pageIds: readonly PageId[]): DeletePagesSummary | null {
    const project = this.state.project;
    if (!project || this.state.readOnly) return null;
    const result = deletePagesRecord(project, pageIds);
    if (!result) return null;
    this.state.clearHistory();
    this.state.prunePayloads();
    this.session.ui.page = result.nextPageId ? pageNumber(project, result.nextPageId) : 1;
    this.session.ui.selection = [];
    this.session.ui.hover = null;
    this.state.dirty = true;
    this.state.revision += 1;
    this.state.emit("project");
    return result;
  }

  /**
   * Applies one undoable page-list change. The before-snapshot is only pushed
   * when the change actually happened, so a drop that changes nothing adds no
   * empty undo step. Deleting, duplicating or replacing pages is a different,
   * explicit boundary that clears history instead.
   */
  private mutatePageList(change: (project: Project) => boolean): boolean {
    return this.state.mutateIfChanged(change, "project");
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
    const project = this.state.project;
    if (!project || this.state.readOnly) return null;
    const source = pageRecordById(project, pageId);
    if (!source) return null;
    let createdId: PageId | null = null;
    const changed = this.state.mutateIfChanged(
      (next) => {
        const record = insertPageRecord(next, {
          documentId: source.documentId,
          localPage: source.localPage,
          index,
        });
        if (!record) return false;
        createdId = record.id;
        return true;
      },
      "project",
      (next) => {
        if (!createdId) return;
        this.session.ui.page = pageNumber(next, createdId);
        this.session.ui.selection = [];
        this.session.ui.hover = null;
      },
    );
    return changed ? createdId : null;
  }

  setActiveLayer(layerId: string): void {
    const project = this.state.project;
    if (!project || this.state.readOnly) return;
    if (!project.layers.some((layer) => layer.id === layerId)) return;
    project.activeLayerId = layerId;
    this.state.emit("layers");
  }

  createLayer(kind: LayerKind): void {
    if (!this.state.project) return;
    this.state.mutate((project) => {
      addLayer(project, kind, currentPageId(project, this.session.ui.page) ?? undefined);
    }, "layers");
  }

  /** Stores or clears derived OCR data without adding an undo step. */
  setPageOcr(pageId: PageId, ocr: OcrPage | undefined): void {
    const project = this.state.project;
    if (!project || this.state.readOnly) return;
    const state = ensurePageState(project, pageId);
    if (!state) return;
    if (ocr) state.ocr = ocr;
    else delete state.ocr;
    this.state.dirty = true;
    this.state.revision += 1;
    this.state.emit("change");
  }

  renamePage(pageId: PageId, name: string): void {
    if (!this.state.project) return;
    const trimmed = name.trim().slice(0, 80);
    this.state.mutate((project) => {
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
    const project = this.state.project;
    if (!project || this.state.readOnly) return null;
    const result = duplicatePageRecord(project, pageId, options);
    if (!result) return null;
    this.state.clearHistory();
    this.session.ui.page = result.pageNumber;
    this.session.ui.selection = [];
    this.session.ui.hover = null;
    this.state.dirty = true;
    this.state.revision += 1;
    this.state.emit("project");
    return result;
  }

  /**
   * Appends a duplicate of every selected page as one undo step. Existing page
   * IDs and page state are untouched; each copy gets a fresh `PageId`. The
   * caller registers any cloned template document before the next render.
   */
  duplicatePages(
    pageIds: readonly PageId[],
    options: DuplicatePageOptions,
  ): DuplicatePagesSummary | null {
    let summary: DuplicatePagesSummary | null = null;
    const changed = this.state.mutateIfChanged(
      (project) => {
        summary = duplicatePagesRecord(project, pageIds, options);
        return summary !== null;
      },
      "project",
      () => {
        if (!summary) return;
        this.session.ui.page = summary.lastPageNumber;
        this.session.ui.selection = [];
        this.session.ui.hover = null;
      },
    );
    return changed ? summary : null;
  }
}
