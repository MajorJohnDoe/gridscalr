import { resolveScheduleTableStyle, type ScheduleTableStyle } from "../../features/schedules";

/**
 * Theme reader for the placed takeoff table on the canvas. The table is drawn
 * on the PDF sheet, which is white in every palette, so its colours come from
 * the document-oriented `--table-*` tokens rather than the chrome surfaces.
 *
 * `getComputedStyle` is only consulted when the palette changes, never per
 * frame or per table, so panning a page with several placements stays cheap.
 */

const DEFAULT_THEME = "medium-grey";

let cached: { key: string; style: ScheduleTableStyle } | null = null;

function themeKey(): string {
  if (typeof document === "undefined") return "";
  const root = document.documentElement;
  return `${root.getAttribute("data-theme") ?? DEFAULT_THEME}:${root.style.colorScheme}`;
}

export function canvasScheduleStyle(): ScheduleTableStyle {
  const key = themeKey();
  if (cached && cached.key === key) return cached.style;
  const root = typeof document === "undefined" ? null : document.documentElement;
  const computed = root ? window.getComputedStyle(root) : null;
  const style = resolveScheduleTableStyle((token) =>
    computed ? computed.getPropertyValue(token).trim() : null,
  );
  cached = { key, style };
  return style;
}

/** Clears the palette cache; a theme switch and the tests use it. */
export function resetCanvasScheduleStyle(): void {
  cached = null;
}
