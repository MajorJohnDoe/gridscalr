import { wrapText } from "../../../model/text";
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

/** One rendered line of a field value, in top-left page coordinates. */
export interface FieldLinePlacement {
  text: string;
  x: number;
  baseline: number;
  size: number;
}

/**
 * Lays out a field value over one or more lines. Explicit newlines are kept and
 * long paragraphs wrap to the available width. The font shrinks until the
 * requested number of lines fits both the width and the cell height; the full
 * value stays in the project.
 */
export function layoutFieldLines(
  field: SheetFieldSpec,
  value: string,
  measure: TextMeasure,
): FieldLinePlacement[] {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .trim();
  if (!normalized) return [];
  const maxWidth = Math.max(1, field.rect.width - field.padding * 2);
  const maxHeight = Math.max(1, field.rect.height - field.padding * 2);
  const maxLines = Math.max(1, field.maxLines ?? 1);
  const floor = field.shrink ? 4 : field.fontSize;
  let size = field.fontSize;
  let lines: string[] = [];
  let lineHeight = size * 1.18;

  while (size >= floor - 1e-9) {
    lineHeight = size * 1.18;
    lines = wrapText(normalized, maxWidth, (line) => measure(line, size));
    if (lines.length <= maxLines && lines.length * lineHeight <= maxHeight + 0.01) break;
    if (!field.shrink) break;
    size = Math.max(floor, size - 0.25);
  }
  if (!lines.length) lines = [normalized];
  if (lines.length > maxLines) lines = lines.slice(0, maxLines);
  lineHeight = size * 1.18;

  const blockHeight = lines.length * lineHeight;
  let top = field.rect.y + field.padding;
  if (field.verticalAlign === "middle") {
    top = field.rect.y + (field.rect.height - blockHeight) / 2;
  } else if (field.verticalAlign === "bottom") {
    top = field.rect.y + field.rect.height - field.padding - blockHeight;
  }

  return lines.map((line, index) => {
    const fitted = fitText(line, measure, size, maxWidth, size);
    const width = measure(fitted.text, fitted.size);
    let x = field.rect.x + field.padding;
    if (field.align === "center") x = field.rect.x + (field.rect.width - width) / 2;
    else if (field.align === "right") x = field.rect.x + field.rect.width - field.padding - width;
    return {
      text: fitted.text,
      x,
      baseline: top + index * lineHeight + fitted.size * 0.8,
      size: fitted.size,
    };
  });
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
