import { makeId } from "../../model/calibration";
import { importedLayerIdentity, importInsertionIndex } from "../pageModel";
import { normalizeLayerOrder } from "../../model/layers";
import { pageRecordAt, pageNumber } from "../../model/pages";
import type {
  Category,
  CountTypeDef,
  DocumentKind,
  DocumentRef,
  ImageAsset,
  Layer,
  LineType,
  PageId,
  PageRecord,
  Project,
} from "../../model/types";
import {
  applyImportedLayerPageState,
  cloneImportedItem,
  clonePageState,
  collectReferences,
  createImportedLayer,
  mergeAssets,
  mergeCategories,
  mergeCountTypes,
  mergeLineTypes,
  prepareDocument,
} from "./merge";

export interface ImportPageInfo {
  /** 1-based page in the source project (display order). */
  page: number;
  documentIndex: number;
  documentId: string;
  documentName: string;
  documentKind: DocumentKind;
  /** 1-based page inside the source document. */
  localPage: number;
  name?: string;
  building?: string;
  floor?: string;
  itemCount: number;
}

export interface ImportDocumentGroup {
  documentId: string;
  documentName: string;
  documentKind: DocumentKind;
  pageCount: number;
  pages: ImportPageInfo[];
}

export interface ImportDocumentOverride {
  /** Actual page count after loading the source document. */
  pageCount?: number;
  /** Absolute path to the resolved source file. */
  path?: string | null;
  sha256?: string;
  sizeBytes?: number;
  /** Drop stale OCR when the source file was relinked. */
  dropOcr?: boolean;
}

export type ImportDocumentOverrides = ReadonlyMap<string, ImportDocumentOverride>;

export interface ImportPageMapEntry {
  sourcePage: number;
  newPage: number;
  sourcePageId: PageId;
  newPageId: PageId;
  sourceDocumentId: string;
  newDocumentId: string;
  sourceLocalPage: number;
}

/** Revision identity captured when importing from another project file. */
export interface ImportProvenanceSource {
  sourceProjectId: string;
  sourceRevisionSha256: string;
  sourceRevisionSize: number;
  sourceRevisionModifiedAt: string | null;
  appVersion: string;
}

export type ImportWarning =
  | {
      code: "units";
      sourceLengthUnit: string;
      sourceAreaUnit: string;
      destinationLengthUnit: string;
      destinationAreaUnit: string;
    }
  | { code: "missingCategory"; count: number }
  | { code: "missingCountType"; count: number }
  | { code: "missingLineType"; count: number }
  | { code: "missingImage"; count: number }
  | { code: "ocrDropped"; count: number };

export interface PreparedProjectImport {
  documents: DocumentRef[];
  pages: PageRecord[];
  createdLayers: Layer[];
  categories: Category[];
  countTypes: CountTypeDef[];
  lineTypes: LineType[];
  assets: Record<string, ImageAsset>;
  pageMap: ImportPageMapEntry[];
  /** 0-based insertion index. Missing appends. */
  insertIndex?: number;
  activeLayerId: string | null;
  warnings: ImportWarning[];
}

export interface ImportCommitResult {
  pageMap: ImportPageMapEntry[];
  createdLayerIds: string[];
  importedItemCount: number;
  warnings: ImportWarning[];
}

export type ProjectImportErrorCode = "noSelection" | "invalidPage";

export class ProjectImportError extends Error {
  constructor(
    readonly code: ProjectImportErrorCode,
    readonly page?: number,
  ) {
    super(code);
    this.name = "ProjectImportError";
  }
}

/** Pages in the source project, grouped in document order for the picker. */
export function inspectProjectImport(source: Project): ImportDocumentGroup[] {
  const counts = new Map<PageId, number>();
  for (const layer of source.layers) {
    for (const item of layer.items) {
      counts.set(item.pageId, (counts.get(item.pageId) ?? 0) + 1);
    }
  }

  const groups = new Map<string, ImportDocumentGroup>();
  for (const document of source.documents) {
    groups.set(document.id, {
      documentId: document.id,
      documentName: document.name,
      documentKind: document.kind,
      pageCount: document.pageCount,
      pages: [],
    });
  }
  source.pages.forEach((record, index) => {
    const document = source.documents.find((entry) => entry.id === record.documentId);
    const group = document ? groups.get(document.id) : undefined;
    if (!document || !group) return;
    group.pages.push({
      page: index + 1,
      documentIndex: source.documents.indexOf(document),
      documentId: document.id,
      documentName: document.name,
      documentKind: document.kind,
      localPage: record.localPage,
      name: record.state.name,
      building: record.state.building,
      floor: record.state.floor,
      itemCount: counts.get(record.id) ?? 0,
    });
  });
  return [...groups.values()].filter((group) => group.pages.length > 0);
}

