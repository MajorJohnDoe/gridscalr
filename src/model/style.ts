import { t, translate, type MessageKey } from "../i18n";
import { normalizeColor } from "./color";
/** Paper-space defaults and selectable line weights. */
export const DEFAULT_MEASUREMENT_STROKE_WIDTH = 0.75;
export const DEFAULT_DRAWING_STROKE_WIDTH = 1.5;
export const MIN_EXPORT_STROKE_WIDTH = 0.15;

export const STROKE_WIDTH_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8] as const;

export const DRAW_COLOR_PRESETS = [
  { id: "blue", label: translate("en", "color.blue"), color: "#4cc9f0" },
  { id: "orange", label: translate("en", "color.orange"), color: "#f2a93b" },
  { id: "green", label: translate("en", "color.green"), color: "#35c2a1" },
  { id: "red", label: translate("en", "color.red"), color: "#f26d6d" },
  { id: "signalRed", label: translate("en", "color.signalRed"), color: "#f70808" },
  { id: "violet", label: translate("en", "color.violet"), color: "#a78bfa" },
  { id: "pink", label: translate("en", "color.pink"), color: "#e879b9" },
  { id: "yellow", label: translate("en", "color.yellow"), color: "#f2d024" },
  { id: "slate", label: translate("en", "color.slate"), color: "#535353" },
  { id: "graphite", label: translate("en", "color.graphite"), color: "#14181b" },
] as const;

export function drawColorLabel(preset: (typeof DRAW_COLOR_PRESETS)[number]): string {
  return t(`color.${preset.id}` as MessageKey);
}

/** Applies a drawing-style patch without ever storing an invalid colour. */
export function mergeDrawStyle<T extends { color: string }>(current: T, patch: Partial<T>): T {
  return {
    ...current,
    ...patch,
    color: normalizeColor(patch.color ?? current.color, current.color),
  };
}

/** Applies a pipe/duct line-style patch without ever storing an invalid colour. */
export function mergeLineStyle<T extends { color: string; widthPt: number }>(
  current: T,
  patch: Partial<T>,
): T {
  return {
    ...current,
    ...patch,
    color: normalizeColor(patch.color ?? current.color, current.color),
    widthPt: Math.max(0.3, Math.min(20, patch.widthPt ?? current.widthPt)),
  };
}
