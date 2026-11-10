import type { Layer, PageId, Project } from "../../model/types";

/**
 * Import page and layer mapping helpers. A source layer keeps one destination
 * layer identity across every imported page, keyed by its stable source ID and
 * kind; display names are never used for matching.
 */

export function importedLayerIdentity(layer: Pick<Layer, "id" | "kind">): string {
  return `${layer.kind}\u0000${layer.id}`;
}

export function destinationLayerForSource<T>(
  layers: Map<string, T>,
  sourceLayer: Pick<Layer, "id" | "kind">,
): T | undefined {
  return layers.get(importedLayerIdentity(sourceLayer));
}

export function rememberSourceLayer<T>(
  layers: Map<string, T>,
  sourceLayer: Pick<Layer, "id" | "kind">,
  destination: T,
): T {
  layers.set(importedLayerIdentity(sourceLayer), destination);
  return destination;
}

/** Import appends unless an explicit insertion index is provided. */
export function importInsertionIndex(project: Project, requested?: number): number {
  if (requested === undefined) return project.pages.length;
  return Math.max(0, Math.min(project.pages.length, Math.round(requested)));
}

/** Page IDs created for one import, in source selection order. */
export function importedPageIds(
  pageMap: ReadonlyArray<{ sourcePageId: PageId; newPageId: PageId }>,
): Map<PageId, PageId> {
  return new Map(pageMap.map((entry) => [entry.sourcePageId, entry.newPageId]));
}