interface SourcePageEntry {
  record: PageRecord;
  sourcePage: number;
  documentIndex: number;
}

/**
 * Builds everything needed to append source pages. The source project is only
 * read: all copied objects are new, and no source field is modified.
 *
 * One destination layer is created per source layer identity, shared across
 * every imported page through stable page IDs. Layers are never matched by
 * display name.
 */
export function prepareProjectImport(
  destination: Project,
  source: Project,
  pages: readonly number[],
  overrides: ImportDocumentOverrides = new Map(),
  insertIndex?: number,
  provenance?: ImportProvenanceSource,
): PreparedProjectImport {
  const selectedNumbers = [...new Set(pages.map((page) => Math.round(page)))].sort((a, b) => a - b);
  if (!selectedNumbers.length) throw new ProjectImportError("noSelection");

  const lookup = new Map<number, SourcePageEntry>();
  source.pages.forEach((record, index) => {
    const documentIndex = source.documents.findIndex((doc) => doc.id === record.documentId);
    if (documentIndex < 0) return;
    lookup.set(index + 1, { record, sourcePage: index + 1, documentIndex });
  });
  for (const page of selectedNumbers) {
    if (!lookup.has(page)) throw new ProjectImportError("invalidPage", page);
  }

  const selected = selectedNumbers.map((page) => lookup.get(page)!);
  const selectedIds = new Set(selected.map((entry) => entry.record.id));
  const references = collectReferences(source, selectedIds);
  const categories = mergeCategories(destination, source, references.categories);
  const countTypes = mergeCountTypes(destination, source, references.countTypes);
  const lineTypes = mergeLineTypes(destination, source, references.lineTypes);
  const assets = mergeAssets(destination, source, references.assets);

  const warnings: ImportWarning[] = [];
  if (
    source.settings.lengthUnit !== destination.settings.lengthUnit ||
    source.settings.areaUnit !== destination.settings.areaUnit
  ) {
    warnings.push({
      code: "units",
      sourceLengthUnit: source.settings.lengthUnit,
      sourceAreaUnit: source.settings.areaUnit,
      destinationLengthUnit: destination.settings.lengthUnit,
      destinationAreaUnit: destination.settings.areaUnit,
    });
  }
  if (categories.missing) warnings.push({ code: "missingCategory", count: categories.missing });
  if (countTypes.missing) warnings.push({ code: "missingCountType", count: countTypes.missing });
  if (lineTypes.missing) warnings.push({ code: "missingLineType", count: lineTypes.missing });

  const groups = new Map<number, SourcePageEntry[]>();
  for (const entry of selected) {
    const list = groups.get(entry.documentIndex) ?? [];
    list.push(entry);
    groups.set(entry.documentIndex, list);
  }

  let nextPage = importInsertionIndex(destination, insertIndex) + 1;
  let ocrDropped = 0;
  let imageItemsSkipped = 0;
  const importedAt = provenance ? new Date().toISOString() : null;
  const documents: DocumentRef[] = [];
  const pagesOut: PageRecord[] = [];
  const pageMap: ImportPageMapEntry[] = [];
  const createdLayers: Layer[] = [];
  const layersBySourceId = new Map<string, Layer>();

  for (const documentIndex of [...groups.keys()].sort((a, b) => a - b)) {
    const sourceDocument = source.documents[documentIndex];
    const entries = [...groups.get(documentIndex)!].sort(
      (a, b) => a.record.localPage - b.record.localPage,
    );
    const localPages = entries.map((entry) => entry.record.localPage);
    const override = overrides.get(sourceDocument.id);
    const actualPageCount = override?.pageCount ?? sourceDocument.pageCount;
    for (const localPage of localPages) {
      if (localPage > actualPageCount) {
        throw new ProjectImportError(
          "invalidPage",
          entries.find((entry) => entry.record.localPage === localPage)?.sourcePage,
        );
      }
    }
    const documentRef = prepareDocument(
      sourceDocument,
      destination,
      actualPageCount,
      localPages,
      override,
    );
    documents.push(documentRef);

    for (const entry of entries) {
      const newPageId = makeId("page");
      const newPage = nextPage++;
      const sourceState = entry.record.state;
      const state = clonePageState(
        sourceState,
        documentRef,
        entry.record.localPage,
        override?.dropOcr === true,
      );
      if (sourceState?.ocr && !state?.ocr) ocrDropped += 1;
      pagesOut.push({
        id: newPageId,
        documentId: documentRef.id,
        localPage: entry.record.localPage,
        state: state ?? {},
        ...(provenance && importedAt
          ? {
              provenance: {
                ...provenance,
                sourcePageId: entry.record.id,
                importedAt,
              },
            }
          : {}),
      });
      pageMap.push({
        sourcePage: entry.sourcePage,
        newPage,
        sourcePageId: entry.record.id,
        newPageId,
        sourceDocumentId: sourceDocument.id,
        newDocumentId: documentRef.id,
        sourceLocalPage: entry.record.localPage,
      });

      for (const sourceLayer of source.layers) {
        const pageItems = sourceLayer.items.filter((item) => item.pageId === entry.record.id);
        const hasOverride = Boolean(sourceLayer.pageState?.[entry.record.id]);
        if (!pageItems.length && !hasOverride) continue;
        const identity = importedLayerIdentity(sourceLayer);
        let layer = layersBySourceId.get(identity);
        if (!layer) {
          layer = createImportedLayer(sourceLayer, newPageId);
          layersBySourceId.set(identity, layer);
          createdLayers.push(layer);
        }
        applyImportedLayerPageState(layer, sourceLayer, entry.record.id, newPageId);
        for (const item of pageItems) {
          const copy = cloneImportedItem(
            item,
            newPageId,
            categories.map,
            countTypes.map,
            lineTypes.map,
            assets.map,
            destination.settings.quantity.defaultCategoryId,
          );
          if (!copy) {
            imageItemsSkipped += 1;
            continue;
          }
          layer.items.push(copy);
        }
      }
    }
  }

  if (ocrDropped) warnings.push({ code: "ocrDropped", count: ocrDropped });
  if (imageItemsSkipped) warnings.push({ code: "missingImage", count: imageItemsSkipped });

  const preferredKind = destination.layers.find(
    (layer) => layer.id === destination.activeLayerId,
  )?.kind;
  const activeLayer =
    createdLayers.find((layer) => layer.kind === preferredKind) ??
    createdLayers.find((layer) => layer.kind === "draw") ??
    createdLayers[0];

  return {
    documents,
    pages: pagesOut,
    createdLayers,
    categories: categories.added,
    countTypes: countTypes.added,
    lineTypes: lineTypes.added,
    assets: assets.added,
    pageMap,
    insertIndex,
    activeLayerId: activeLayer?.id ?? null,
    warnings,
  };
}

