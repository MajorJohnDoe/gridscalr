import type { DocumentRef } from "./types";

/**
 * Source-document page math. These helpers describe a single PDF/TIF reference
 * and are used by import, rendering and document creation. Project page
 * identity and order live in `model/pages.ts`.
 */
export type DocumentList = readonly DocumentRef[];

/**
 * 1-based source pages that are still included for a document. `pageCount` is
 * always the source page count; `excludedPages` records explicit removals from
 * the original import. In schema 24 the project page list is authoritative;
 * this remains the import/provenance view.
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

/**
 * Complement of a selected set of 1-based source pages, ready for
 * `DocumentRef.excludedPages`. Returns undefined when every page is included.
 */
export function excludedSourcePages(
  pageCount: number,
  selected: readonly number[],
): number[] | undefined {
  const total = Math.max(0, Math.round(pageCount));
  if (total === 0) return undefined;
  const included = new Set(
    selected.filter((page) => Number.isInteger(page) && page >= 1 && page <= total),
  );
  if (included.size >= total) return undefined;
  const excluded: number[] = [];
  for (let page = 1; page <= total; page += 1) {
    if (!included.has(page)) excluded.push(page);
  }
  return excluded.length ? excluded : undefined;
}

/** First document that still has pages, falling back to the first reference. */
export function primaryDocument(documents: DocumentList): DocumentRef | undefined {
  return documents.find((document) => documentIncludedPageCount(document) > 0) ?? documents[0];
}

/** Sum of included source pages. Not the project page count; see model/pages.ts. */
export function totalPageCount(documents: DocumentList): number {
  return documents.reduce((sum, document) => sum + documentIncludedPageCount(document), 0);
}

/** 0-based index of the document that owns a 1-based source-document page. */
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

/** 1-based first source-document page of a document, in document order. */
export function documentStartPage(documents: DocumentList, index: number): number {
  let start = 1;
  for (let i = 0; i < index && i < documents.length; i++) {
    start += documentIncludedPageCount(documents[i]);
  }
  return start;
}

/** Converts a source-document page number into a 1-based page inside its document. */
export function localPageNumber(documents: DocumentList, page: number): number {
  const index = documentIndexForPage(documents, page);
  const pages = includedLocalPages(documents[index]);
  const offset = Math.max(1, Math.round(page)) - documentStartPage(documents, index);
  return pages[Math.max(0, Math.min(pages.length - 1, offset))] ?? 1;
}

/** Inclusive source-document page range covered by a document. */
export function documentPageRange(
  documents: DocumentList,
  index: number,
): { start: number; end: number } {
  const start = documentStartPage(documents, index);
  const count = documentIncludedPageCount(documents[index]);
  return { start, end: start + Math.max(0, count - 1) };
}

export function documentPageLocalPage(documents: DocumentList, page: number): number {
  return localPageNumber(documents, page);
}
