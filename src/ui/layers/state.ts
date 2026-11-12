import { toggleCollapsedKey } from "../../features/listInteraction";
import type { LayerScope } from "./filter";

/**
 * Session view state for the Layers list. Scope, search, expansion and the item
 * selection anchor are view-only: they stay out of the project file, out of the
 * undo history and out of the store. The panel owns them so a re-render keeps
 * the list where the user left it.
 */

export const layerView = {
  scope: "page" as LayerScope,
  query: "",
  /** Expanded layer IDs; the set is the inverse of a collapsed-group state. */
  expanded: new Set<string>(),
  /** Anchor item key for Shift-click ranges, as `layerId\u0000itemId`. */
  itemAnchor: null as string | null,
  /** One-shot flags so a re-render can restore focus to the control used. */
  focusSearch: false,
  focusScope: null as LayerScope | null,
  /** Row to focus after a re-render, for a tree disclosure or a move. */
  focusLayerId: null as string | null,
  /** Last plain click, used for the inline-rename double click. */
  lastClick: null as { id: string; time: number } | null,
};

export function setLayerScope(scope: LayerScope): void {
  if (layerView.scope === scope) return;
  layerView.scope = scope;
  layerView.focusScope = scope;
  layerView.expanded = new Set<string>();
}

export function setLayerQuery(query: string): void {
  layerView.query = query;
  layerView.focusSearch = true;
}

export function toggleLayerExpanded(layerId: string): void {
  layerView.expanded = toggleCollapsedKey(layerView.expanded, layerId);
}

export function expandLayerIds(ids: Iterable<string>): void {
  const next = new Set(layerView.expanded);
  for (const id of ids) next.add(id);
  layerView.expanded = next;
}

export function collapseAllLayers(): void {
  layerView.expanded = new Set<string>();
}

export function expandAllLayers(ids: Iterable<string>): void {
  layerView.expanded = new Set(ids);
}

export function focusLayer(layerId: string): void {
  layerView.focusLayerId = layerId;
}

export function takeLayerFocus(): {
  search: boolean;
  scope: LayerScope | null;
  layerId: string | null;
} {
  const focus = {
    search: layerView.focusSearch,
    scope: layerView.focusScope,
    layerId: layerView.focusLayerId,
  };
  layerView.focusSearch = false;
  layerView.focusScope = null;
  layerView.focusLayerId = null;
  return focus;
}
