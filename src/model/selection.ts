import { findItem } from "./layers";
import { buildLayerHierarchy, layerEffectiveState } from "./layerHierarchy";
import type { Layer, LayerKind, MarkupItem, PageId, Project, SelectionRef } from "./types";

export interface ResolvedSelection {
  ref: SelectionRef;
  layer: Layer;
  item: MarkupItem;
  locked: boolean;
}

export function selectionKey(ref: Pick<SelectionRef, "layerId" | "itemId">): string {
  return `${ref.layerId}\u0000${ref.itemId}`;
}

export function uniqueSelectionRefs(refs: SelectionRef[]): SelectionRef[] {
  const seen = new Set<string>();
  const unique: SelectionRef[] = [];
  for (const ref of refs) {
    if (!ref?.layerId || !ref?.itemId) continue;
    const key = selectionKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ layerId: ref.layerId, itemId: ref.itemId });
  }
  return unique;
}

export function resolveSelection(project: Project, refs: SelectionRef[]): ResolvedSelection[] {
  const resolved: ResolvedSelection[] = [];
  const hierarchy = buildLayerHierarchy(project.layers);
  for (const ref of uniqueSelectionRefs(refs)) {
    const found = findItem(project, ref.itemId);
    if (!found || found.layer.id !== ref.layerId) continue;
    resolved.push({
      ref,
      layer: found.layer,
      item: found.item,
      locked:
        found.item.locked === true ||
        (layerEffectiveState(hierarchy, found.layer.id, found.item.pageId)?.locked ?? false),
    });
  }
  return resolved;
}

export function selectionKind(project: Project, refs: SelectionRef[]): LayerKind | null {
  const layers = resolveSelection(project, refs).map((entry) => entry.layer.kind);
  if (!layers.length) return null;
  return layers.every((kind) => kind === layers[0]) ? layers[0] : null;
}

export function selectionPage(project: Project, refs: SelectionRef[]): PageId | null {
  const pages = resolveSelection(project, refs).map((entry) => entry.item.pageId);
  if (!pages.length) return null;
  return pages.every((pageId) => pageId === pages[0]) ? pages[0] : null;
}
