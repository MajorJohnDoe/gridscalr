import { makeId } from "./calibration";
import type { DocumentRef, PageId, PageRecord, PageState, Project, ProjectSettings } from "./types";

/**
 * Stable page identity and the canonical page order. A page number is display
 * data derived from `Project.pages`; it is never stored or used as identity.
 */

export type PageListProject = Pick<Project, "pages" | "documents">;

export function makePageId(): PageId {
  return makeId("page");
}

/** Deterministic ID used by the schema 23 → 24 migration. */
export function stablePageId(
  projectId: string,
  documentId: string,
  localPage: number,
  ordinal: number,
): PageId {
  const source = `${projectId}\u0000${documentId}\u0000${localPage}\u0000${ordinal}`;
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    a ^= code;
    a = Math.imul(a, 0x01000193) >>> 0;
    b ^= code + index;
    b = Math.imul(b, 0x85ebca6b) >>> 0;
  }
  return `page_${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

export function createPageRecord(
  documentId: string,
  localPage: number,
  state: PageState = {},
): PageRecord {
  return {
    id: makePageId(),
    documentId,
    localPage: Math.max(1, Math.round(localPage)),
    state,
  };
}

/** All project pages in document order, one record per included source page. */
export function buildPageRecords(
  documents: readonly DocumentRef[],
  includedPages: (document: DocumentRef) => number[],
): PageRecord[] {
  const records: PageRecord[] = [];
  for (const document of documents) {
    for (const localPage of includedPages(document)) {
      records.push(createPageRecord(document.id, localPage));
    }
  }
  return records;
}

export function pageRecordAt(project: PageListProject, pageNumber: number): PageRecord | undefined {
  const index = Math.round(pageNumber) - 1;
  return index >= 0 && index < project.pages.length ? project.pages[index] : undefined;
}

export function pageAt(project: PageListProject, index0: number): PageRecord | undefined {
  return index0 >= 0 && index0 < project.pages.length ? project.pages[index0] : undefined;
}

export function pageIdAt(project: PageListProject, pageNumber: number): PageId | null {
  return pageRecordAt(project, pageNumber)?.id ?? null;
}

export function pageRecordById(
  project: PageListProject | null | undefined,
  pageId: PageId | null | undefined,
): PageRecord | undefined {
  if (!project || !pageId) return undefined;
  return project.pages.find((record) => record.id === pageId);
}

/** 1-based display number, or 0 when the ID is not part of this project. */
export function pageNumber(
  project: PageListProject | null | undefined,
  pageId: PageId | null | undefined,
): number {
  if (!project || !pageId) return 0;
  const index = project.pages.findIndex((record) => record.id === pageId);
  return index < 0 ? 0 : index + 1;
}

/** 0-based array index, or -1. */
export function pageIndex(project: PageListProject, pageId: PageId | null | undefined): number {
  if (!pageId) return -1;
  return project.pages.findIndex((record) => record.id === pageId);
}

export function pageStateOf(
  project: PageListProject | null | undefined,
  pageId: PageId | null | undefined,
): PageState | undefined {
  if (!project) return undefined;
  return pageRecordById(project, pageId)?.state;
}

/** Creates or returns the mutable page state for a record. */
export function ensurePageState(
  project: PageListProject,
  pageId: PageId | null | undefined,
): PageState | undefined {
  const record = pageRecordById(project, pageId);
  if (!record) return undefined;
  record.state ??= {};
  return record.state;
}

export function documentForPageRecord(
  project: PageListProject,
  record: PageRecord | undefined,
): DocumentRef | undefined {
  if (!record) return undefined;
  return project.documents.find((document) => document.id === record.documentId);
}

export function pageDocument(
  project: PageListProject,
  pageId: PageId | null | undefined,
): DocumentRef | undefined {
  return documentForPageRecord(project, pageRecordById(project, pageId));
}

export function pageLocalNumber(
  project: PageListProject,
  pageId: PageId | null | undefined,
): number {
  return pageRecordById(project, pageId)?.localPage ?? 1;
}

export function pageIdForDocumentPage(
  project: PageListProject,
  documentId: string,
  localPage: number,
): PageId | null {
  const record = project.pages.find(
    (entry) => entry.documentId === documentId && entry.localPage === Math.round(localPage),
  );
  return record?.id ?? null;
}

export function pageIdsForDocument(project: PageListProject, documentId: string): PageId[] {
  return project.pages
    .filter((record) => record.documentId === documentId)
    .map((record) => record.id);
}

export function projectPageCount(project: PageListProject): number {
  return project.pages.length;
}

/** Current page ID for the runtime 1-based view page. */
export function currentPageId(project: PageListProject, viewPage: number): PageId | null {
  return pageIdAt(project, viewPage);
}

/** True when both projects refer to the same page identity. */
export function samePage(
  left: PageListProject,
  leftPageId: PageId,
  right: PageListProject,
  rightPageId: PageId,
): boolean {
  const leftRecord = pageRecordById(left, leftPageId);
  const rightRecord = pageRecordById(right, rightPageId);
  if (!leftRecord || !rightRecord) return false;
  if (leftRecord.id === rightRecord.id) return true;
  return (
    leftRecord.documentId === rightRecord.documentId &&
    leftRecord.localPage === rightRecord.localPage
  );
}

/** Human readable source of a page, used by the top bar and dialogs. */
export function pageDocumentLabel(
  project: PageListProject,
  pageId: PageId | null | undefined,
): string {
  const record = pageRecordById(project, pageId);
  if (!record) return "";
  const document = documentForPageRecord(project, record);
  if (!document) return "";
  if (project.documents.length <= 1) return document.name;
  return `${document.name} · p. ${record.localPage}/${document.pageCount}`;
}

/** User-facing page title, or undefined when the default "Page N" is used. */
export function pageDisplayName(
  project: PageListProject,
  pageId: PageId | null | undefined,
): string | undefined {
  const name = pageStateOf(project, pageId)?.name?.trim();
  return name || undefined;
}

export function pageBuilding(
  project: PageListProject,
  pageId: PageId | null | undefined,
): string | undefined {
  const value = pageStateOf(project, pageId)?.building?.trim();
  return value || undefined;
}

export function pageFloor(
  project: PageListProject,
  pageId: PageId | null | undefined,
): string | undefined {
  const value = pageStateOf(project, pageId)?.floor?.trim();
  return value || undefined;
}

/** Compact "Building · Floor" label, or undefined when the page has no location. */
export function pageLocationLabel(
  project: PageListProject,
  pageId: PageId | null | undefined,
): string | undefined {
  const parts = [pageBuilding(project, pageId), pageFloor(project, pageId)].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length ? parts.join(" · ") : undefined;
}

/** Display number for every page that contains items. Used by sorted views. */
export function itemPageNumber(project: PageListProject, pageId: PageId): number {
  return pageNumber(project, pageId);
}

/** Settings-only project skeleton pages use for an empty project. */
export function emptyPages(project: Pick<Project, "pages">): PageRecord[] {
  return project.pages;
}

export interface DocumentPageOrderEntry {
  documentIndex: number;
  localPage: number;
}

/**
 * Page order in renderer terms: the document index and the source-local page
 * for every display page. The renderer uses this instead of deriving page
 * numbers from the document array.
 */
export function documentPageOrder(project: PageListProject): DocumentPageOrderEntry[] {
  const indices = new Map(project.documents.map((document, index) => [document.id, index]));
  return project.pages.map((record) => ({
    documentIndex: indices.get(record.documentId) ?? 0,
    localPage: record.localPage,
  }));
}

/**
 * Page order after every selected page is moved as one contiguous block.
 * `insertionIndex` is a 0-based index in the current list: the block is placed
 * before the record that currently sits at that index. The input is never
 * mutated, so callers can compare before committing a structural change.
 */
export function pageListAfterMove<T extends { id: PageId }>(
  pages: readonly T[],
  selectedIds: ReadonlySet<PageId>,
  insertionIndex: number,
): T[] {
  if (!selectedIds.size) return [...pages];
  const selected = pages.filter((page) => selectedIds.has(page.id));
  if (!selected.length) return [...pages];
  const remaining = pages.filter((page) => !selectedIds.has(page.id));
  const clamped = Math.max(0, Math.min(pages.length, Math.round(insertionIndex)));
  const selectedBefore = pages.slice(0, clamped).filter((page) => selectedIds.has(page.id)).length;
  const insertAt = Math.max(0, Math.min(remaining.length, clamped - selectedBefore));
  return [...remaining.slice(0, insertAt), ...selected, ...remaining.slice(insertAt)];
}

/** True when the insertion would change the visible page order. */
export function pageListOrderChanges<T extends { id: PageId }>(
  pages: readonly T[],
  selectedIds: ReadonlySet<PageId>,
  insertionIndex: number,
): boolean {
  if (!selectedIds.size) return false;
  const next = pageListAfterMove(pages, selectedIds, insertionIndex);
  return next.some((page, index) => page.id !== pages[index]?.id);
}

/** Settings shape guard used by the empty-project flow. */
export function hasPages(project: PageListProject | null | undefined): boolean {
  return Boolean(project && project.pages.length > 0);
}

export function defaultPageState(): PageState {
  return {};
}

export function isPageId(value: unknown): value is PageId {
  return typeof value === "string" && /^page_/.test(value);
}

export function projectSettingsFor(_settings: ProjectSettings): ProjectSettings {
  return _settings;
}
