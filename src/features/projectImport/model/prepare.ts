import { makeId } from "../../../model/calibration";
import { importedLayerIdentity, importInsertionIndex } from "../../pageModel";
import type { DocumentRef, Layer, PageRecord, Project } from "../../../model/types";
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
} from "../merge";
import {
  ProjectImportError,
  type ImportDocumentOverrides,
  type ImportProvenanceSource,
  type ImportWarning,
  type PreparedProjectImport,
} from "./types";

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
  const pageMap: PreparedProjectImport["pageMap"] = [];
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
