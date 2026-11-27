import { normalizeLayerOrder } from "../../../model/layers";
import { pageRecordAt, pageNumber } from "../../../model/pages";
import type { PageId, PageRecord, Project } from "../../../model/types";
import { clearUnresolvedImportReferences, emptyImportUnresolvedCounts } from "../unresolved";
import type { ImportCommitOptions, ImportCommitResult, PreparedProjectImport } from "./types";

/** Applies a prepared import. The caller records one history step around this. */
export function commitProjectImport(
  destination: Project,
  prepared: PreparedProjectImport,
  options: ImportCommitOptions = {},
): ImportCommitResult {
  const unresolved = options.clearUnresolved
    ? clearUnresolvedImportReferences(prepared, destination)
    : emptyImportUnresolvedCounts();
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
    unresolved,
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
