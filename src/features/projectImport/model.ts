import { documentStartPage, includedLocalPages, totalPageCount } from "../../model/documents";
import { normalizeLayerOrder } from "../../model/layers";
import type {
  Category,
  CountTypeDef,
  DocumentKind,
  DocumentRef,
  ImageAsset,
  Layer,
  LineType,
  PageState,
  Project,
} from "../../model/types";
import {
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
  /** 1-based page in the source project. */
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
  sourceDocumentId: string;
  newDocumentId: string;
  sourceLocalPage: number;
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
  pageStates: Record<string, PageState>;
  createdLayers: Layer[];
  categories: Category[];
  countTypes: CountTypeDef[];
  lineTypes: LineType[];
  assets: Record<string, ImageAsset>;
  pageMap: ImportPageMapEntry[];
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
  const counts = new Map<number, number>();
  for (const layer of source.layers) {
    for (const item of layer.items) {
      counts.set(item.page, (counts.get(item.page) ?? 0) + 1);
    }
  }

  const groups: ImportDocumentGroup[] = [];
  source.documents.forEach((document, index) => {
    const localPages = includedLocalPages(document);
    if (!localPages.length) return;
    const start = documentStartPage(source.documents, index);
    const pages = localPages.map((localPage, offset): ImportPageInfo => {
      const page = start + offset;
      const state = source.pages[String(page)];
      return {
        page,
        documentIndex: index,
        documentId: document.id,
        documentName: document.name,
        documentKind: document.kind,
        localPage,
        name: state?.name,
        building: state?.building,
        floor: state?.floor,
        itemCount: counts.get(page) ?? 0,
      };
    });
    groups.push({
      documentId: document.id,
      documentName: document.name,
      documentKind: document.kind,
      pageCount: document.pageCount,
      pages,
    });
  });
  return groups;
}

/**
 * Builds everything needed to append source pages. The source project is only
 * read: all copied objects are new, and no source field is modified.
 */
export function prepareProjectImport(
  destination: Project,
  source: Project,
  pages: readonly number[],
  overrides: ImportDocumentOverrides = new Map(),
): PreparedProjectImport {
  const selected = [...new Set(pages.map((page) => Math.round(page)))].sort((a, b) => a - b);
  if (!selected.length) throw new ProjectImportError("noSelection");

  const total = totalPageCount(source.documents);
  for (const page of selected) {
    if (page < 1 || page > total) throw new ProjectImportError("invalidPage", page);
  }

  const pageLookup = new Map<number, { documentIndex: number; localPage: number }>();
  const localToGlobal = new Map<string, number>();
  source.documents.forEach((document, index) => {
    const start = documentStartPage(source.documents, index);
    includedLocalPages(document).forEach((localPage, offset) => {
      const page = start + offset;
      pageLookup.set(page, { documentIndex: index, localPage });
      localToGlobal.set(`${index}:${localPage}`, page);
    });
  });
  for (const page of selected) {
    if (!pageLookup.has(page)) throw new ProjectImportError("invalidPage", page);
  }

  const selectedSet = new Set(selected);
  const references = collectReferences(source, selectedSet);
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

  const groups = new Map<number, number[]>();
  for (const page of selected) {
    const entry = pageLookup.get(page)!;
    const list = groups.get(entry.documentIndex) ?? [];
    list.push(entry.localPage);
    groups.set(entry.documentIndex, list);
  }

  let nextPage = totalPageCount(destination.documents) + 1;
  let ocrDropped = 0;
  let imageItemsSkipped = 0;
  const documents: DocumentRef[] = [];
  const pageStates: Record<string, PageState> = {};
  const pageMap: ImportPageMapEntry[] = [];
  const createdLayers: Layer[] = [];

  for (const documentIndex of [...groups.keys()].sort((a, b) => a - b)) {
    const sourceDocument = source.documents[documentIndex];
    const localPages = groups.get(documentIndex)!.sort((a, b) => a - b);
    const override = overrides.get(sourceDocument.id);
    const actualPageCount = override?.pageCount ?? sourceDocument.pageCount;
    for (const localPage of localPages) {
      if (localPage > actualPageCount) {
        throw new ProjectImportError(
          "invalidPage",
          localToGlobal.get(`${documentIndex}:${localPage}`),
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

    for (const localPage of localPages) {
      const sourcePage = localToGlobal.get(`${documentIndex}:${localPage}`)!;
      const newPage = nextPage++;
      pageMap.push({
        sourcePage,
        newPage,
        sourceDocumentId: sourceDocument.id,
        newDocumentId: documentRef.id,
        sourceLocalPage: localPage,
      });

      const sourceState = source.pages[String(sourcePage)];
      const pageState = clonePageState(
        sourceState,
        documentRef,
        localPage,
        override?.dropOcr === true,
      );
      if (pageState) pageStates[String(newPage)] = pageState;
      if (sourceState?.ocr && !pageState?.ocr) ocrDropped += 1;

      for (const sourceLayer of source.layers) {
        const pageItems = sourceLayer.items.filter((item) => item.page === sourcePage);
        if (!pageItems.length) continue;
        const layer = createImportedLayer(sourceLayer, sourcePage, newPage);
        for (const item of pageItems) {
          const copy = cloneImportedItem(
            item,
            newPage,
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
        if (layer.items.length) createdLayers.push(layer);
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
    pageStates,
    createdLayers,
    categories: categories.added,
    countTypes: countTypes.added,
    lineTypes: lineTypes.added,
    assets: assets.added,
    pageMap,
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
  Object.assign(destination.pages, prepared.pageStates);
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
