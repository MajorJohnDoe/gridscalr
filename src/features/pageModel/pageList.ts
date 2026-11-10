import { makeId } from "../../model/calibration";
import { createLayer, normalizeLayerOrder } from "../../model/layers";
import { pageIndex, pageNumber, pageRecordById } from "../../model/pages";
import type {
  Layer,
  LayerKind,
  MarkupItem,
  PageId,
  PageRecord,
  PageState,
  Project,
} from "../../model/types";

/** Structural page operations. Every function mutates the project in place. */

export interface InsertPageOptions {
  documentId: string;
  localPage: number;
  /** 0-based target index. Missing or out of range appends. */
  index?: number;
  state?: PageState;
}

export interface DeletePageSummary {
  pageId: PageId;
  pageNumber: number;
  removedItems: number;
  removedLayers: number;
  removedDocuments: string[];
  nextPageId: PageId | null;
}

export interface DuplicatePageOptions {
  copyMarkups: boolean;
  copyScale: boolean;
  copyName: boolean;
  name: string;
}

export interface DuplicatePageSummary {
  pageId: PageId;
  pageNumber: number;
  copiedItems: number;
}

function cloneState(state: PageState | undefined): PageState {
  if (!state) return {};
  const copy: PageState = {};
  if (state.calibration) copy.calibration = structuredClone(state.calibration);
  if (state.scaleLocked) copy.scaleLocked = true;
  if (state.name) copy.name = state.name;
  if (state.building) copy.building = state.building;
  if (state.floor) copy.floor = state.floor;
  if (state.ocr) copy.ocr = structuredClone(state.ocr);
  return copy;
}

function cloneItem(item: MarkupItem, pageId: PageId, now: string): MarkupItem {
  return {
    ...item,
    id: makeId("item"),
    pageId,
    points: item.points.map((point) => ({ ...point })),
    textOffset: item.textOffset ? { ...item.textOffset } : undefined,
    labelOffset: item.labelOffset ? { ...item.labelOffset } : undefined,
    labelAnchor: item.labelAnchor ? { ...item.labelAnchor } : undefined,
    scale: item.scale ? { ...item.scale } : item.scale,
    createdAt: now,
    updatedAt: now,
  };
}

function documentForNewPage(project: Project, documentId: string): string | null {
  const document = project.documents.find((entry) => entry.id === documentId);
  if (!document) return null;
  // A template sheet owns its fields on the document. A duplicated or inserted
  // sheet needs its own document record so editing one sheet cannot alter the
  // other.
  if (document.kind !== "template" || !document.template) return document.id;
  const copy = {
    ...document,
    id: makeId("doc"),
    template: {
      ...document.template,
      fields: { ...document.template.fields },
    },
  };
  project.documents.push(copy);
  return copy.id;
}

export function insertPage(project: Project, options: InsertPageOptions): PageRecord | null {
  const document = project.documents.find((entry) => entry.id === options.documentId);
  if (!document) return null;
  const localPage = Math.round(options.localPage);
  if (localPage < 1 || localPage > document.pageCount) return null;
  const documentId = documentForNewPage(project, document.id);
  if (!documentId) return null;
  const record: PageRecord = {
    id: makeId("page"),
    documentId,
    localPage,
    state: cloneState(options.state),
  };
  const index =
    options.index === undefined
      ? project.pages.length
      : Math.max(0, Math.min(project.pages.length, options.index));
  project.pages.splice(index, 0, record);
  project.updatedAt = new Date().toISOString();
  return record;
}

/** Moves a page to a new 0-based index. Identity and references never change. */
export function movePage(project: Project, pageId: PageId, targetIndex: number): boolean {
  const from = pageIndex(project, pageId);
  if (from < 0) return false;
  const to = Math.max(0, Math.min(project.pages.length - 1, Math.round(targetIndex)));
  if (to === from) return false;
  const [record] = project.pages.splice(from, 1);
  project.pages.splice(to, 0, record);
  project.updatedAt = new Date().toISOString();
  return true;
}

export function movePageBy(project: Project, pageId: PageId, delta: number): boolean {
  return movePage(project, pageId, pageIndex(project, pageId) + delta);
}

function layerHasPageReference(layer: Layer): boolean {
  return Boolean(
    layer.homePageId ||
    layer.items.length ||
    (layer.pageState && Object.keys(layer.pageState).length),
  );
}

function ensureLayerKinds(project: Project, fallbackPageId: PageId | null): void {
  for (const kind of ["measure", "draw"] as const) {
    if (project.layers.some((layer) => layer.kind === kind)) continue;
    project.layers.push(createLayer(kind, undefined, undefined, fallbackPageId ?? undefined));
  }
  project.layers = normalizeLayerOrder(project.layers);
}

function removeUnusedAssets(project: Project): void {
  const used = new Set<string>();
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (item.kind === "image" && item.image) used.add(item.image.assetId);
    }
  }
  for (const assetId of Object.keys(project.assets)) {
    if (!used.has(assetId)) delete project.assets[assetId];
  }
}

