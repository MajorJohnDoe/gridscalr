import { createLayer, normalizeLayerOrder } from "../../model/layers";
import type { Layer, LayerPageState } from "../../model/types";
import { normalizeItem } from "./items";

export function normalizeLayerPageState(
  value: unknown,
  totalPages: number,
): Record<string, LayerPageState> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const states: Record<string, LayerPageState> = {};
  for (const [key, rawState] of Object.entries(value)) {
    const page = Number(key);
    if (!Number.isInteger(page) || page < 1 || page > totalPages) continue;
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
  totalPages: number,
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
        color:
          typeof raw.color === "string"
            ? raw.color
            : raw.kind === "measure"
              ? "#4cc9f0"
              : "#f2a93b",
        items: [],
      };
      const homePage =
        typeof raw.homePage === "number" &&
        Number.isInteger(raw.homePage) &&
        raw.homePage >= 1 &&
        raw.homePage <= totalPages
          ? raw.homePage
          : undefined;
      if (homePage) layer.homePage = homePage;
      const pageState = normalizeLayerPageState(raw.pageState, totalPages);
      if (pageState) layer.pageState = pageState;
      if (Array.isArray(raw.items)) {
        for (const item of raw.items) {
          const normalized = normalizeItem(
            item,
            layer.kind,
            categoryIds,
            fallbackCategoryId,
            assetIds,
            countTypeIds,
          );
          if (normalized) layer.items.push(normalized);
        }
      }
      // Older empty layers had no page membership. Keep them discoverable on
      // the first page instead of hiding them from page-scoped Layers.
      if (!layer.homePage && layer.items.length === 0) layer.homePage = 1;
      layers.push(layer);
    }
  }

  if (!layers.some((l) => l.kind === "measure"))
    layers.push(createLayer("measure", "Measurements", undefined, 1));
  if (!layers.some((l) => l.kind === "draw"))
    layers.push(createLayer("draw", "Markups", undefined, 1));
  const ids = new Set<string>();
  return normalizeLayerOrder(
    layers.map((layer) => {
      if (ids.has(layer.id)) layer.id = `${layer.id}_${Math.random().toString(36).slice(2, 6)}`;
      ids.add(layer.id);
      return layer;
    }),
  );
}
