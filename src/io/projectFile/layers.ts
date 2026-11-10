import { normalizeColor } from "../../model/color";
import { createLayer, defaultColorForLayer, normalizeLayerOrder } from "../../model/layers";
import type { Layer, LayerPageState, PageId } from "../../model/types";
import { normalizeItem } from "./items";

export function normalizeLayerPageState(
  value: unknown,
  pageIds: ReadonlySet<PageId>,
): Record<PageId, LayerPageState> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const states: Record<PageId, LayerPageState> = {};
  for (const [key, rawState] of Object.entries(value)) {
    if (!pageIds.has(key)) continue;
    if (typeof rawState !== "object" || rawState === null) continue;
    const raw = rawState as LayerPageState;
    const state: LayerPageState = {};
    if (typeof raw.visible === "boolean") state.visible = raw.visible;
    if (typeof raw.locked === "boolean") state.locked = raw.locked;
    if (state.visible !== undefined || state.locked !== undefined) states[key] = state;
  }
  return Object.keys(states).length ? states : undefined;
}

export function normalizeLayers(
  rawLayers: unknown,
  categoryIds: ReadonlySet<string>,
  countTypeIds: ReadonlySet<string>,
  fallbackCategoryId: string,
  assetIds: ReadonlySet<string>,
  pageIds: ReadonlySet<PageId>,
  fallbackPageId: PageId | null,
): Layer[] {
  const layers: Layer[] = [];
  if (Array.isArray(rawLayers)) {
    for (const value of rawLayers) {
      if (typeof value !== "object" || value === null) continue;
      const raw = value as Partial<Layer>;
      if (raw.kind !== "measure" && raw.kind !== "draw") continue;
      const layer: Layer = {
        id:
          typeof raw.id === "string"
            ? raw.id
            : `layer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name:
          typeof raw.name === "string" && raw.name.trim()
            ? raw.name.trim()
            : raw.kind === "measure"
              ? "Measurements"
              : "Markups",
        kind: raw.kind,
        visible: raw.visible !== false,
        locked: raw.locked === true,
        opacity: typeof raw.opacity === "number" ? Math.max(0, Math.min(1, raw.opacity)) : 1,
        color: normalizeColor(raw.color, defaultColorForLayer(raw.kind)),
        items: [],
      };
      const homePageId =
        typeof raw.homePageId === "string" && pageIds.has(raw.homePageId)
          ? raw.homePageId
          : undefined;
      if (homePageId) layer.homePageId = homePageId;
      const pageState = normalizeLayerPageState(raw.pageState, pageIds);
      if (pageState) layer.pageState = pageState;
      if (Array.isArray(raw.items)) {
        for (const item of raw.items) {
          const normalized = normalizeItem(
            item,
            layer.kind,
            layer.color,
            categoryIds,
            fallbackCategoryId,
            assetIds,
            countTypeIds,
            pageIds,
            fallbackPageId,
          );
          if (normalized) layer.items.push(normalized);
        }
      }
      // Older empty layers had no page membership. Keep them discoverable on
      // the first page instead of hiding them from page-scoped Layers.
      if (!layer.homePageId && layer.items.length === 0 && fallbackPageId) {
        layer.homePageId = fallbackPageId;
      }
      layers.push(layer);
    }
  }

  if (!layers.some((l) => l.kind === "measure"))
    layers.push(createLayer("measure", "Measurements", undefined, fallbackPageId ?? undefined));
  if (!layers.some((l) => l.kind === "draw"))
    layers.push(createLayer("draw", "Markups", undefined, fallbackPageId ?? undefined));
  const ids = new Set<string>();
  return normalizeLayerOrder(
    layers.map((layer) => {
      if (ids.has(layer.id)) layer.id = `${layer.id}_${Math.random().toString(36).slice(2, 6)}`;
      ids.add(layer.id);
      return layer;
    }),
  );
}
