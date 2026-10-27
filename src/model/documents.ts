import { makeId } from "./calibration";
import type { DocumentRef, MarkupItem, PageState, Project } from "./types";

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

export interface DuplicatePageOptions {
  /** Copy markups and drawings from the source page. */
  copyMarkups: boolean;
  /** Copy the page scale and lock. */
  copyScale: boolean;
  /** Copy the page name. */
  copyName: boolean;
  /** Name for the new page when `copyName` is true. */
  name: string;
}

export interface DuplicatePageResult {
  /** 1-based page number of the appended copy. */
  page: number;
  /** Index of the source document in `project.documents` before the copy was appended. */
  sourceDocumentIndex: number;
  /** 1-based source page inside the source document. */
  sourceLocalPage: number;
}

/** User-facing page title, or undefined when the default "Page N" is used. */
export function pageDisplayName(project: Pick<Project, "pages">, page: number): string | undefined {
  const name = project.pages[String(page)]?.name?.trim();
  return name || undefined;
}

export function pageBuilding(project: Pick<Project, "pages">, page: number): string | undefined {
  const value = project.pages[String(page)]?.building?.trim();
  return value || undefined;
}

export function pageFloor(project: Pick<Project, "pages">, page: number): string | undefined {
  const value = project.pages[String(page)]?.floor?.trim();
  return value || undefined;
}

/** Compact "Building · Floor" label, or undefined when the page has no location. */
export function pageLocationLabel(
  project: Pick<Project, "pages">,
  page: number,
): string | undefined {
  const parts = [pageBuilding(project, page), pageFloor(project, page)].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length ? parts.join(" · ") : undefined;
}

function clonePageState(state: PageState | undefined): PageState {
  if (!state) return {};
  const copy: PageState = {};
  if (state.calibration) copy.calibration = JSON.parse(JSON.stringify(state.calibration));
  if (state.scaleLocked) copy.scaleLocked = true;
  if (state.name) copy.name = state.name;
  return copy;
}

function duplicateItemForPage(item: MarkupItem, page: number, now: string): MarkupItem {
  return {
    ...item,
    id: makeId("item"),
    page,
    points: item.points.map((point) => ({ ...point })),
    textOffset: item.textOffset ? { ...item.textOffset } : undefined,
    labelOffset: item.labelOffset ? { ...item.labelOffset } : undefined,
    labelAnchor: item.labelAnchor ? { ...item.labelAnchor } : undefined,
    scale: item.scale ? { ...item.scale } : item.scale,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Appends a copy of one source page. The source PDF is never modified. The
 * copy is a new document reference with exactly one included source page, so
 * it works with the existing renderer, export and save code.
 */
export function duplicatePageFromProject(
  project: Project,
  page: number,
  options: DuplicatePageOptions,
): DuplicatePageResult | null {
  const total = totalPageCount(project.documents);
  const sourcePage = Math.round(page);
  if (sourcePage < 1 || sourcePage > total) return null;

  const sourceDocumentIndex = documentIndexForPage(project.documents, sourcePage);
  const sourceDocument = project.documents[sourceDocumentIndex];
  const sourceLocalPage = localPageNumber(project.documents, sourcePage);
  const newPage = total + 1;
  const now = new Date().toISOString();
  const copyDocument: DocumentRef = {
    ...sourceDocument,
    id: makeId("doc"),
    excludedPages: excludedSourcePages(sourceDocument.pageCount, [sourceLocalPage]),
    copiedFrom: sourceDocument.copiedFrom
      ? { ...sourceDocument.copiedFrom }
      : { documentId: sourceDocument.id, page: sourceLocalPage },
  };
  project.documents.push(copyDocument);

  const sourceState = project.pages[String(sourcePage)];
  const newState = clonePageState(options.copyScale ? sourceState : undefined);
  // Location is part of the sheet's identity and follows a duplicate even when
  // scale, name or markups are not copied.
  if (sourceState?.building) newState.building = sourceState.building;
  if (sourceState?.floor) newState.floor = sourceState.floor;
  if (options.copyName) {
    const name = options.name.trim().slice(0, 80);
    if (name) newState.name = name;
    else delete newState.name;
  } else {
    delete newState.name;
  }
  if (Object.keys(newState).length) project.pages[String(newPage)] = newState;
  else delete project.pages[String(newPage)];

  for (const layer of project.layers) {
    if (options.copyMarkups) {
      for (const item of layer.items.filter((entry) => entry.page === sourcePage)) {
        layer.items.push(duplicateItemForPage(item, newPage, now));
      }
    }
    const pageState = layer.pageState?.[String(sourcePage)];
    if (pageState) {
      layer.pageState ??= {};
      layer.pageState[String(newPage)] = { ...pageState };
    }
  }

  project.updatedAt = now;
  return { page: newPage, sourceDocumentIndex, sourceLocalPage };
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
      .map((item) => (item.page > target ? { ...item, page: item.page - 1 } : item));
  }

  const remappedPages: Project["pages"] = {};
  for (const [key, value] of Object.entries(project.pages)) {
    const number = Number(key);
    if (number === target) continue;
    remappedPages[String(number > target ? number - 1 : number)] = value;
  }
  project.pages = remappedPages;

  for (const layer of project.layers) {
    if (layer.homePage) {
      if (layer.homePage === target) layer.homePage = Math.min(target, total - 1);
      else if (layer.homePage > target) layer.homePage -= 1;
    }
    if (!layer.pageState) continue;
    const remappedLayerState: NonNullable<typeof layer.pageState> = {};
    for (const [key, value] of Object.entries(layer.pageState)) {
      const number = Number(key);
      if (number === target) continue;
      remappedLayerState[String(number > target ? number - 1 : number)] = value;
    }
    if (Object.keys(remappedLayerState).length) layer.pageState = remappedLayerState;
    else delete layer.pageState;
  }

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
