import {
  DEFAULT_LAYER_COLORS,
  defaultLayerColors,
  resetDefaultLayerColors,
  setDefaultLayerColors,
  type LayerColorDefaults,
} from "../model/layers";

const LAYER_COLORS_KEY = "gridscalr.layerColors.v1";

/** Loads the local app defaults and applies them to new layers in this session. */
export function loadLayerColorDefaults(): LayerColorDefaults {
  try {
    const raw = localStorage.getItem(LAYER_COLORS_KEY);
    if (!raw) return setDefaultLayerColors(DEFAULT_LAYER_COLORS);
    return setDefaultLayerColors(JSON.parse(raw) as Partial<LayerColorDefaults>);
  } catch {
    return setDefaultLayerColors(DEFAULT_LAYER_COLORS);
  }
}

export function saveLayerColorDefaults(colors: Partial<LayerColorDefaults>): LayerColorDefaults {
  const normalized = setDefaultLayerColors(colors);
  try {
    localStorage.setItem(LAYER_COLORS_KEY, JSON.stringify(normalized));
  } catch {
    // Layer colour defaults are a convenience; the current session still uses them.
  }
  return normalized;
}

export function resetLayerColorDefaults(): LayerColorDefaults {
  const colors = resetDefaultLayerColors();
  try {
    localStorage.removeItem(LAYER_COLORS_KEY);
  } catch {
    // The in-memory defaults are still reset.
  }
  return colors;
}

export function currentLayerColorDefaults(): LayerColorDefaults {
  return defaultLayerColors();
}
