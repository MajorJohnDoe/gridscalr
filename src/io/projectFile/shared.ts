import { canonicalColor } from "../../model/color";
import type {
  AreaShape,
  AreaUnit,
  HighlightShape,
  ImageMode,
  ItemKind,
  LengthUnit,
  Point,
  TextRun,
} from "../../model/types";

export const ITEM_KINDS: ReadonlySet<ItemKind> = new Set([
  "length",
  "area",
  "count",
  "radius",
  "diameter",
  "arc",
  "angle",
  "slope",
  "volume",
  "pen",
  "line",
  "arrow",
  "rect",
  "ellipse",
  "highlight",
  "text",
  "image",
  "cloud",
  "callout",
  "stamp",
  "delta",
  "symbol",
  "textbox",
  "polyline",
  "rail",
]);

export const LENGTH_UNITS = new Set<LengthUnit>(["mm", "cm", "m", "in", "ft", "yd"]);

export const AREA_UNITS = new Set<AreaUnit>(["mm2", "cm2", "m2", "in2", "ft2", "yd2"]);

export function isPoint(value: unknown): value is Point {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Point).x === "number" &&
    Number.isFinite((value as Point).x) &&
    typeof (value as Point).y === "number" &&
    Number.isFinite((value as Point).y)
  );
}

export function normalizeHighlightShape(value: unknown): HighlightShape {
  return value === "rectangle" || value === "polygon" ? value : "stroke";
}

export function normalizeAreaShape(value: unknown): AreaShape {
  return value === "rectangle" || value === "ellipse" ? value : "polygon";
}

export function normalizeImageMode(value: unknown): ImageMode {
  return value === "annotation" ? "annotation" : "background";
}

export function normalizeTextRuns(value: unknown): TextRun[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const runs: TextRun[] = [];
  let total = 0;
  for (const candidate of value.slice(0, 500)) {
    if (!candidate || typeof candidate !== "object") continue;
    const raw = candidate as Record<string, unknown>;
    if (typeof raw.text !== "string" || !raw.text) continue;
    const text = raw.text.replace(/\r\n?/g, "\n").slice(0, 5000);
    if (total + text.length > 20000) break;
    total += text.length;
    const size =
      typeof raw.size === "number" && Number.isFinite(raw.size)
        ? Math.max(0.5, Math.min(300, raw.size))
        : undefined;
    runs.push({
      text,
      bold: raw.bold === true ? true : raw.bold === false ? false : undefined,
      italic: raw.italic === true ? true : raw.italic === false ? false : undefined,
      underline: raw.underline === true ? true : raw.underline === false ? false : undefined,
      size,
      color: canonicalColor(raw.color) ?? undefined,
    });
  }
  return runs.length ? runs : undefined;
}
