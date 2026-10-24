import type { DocumentRef, Project } from "./types";

/** A project always has at least one document. */
export type DocumentList = readonly DocumentRef[];

export function primaryDocument(documents: DocumentList): DocumentRef | undefined {
  return documents[0];
}

export function totalPageCount(documents: DocumentList): number {
  return documents.reduce((sum, document) => sum + Math.max(1, document.pageCount), 0);
}

/** 0-based index of the document that owns a 1-based global page number. */
export function documentIndexForPage(documents: DocumentList, page: number): number {
  const target = Math.max(1, Math.round(page));
  let start = 1;
  for (let index = 0; index < documents.length; index++) {
    const count = Math.max(1, documents[index].pageCount);
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
    start += Math.max(1, documents[i].pageCount);
  }
  return start;
}

/** Converts a global page number into a 1-based page number inside its document. */
export function localPageNumber(documents: DocumentList, page: number): number {
  const index = documentIndexForPage(documents, page);
  return Math.max(1, Math.round(page)) - documentStartPage(documents, index) + 1;
}

/** Inclusive global page range covered by a document. */
export function documentPageRange(
  documents: DocumentList,
  index: number,
): { start: number; end: number } {
  const document = documents[index];
  const start = documentStartPage(documents, index);
  const count = Math.max(1, document?.pageCount ?? 1);
  return { start, end: start + count - 1 };
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

/** Human readable source of a page, used in the status bar and dialogs. */
export function pageDocumentLabel(project: Pick<Project, "documents">, page: number): string {
  const document = projectDocumentForPage(project, page);
  if (!document) return "";
  if (project.documents.length <= 1) return document.name;
  return `${document.name} · p. ${localPageNumber(project.documents, page)}/${document.pageCount}`;
}
