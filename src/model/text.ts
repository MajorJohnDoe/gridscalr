import type { MarkupItem } from "./types";

export const TEXT_FONT_STACK = 'Inter, "Segoe UI", system-ui, sans-serif';
export const TEXT_LINE_HEIGHT = 1.28;
export const MIN_TEXT_SIZE = 0.5;
export const MAX_TEXT_SIZE = 300;

let measureCanvas: CanvasRenderingContext2D | null | undefined;

function canvasMeasure(text: string, fontSize: number): number | null {
  if (typeof document === "undefined") return null;
  if (measureCanvas === undefined) {
    measureCanvas = document.createElement("canvas").getContext("2d");
  }
  if (!measureCanvas) return null;
  measureCanvas.font = `500 ${fontSize}px ${TEXT_FONT_STACK}`;
  return measureCanvas.measureText(text).width;
}

export function clampTextSize(value: number): number {
  if (!Number.isFinite(value)) return 12;
  return Math.max(MIN_TEXT_SIZE, Math.min(MAX_TEXT_SIZE, value));
}

export function textLines(text: string | undefined): string[] {
  const lines = (text ?? "").replace(/\r\n?/g, "\n").split("\n");
  return lines.length ? lines : [""];
}

export function measureTextWidth(text: string, fontSize: number): number {
  const measured = canvasMeasure(text, fontSize);
  if (measured !== null) return measured;
  // Deterministic fallback for tests and non-DOM environments. This only
  // affects selection bounds, not the text rendering itself.
  let units = 0;
  for (const character of Array.from(text)) {
    units += character === " " ? 0.28 : character.charCodeAt(0) > 0x2e7f ? 0.95 : 0.56;
  }
  return Math.max(0.1, units * fontSize);
}

export interface TextLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  width: number;
  height: number;
  ascent: number;
}

export function textItemLayout(
  item: Pick<MarkupItem, "text" | "fontSize">,
  measure: (text: string, fontSize: number) => number = measureTextWidth,
): TextLayout {
  const lines = textLines(item.text);
  const fontSize = clampTextSize(item.fontSize ?? 12);
  const lineHeight = fontSize * TEXT_LINE_HEIGHT;
  const width = Math.max(fontSize * 0.5, ...lines.map((line) => measure(line, fontSize)));
  return {
    lines,
    fontSize,
    lineHeight,
    width,
    height: Math.max(lineHeight, lines.length * lineHeight),
    ascent: fontSize * 0.86,
  };
}
