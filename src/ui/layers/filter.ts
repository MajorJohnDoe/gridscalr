import { buildLayerTreeRows, type LayerTreeRow } from "../../features/layerTree";
import { matchesFilterText, normalizeFilterQuery } from "../../features/listInteraction";
import { itemKindLabel } from "../../model/measure";
import type { Layer, MarkupItem, Project } from "../../model/types";
import { layerView } from "./state";

/**
 * Layer-list filtering and the rendered tree rows. A layer matches when its own
 * name or any item it shows in the current scope matches, so searching for
 * "door" finds both the Door layer and a layer that happens to contain a door
 * count. Groups stay visible while a nested layer matches, so a search never
 * hides the parent path of a hit.
 */

export type LayerScope = "page" | "all";

/** Items a layer shows in the current scope. */
export function scopeItemsFor(layer: Layer, scope: LayerScope, pageId: string): MarkupItem[] {
  return scope === "page" ? layer.items.filter((item) => item.pageId === pageId) : layer.items;
}

export function layerMatchesQuery(
  layer: Layer,
  scope: LayerScope,
  pageId: string,
  query: string,
): boolean {
  const normalized = normalizeFilterQuery(query);
  if (!normalized) return true;
  if (matchesFilterText(layer.name, normalized)) return true;
  return scopeItemsFor(layer, scope, pageId).some((item) =>
    matchesFilterText(
      `${item.label ?? ""} ${itemKindLabel(item.kind)} ${item.room ?? ""}`,
      normalized,
    ),
  );
}

/** Rows the Layers panel renders for the current scope, search and expansion. */
export function visibleLayerRows(project: Pick<Project, "layers">, pageId: string): LayerTreeRow[] {
  return buildLayerTreeRows(project, {
    scope: layerView.scope,
    pageId,
    query: layerView.query,
    matches: (layer) => layerMatchesQuery(layer, layerView.scope, pageId, layerView.query),
    expanded: layerView.expanded,
  });
}
