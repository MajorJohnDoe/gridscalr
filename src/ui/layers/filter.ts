import { buildLayerTreeRows, type LayerTreeRow } from "../../features/layerTree";
import { matchesFilterText, normalizeFilterQuery } from "../../features/listInteraction";
import { itemKindLabel } from "../../model/measure";
import type { Layer, MarkupItem, Project } from "../../model/types";
import { layerView } from "./state";

/**
 * Layer-list filtering and the rendered tree rows. The panel always works on
 * the open page, so a layer matches when its own name or any item on that page
 * matches. Groups stay visible while a nested layer matches, so a search never
 * hides the parent path of a hit.
 */

export type LayerScope = "page" | "all";

/** Items a layer shows in the current scope. `all` is kept for report helpers. */
export function scopeItemsFor(layer: Layer, scope: LayerScope, pageId: string): MarkupItem[] {
  return scope === "page" ? layer.items.filter((item) => item.pageId === pageId) : layer.items;
}

function itemMatchesText(item: MarkupItem, normalized: string): boolean {
  return matchesFilterText(
    `${item.label ?? ""} ${itemKindLabel(item.kind)} ${item.room ?? ""}`,
    normalized,
  );
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
  return scopeItemsFor(layer, scope, pageId).some((item) => itemMatchesText(item, normalized));
}

/**
 * Items of one layer that the search should reveal. With an empty query this is
 * every item on the page; with a query it is the matching subset, so a hit on an
 * item name shows the item instead of only its layer.
 */
export function matchingItems(layer: Layer, pageId: string, query: string): MarkupItem[] {
  const items = scopeItemsFor(layer, "page", pageId);
  const normalized = normalizeFilterQuery(query);
  if (!normalized) return items;
  return items.filter((item) => itemMatchesText(item, normalized));
}

/** Rows the Layers panel renders for the current search and expansion. */
export function visibleLayerRows(project: Pick<Project, "layers">, pageId: string): LayerTreeRow[] {
  return buildLayerTreeRows(project, {
    scope: "page",
    pageId,
    query: layerView.query,
    matches: (layer) => layerMatchesQuery(layer, "page", pageId, layerView.query),
    expanded: layerView.expanded,
  });
}