/**
 * Deletes one page record, its items, its layer page state and any layer that
 * pointed only at it. Later pages keep their identity and are never renumbered
 * in stored data. A document with no remaining page records is removed.
 */
export function deletePage(project: Project, pageId: PageId): DeletePageSummary | null {
  const index = pageIndex(project, pageId);
  if (index < 0) return null;
  const displayNumber = pageNumber(project, pageId);
  const [record] = project.pages.splice(index, 1);

  let removedItems = 0;
  for (const layer of project.layers) {
    const before = layer.items.length;
    layer.items = layer.items.filter((item) => item.pageId !== pageId);
    removedItems += before - layer.items.length;
    if (layer.pageState) {
      delete layer.pageState[pageId];
      if (!Object.keys(layer.pageState).length) delete layer.pageState;
    }
    if (layer.homePageId === pageId) layer.homePageId = undefined;
  }

  const beforeLayers = project.layers.length;
  const fallbackPageId = project.pages[Math.min(index, project.pages.length - 1)]?.id ?? null;
  project.layers = project.layers.filter((layer) => {
    if (layerHasPageReference(layer)) return true;
    return false;
  });
  const removedLayers = beforeLayers - project.layers.length;
  // A layer that lost its home page but still has items keeps no home page.
  // Layers without any page reference are only kept while the project is empty.
  if (!project.pages.length) project.layers = [];
  ensureLayerKinds(project, fallbackPageId);

  // Documents stay in place so renderer document indices remain aligned. An
  // explicit cleanup or a later document-management action removes unused refs.
  const removedDocuments: string[] = [];
  removeUnusedAssets(project);

  if (!project.layers.some((layer) => layer.id === project.activeLayerId)) {
    project.activeLayerId = project.layers[0]?.id ?? "";
  }
  project.updatedAt = new Date().toISOString();
  return {
    pageId: record.id,
    pageNumber: displayNumber,
    removedItems,
    removedLayers,
    removedDocuments,
    nextPageId: project.pages[Math.min(index, project.pages.length - 1)]?.id ?? null,
  };
}

/**
 * Duplicates a page as a new PageRecord pointing at the same source page. The
 * source PDF is never copied or modified; only the project page is new.
 */
export function duplicatePage(
  project: Project,
  pageId: PageId,
  options: DuplicatePageOptions,
): DuplicatePageSummary | null {
  const source = pageRecordById(project, pageId);
  if (!source) return null;
  const documentId = documentForNewPage(project, source.documentId);
  if (!documentId) return null;
  const now = new Date().toISOString();
  const record: PageRecord = {
    id: makeId("page"),
    documentId,
    localPage: source.localPage,
    state: options.copyScale || options.copyName ? cloneState(source.state) : {},
  };
  // Location follows the duplicated sheet even when scale or name are not copied.
  if (source.state.building) record.state.building = source.state.building;
  if (source.state.floor) record.state.floor = source.state.floor;
  if (options.copyName) {
    const name = options.name.trim().slice(0, 80);
    if (name) record.state.name = name;
    else delete record.state.name;
  } else {
    delete record.state.name;
  }

  project.pages.push(record);
  let copiedItems = 0;
  for (const layer of project.layers) {
    if (options.copyMarkups) {
      const sourceItems = layer.items.filter((item) => item.pageId === pageId);
      for (const item of sourceItems) {
        layer.items.push(cloneItem(item, record.id, now));
        copiedItems += 1;
      }
    }
    const override = layer.pageState?.[pageId];
    if (override) {
      layer.pageState ??= {};
      layer.pageState[record.id] = { ...override };
    }
  }
  project.updatedAt = now;
  return {
    pageId: record.id,
    pageNumber: pageNumber(project, record.id),
    copiedItems,
  };
}

/** Removes empty layers left behind by page deletion. Explicit cleanup action. */
export function cleanupEmptyLayers(project: Project): number {
  const before = project.layers.length;
  project.layers = project.layers.filter((layer) => layerHasPageReference(layer));
  ensureLayerKinds(project, project.pages[0]?.id ?? null);
  if (!project.layers.some((layer) => layer.id === project.activeLayerId)) {
    project.activeLayerId = project.layers[0]?.id ?? "";
  }
  project.updatedAt = new Date().toISOString();
  return Math.max(0, before - project.layers.length);
}

/** Explicit cleanup for a superseded document and every page still on it. */
export function removeDocumentAndPages(project: Project, documentId: string): number {
  const pageIds = project.pages
    .filter((record) => record.documentId === documentId)
    .map((record) => record.id);
  for (const pageId of pageIds) deletePage(project, pageId);
  const index = project.documents.findIndex((document) => document.id === documentId);
  if (index >= 0) project.documents.splice(index, 1);
  project.updatedAt = new Date().toISOString();
  return pageIds.length;
}

export function layerKindHasPages(project: Project, kind: LayerKind): boolean {
  return project.layers
    .filter((layer) => layer.kind === kind)
    .some((layer) => layerHasPageReference(layer));
}
