import type { Rect, SheetFieldSpec, VerticalAlign } from "../model/sheetTemplate";

export const SHEET_FONT_STACK = "Helvetica,Arial,sans-serif";

export type TextMeasure = (text: string, size: number) => number;

export interface FittedText {
  text: string;
  size: number;
}

export interface FieldTextPlacement {
  text: string;
  size: number;
  x: number;
  /** Top-left coordinate of the text baseline, before any view transform. */
  baseline: number;
}

/**
 * Shrinks text until it fits the available width, then ellipsizes. The full
 * value stays in the project; this only controls what is drawn.
 */
export function fitText(
  text: string,
  measure: TextMeasure,
  size: number,
  maxWidth: number,
  minSize = 4,
): FittedText {
  const value = text.trim();
  const floor = Math.min(minSize, size);
  if (!value || maxWidth <= 0) return { text: "", size };
  if (measure(value, size) <= maxWidth) return { text: value, size };

  let currentSize = size;
  while (currentSize > floor && measure(value, currentSize) > maxWidth) {
    currentSize = Math.max(floor, currentSize - 0.25);
  }
  if (measure(value, currentSize) <= maxWidth) {
    return { text: value, size: currentSize };
  }

  const suffix = "...";
  if (measure(suffix, currentSize) > maxWidth) {
    return { text: "", size: currentSize };
  }
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${value.slice(0, middle).trimEnd()}${suffix}`;
    if (measure(candidate, currentSize) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return { text: `${value.slice(0, low).trimEnd()}${suffix}`, size: currentSize };
}

/** Baseline position inside a top-left rectangle, in top-left coordinates. */
export function fieldBaseline(
  rect: Rect,
  fontSize: number,
  verticalAlign: VerticalAlign,
  padding: number,
): number {
  if (verticalAlign === "top") return rect.y + padding + fontSize * 0.8;
  if (verticalAlign === "bottom") return rect.y + rect.height - padding - fontSize * 0.2;
  return rect.y + rect.height / 2 + fontSize * 0.35;
}

/** Lays out one field value for the canvas. PDF export uses the same maths. */
export function layoutFieldText(
  field: SheetFieldSpec,
  value: string,
  measure: TextMeasure,
): FieldTextPlacement | null {
  const text = value.trim();
  if (!text) return null;
  const maxWidth = Math.max(1, field.rect.width - field.padding * 2);
  const fitted = fitText(
    text,
    measure,
    field.fontSize,
    maxWidth,
    field.shrink ? 4 : field.fontSize,
  );
  if (!fitted.text) return null;

  const width = measure(fitted.text, fitted.size);
  let x = field.rect.x + field.padding;
  if (field.align === "center") x = field.rect.x + (field.rect.width - width) / 2;
  else if (field.align === "right") x = field.rect.x + field.rect.width - field.padding - width;

  return {
    text: fitted.text,
    size: fitted.size,
    x,
    baseline: fieldBaseline(field.rect, fitted.size, field.verticalAlign, field.padding),
  };
}

let measureCanvas: CanvasRenderingContext2D | null | undefined;

function fallbackMeasure(text: string, size: number): number {
  let units = 0;
  for (const character of Array.from(text)) {
    units += character === " " ? 0.28 : character.charCodeAt(0) > 0x2e7f ? 0.95 : 0.56;
  }
  return Math.max(0.1, units * size);
}

/** Canvas measurement for sheet text, matching the canvas font stack. */
export function measureSheetText(text: string, size: number): number {
  if (typeof document === "undefined") return fallbackMeasure(text, size);
  if (measureCanvas === undefined) {
    measureCanvas = document.createElement("canvas").getContext("2d");
  }
  if (!measureCanvas) return fallbackMeasure(text, size);
  measureCanvas.font = `${size}px ${SHEET_FONT_STACK}`;
  return measureCanvas.measureText(text).width;
}
