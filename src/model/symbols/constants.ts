/**
 * Built-in facility symbols are paper-space classic sign plates. Each pictogram
 * is authored as filled SVG paths in a 64-unit view box and uses even-odd holes
 * so the canvas, the symbol library and the flattened PDF export draw exactly
 * the same geometry. Plates are centred on the 32,32 plate centre and follow
 * the category colour system.
 */
export const SYMBOL_SIZE = 24;
export const SYMBOL_MIN_SIZE = 6;
export const SYMBOL_MAX_SIZE = 300;
export const SYMBOL_VIEWBOX = 64;
export const DEFAULT_SYMBOL_ID = "fire.extinguisher";
/** Default plate size in points for the stroke-only schematic symbols. */
export const SCHEMATIC_SYMBOL_SIZE = 40;
/** Fixed stroke width in page points for schematic artwork at every symbol size. */
export const SCHEMATIC_STROKE_WIDTH = 0.7;

export function clampSymbolSize(value: number): number {
  if (!Number.isFinite(value)) return SYMBOL_SIZE;
  return Math.max(SYMBOL_MIN_SIZE, Math.min(SYMBOL_MAX_SIZE, value));
}

/** Plate size in PDF points for a symbol item, clamped to the supported range. */
export function symbolSizeOf(item: { symbolSize?: number }): number {
  const value = item.symbolSize;
  if (typeof value !== "number") return SYMBOL_SIZE;
  return clampSymbolSize(value);
}

export type SymbolStyle = "sign" | "glyph" | "schematic";

/** Classic facility sign plates with a white or black pictogram. */
export const SYMBOL_STYLE: SymbolStyle = "sign";

/** A connection anchor on a schematic symbol, in the 64-unit view box. */