/** Applies a prepared import. The caller records one history step around this. */
export function commitProjectImport(
  destination: Project,
  prepared: PreparedProjectImport,
): ImportCommitResult {
  destination.documents.push(...prepared.documents);
  const index =
    prepared.insertIndex === undefined
      ? destination.pages.length
      : Math.max(0, Math.min(destination.pages.length, prepared.insertIndex));
  destination.pages.splice(index, 0, ...prepared.pages);
  destination.categories.push(...prepared.categories);
  destination.countTypes.push(...prepared.countTypes);
  destination.lineTypes.push(...prepared.lineTypes);
  Object.assign(destination.assets, prepared.assets);
  destination.layers = normalizeLayerOrder([...destination.layers, ...prepared.createdLayers]);
  if (
    prepared.activeLayerId &&
    destination.layers.some((layer) => layer.id === prepared.activeLayerId)
  ) {
    destination.activeLayerId = prepared.activeLayerId;
  }
  destination.updatedAt = new Date().toISOString();

  return {
    pageMap: prepared.pageMap,
    createdLayerIds: prepared.createdLayers.map((layer) => layer.id),
    importedItemCount: prepared.createdLayers.reduce((sum, layer) => sum + layer.items.length, 0),
    warnings: prepared.warnings,
  };
}

/** Display page number for a committed page ID. */
export function importedPageNumber(destination: Project, pageId: PageId): number {
  return pageNumber(destination, pageId);
}

/** Source page record at a 1-based display number. */
export function sourcePageAt(source: Project, page: number): PageRecord | undefined {
  return pageRecordAt(source, page);
}
