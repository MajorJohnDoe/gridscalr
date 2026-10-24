import type { DocumentRef, Project } from "./types";

/** A project always has at least one document and at least one included page. */
export type DocumentList = readonly DocumentRef[];

/**
 * 1-based source pages that are still included for a document. `pageCount` is
 * always the source page count; `excludedPages` records explicit removals.
 */
export function includedLocalPages(document: DocumentRef): number[] {
  const excluded = new Set(
    (document.excludedPages ?? []).filter(
      (page) => Number.isInteger(page) && page >= 1 && page <= document.pageCount,
    ),
  );
  const pages: number[] = [];
  for (let page = 1; page <= Math.max(1, document.pageCount); page += 1) {
    if (!excluded.has(page)) pages.push(page);
  }
  return pages;
}

export function documentIncludedPageCount(document: DocumentRef): number {
  return includedLocalPages(document).length;
}

export function documentPageMaps(documents: DocumentList): number[][] {
  return documents.map((document) => includedLocalPages(document));
}

/** First document that still has pages, falling back to the first reference. */
export function primaryDocument(documents: DocumentList): DocumentRef | undefined {
  return documents.find((document) => documentIncludedPageCount(document) > 0) ?? documents[0];
}

export function totalPageCount(documents: DocumentList): number {
  return documents.reduce((sum, document) => sum + documentIncludedPageCount(document), 0);
}

/** 0-based index of the document that owns a 1-based global page number. */
export function documentIndexForPage(documents: DocumentList, page: number): number {
  const target = Math.max(1, Math.round(page));
  let start = 1;
  for (let index = 0; index < documents.length; index++) {
    const count = documentIncludedPageCount(documents[index]);
    if (count === 0) continue;
    if (target < start + count) return index;
    start += count;
  }
  return Math.max(0, documents.length - 1);
}

export function documentForPage(documents: DocumentList, page: number): DocumentRef | undefined {
  return documents[documentIndexForPage(documents, page)];
}

/** 1-based first global page of a document. */
export function documentStartPage(documents: DocumentList, index: number): number {
  let start = 1;
  for (let i = 0; i < index && i < documents.length; i++) {
    start += documentIncludedPageCount(documents[i]);
  }
  return start;
}

/** Converts a global page number into a 1-based page number inside its document. */
export function localPageNumber(documents: DocumentList, page: number): number {
  const index = documentIndexForPage(documents, page);
  const pages = includedLocalPages(documents[index]);
  const offset = Math.max(1, Math.round(page)) - documentStartPage(documents, index);
  return pages[Math.max(0, Math.min(pages.length - 1, offset))] ?? 1;
}

/** Inclusive global page range covered by a document. */
export function documentPageRange(
  documents: DocumentList,
  index: number,
): { start: number; end: number } {
  const start = documentStartPage(documents, index);
  const count = documentIncludedPageCount(documents[index]);
  return { start, end: start + Math.max(0, count - 1) };
}

export function projectPageCount(project: Pick<Project, "documents">): number {
  return totalPageCount(project.documents);
}

export function projectDocumentForPage(
  project: Pick<Project, "documents">,
  page: number,
): DocumentRef | undefined {
  return documentForPage(project.documents, page);
}

/** Human readable source of a page, used by the top bar and dialogs. */
export function pageDocumentLabel(project: Pick<Project, "documents">, page: number): string {
  const document = projectDocumentForPage(project, page);
  if (!document) return "";
  if (project.documents.length <= 1) return document.name;
  return `${document.name} · p. ${localPageNumber(project.documents, page)}/${document.pageCount}`;
}

export interface DeletePageResult {
  /** The page to show after the removal. */
  page: number;
  /** Index in `project.documents` when the last page of a document was removed. */
  removedDocumentIndex: number | null;
}

/**
 * Structurally removes one page. Measurements and page state on the deleted
 * page are dropped; later measurements and page state move down one page.
 * This is not undoable, like importing a document.
 */
export function deletePageFromProject(project: Project, page: number): DeletePageResult | null {
  const total = totalPageCount(project.documents);
  const target = Math.round(page);
  if (total <= 1 || target < 1 || target > total) return null;

  const documentIndex = documentIndexForPage(project.documents, target);
  const document = project.documents[documentIndex];
  const localPage = localPageNumber(project.documents, target);
  const included = includedLocalPages(document);

  for (const layer of project.layers) {
    layer.items = layer.items
      .filter((item) => item.page !== target)
      .map((item) =>
        item.page > target ? { ...item, page: item.page - 1 } : item,
      );
  }

  const remappedPages: Project["pages"] = {};
  for (const [key, value] of Object.entries(project.pages)) {
    const number = Number(key);
    if (number === target) continue;
    remappedPages[String(number > target ? number - 1 : number)] = value;
  }
  project.pages = remappedPages;

  let removedDocumentIndex: number | null = null;
  if (included.length <= 1) {
    project.documents.splice(documentIndex, 1);
    removedDocumentIndex = documentIndex;
  } else {
    const excluded = new Set(document.excludedPages ?? []);
    excluded.add(localPage);
    document.excludedPages = [...excluded]
      .filter((value) => value >= 1 && value <= document.pageCount)
      .sort((a, b) => a - b);
  }

  const usedAssets = new Set<string>();
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (item.kind === "image" && item.image) usedAssets.add(item.image.assetId);
    }
  }
  for (const assetId of Object.keys(project.assets)) {
    if (!usedAssets.has(assetId)) delete project.assets[assetId];
  }

  project.updatedAt = new Date().toISOString();
  return { page: Math.min(target, total - 1), removedDocumentIndex };
}
