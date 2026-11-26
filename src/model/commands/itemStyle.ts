import { canonicalColor } from "../color";
import { isMeasurementKind } from "../layers";
import type { HighlightShape, ItemKind, LineStyle, Project, SelectionRef } from "../types";
import { applyItemCommand, emptyResult, type ItemCommandResult } from "./shared";

const TEXT_KINDS = new Set(["text", "textbox", "cloud", "callout", "stamp", "delta"]);
const FILL_KINDS = new Set(["cloud", "rect", "ellipse"]);
const ROTATION_KINDS = new Set(["text", "textbox", "rect", "ellipse", "image", "symbol"]);

function supportsLineStyle(kind: ItemKind): boolean {
  return (
    isMeasurementKind(kind) ||
    kind === "polyline" ||
    kind === "line" ||
    kind === "rect" ||
    kind === "ellipse"
  );
}

/** Sets a text-bearing item's font size in points, clamped to the UI range. */
export function setItemFontSize(
  project: Project,
  refs: SelectionRef[],
  size: number,
): ItemCommandResult {
  if (!Number.isFinite(size)) return emptyResult();
  const next = Math.max(0.5, Math.min(300, size));
  return applyItemCommand(project, refs, (item) => {
    if (!TEXT_KINDS.has(item.kind)) return false;
    item.fontSize = next;
    return true;
  });
}

/** Stores the depth of a volume measurement in the project length unit. */
export function setItemDepth(
  project: Project,
  refs: SelectionRef[],
  depth: number,
): ItemCommandResult {
  if (!Number.isFinite(depth)) return emptyResult();
  const next = Math.max(0.001, Math.min(1_000_000, depth));
  return applyItemCommand(project, refs, (item) => {
    if (item.kind !== "volume") return false;
    item.depth = next;
    return true;
  });
}

/** Switches a line-capable item between a solid and a dashed line. */
export function setItemLineStyle(
  project: Project,
  refs: SelectionRef[],
  style: LineStyle,
): ItemCommandResult {
  return applyItemCommand(project, refs, (item) => {
    if (!supportsLineStyle(item.kind)) return false;
    if (style === "dashed") item.lineStyle = "dashed";
    else delete item.lineStyle;
    return true;
  });
}

/**
 * Sets a clockwise rotation. The value is normalized to 0–359 degrees and a
 * full turn is stored as an omitted field.
 */
export function setItemRotation(
  project: Project,
  refs: SelectionRef[],
  degrees: number | undefined,
): ItemCommandResult {
  if (degrees !== undefined && !Number.isFinite(degrees)) return emptyResult();
  const normalized = degrees === undefined ? 0 : ((degrees % 360) + 360) % 360;
  return applyItemCommand(project, refs, (item) => {
    if (!ROTATION_KINDS.has(item.kind)) return false;
    if (normalized === 0) delete item.rotation;
    else item.rotation = normalized;
    return true;
  });
}

/**
 * Turns a shape fill on or off. Turning it on reuses the existing fill colour,
 * or the item colour, and keeps the current opacity or applies the supplied
 * default.
 */
export function setItemFillEnabled(
  project: Project,
  refs: SelectionRef[],
  enabled: boolean,
  defaultOpacity: number,
): ItemCommandResult {
  return applyItemCommand(project, refs, (item) => {
    if (!FILL_KINDS.has(item.kind)) return false;
    if (enabled) {
      item.fillColor = item.fillColor ?? item.color;
      item.opacity = item.opacity ?? defaultOpacity;
    } else {
      delete item.fillColor;
    }
    return true;
  });
}

/** Sets the fill colour of a shape and ensures it has a visible opacity. */
export function setItemFillColor(
  project: Project,
  refs: SelectionRef[],
  color: string,
  defaultOpacity: number,
): ItemCommandResult {
  const next = canonicalColor(color);
  if (!next) return emptyResult();
  return applyItemCommand(project, refs, (item) => {
    if (!FILL_KINDS.has(item.kind)) return false;
    item.fillColor = next;
    item.opacity = item.opacity ?? defaultOpacity;
    return true;
  });
}

/** Sets the fill opacity of a shape, clamped to the 0–1 range. */
export function setItemFillOpacity(
  project: Project,
  refs: SelectionRef[],
  opacity: number,
): ItemCommandResult {
  if (!Number.isFinite(opacity)) return emptyResult();
  const next = Math.max(0, Math.min(1, opacity));
  return applyItemCommand(project, refs, (item) => {
    if (!FILL_KINDS.has(item.kind)) return false;
    item.opacity = next;
    return true;
  });
}

/** Enables or disables the white background behind a text box. */
export function setItemTextBackground(
  project: Project,
  refs: SelectionRef[],
  enabled: boolean,
): ItemCommandResult {
  return applyItemCommand(project, refs, (item) => {
    if (item.kind !== "textbox") return false;
    if (enabled) item.textBackground = "white";
    else delete item.textBackground;
    return true;
  });
}

/**
 * Fixes a callout or cloud text-box width or height in points. An empty or
 * non-positive value clears the fixed size so the box follows its text.
 */
export function setItemTextBoxDimension(
  project: Project,
  refs: SelectionRef[],
  dimension: "width" | "height",
  value: number | undefined,
): ItemCommandResult {
  const valid = value !== undefined && Number.isFinite(value) && value > 0;
  return applyItemCommand(project, refs, (item) => {
    if (item.kind !== "callout" && item.kind !== "cloud") return false;
    if (dimension === "width") {
      if (!valid) delete item.textBoxWidth;
      else item.textBoxWidth = Math.max(20, Math.min(2000, value));
    } else {
      if (!valid) delete item.textBoxHeight;
      else item.textBoxHeight = Math.max(15, Math.min(2000, value));
    }
    return true;
  });
}

/** Fixes a cloud's scallop radius in points, or clears it to automatic. */
export function setItemCloudRadius(
  project: Project,
  refs: SelectionRef[],
  value: number | undefined,
): ItemCommandResult {
  const valid = value !== undefined && Number.isFinite(value) && value > 0;
  return applyItemCommand(project, refs, (item) => {
    if (item.kind !== "cloud") return false;
    if (!valid) delete item.cloudRadius;
    else item.cloudRadius = Math.max(2, Math.min(40, value));
    return true;
  });
}

/**
 * Switches a highlight between its freehand stroke, rectangle and polygon
 * shapes. The point list is reduced to a bounding box or expanded to its four
 * corners so the saved geometry always matches the chosen shape.
 */
export function setItemHighlightShape(
  project: Project,
  refs: SelectionRef[],
  shape: HighlightShape,
): ItemCommandResult {
  return applyItemCommand(project, refs, (item) => {
    if (item.kind !== "highlight") return false;
    item.highlightShape = shape;
    if (
      (shape === "rectangle" && item.points.length > 2) ||
      (shape === "polygon" && item.points.length < 3)
    ) {
      const xs = item.points.map((point) => point.x);
      const ys = item.points.map((point) => point.y);
      const min = { x: Math.min(...xs), y: Math.min(...ys) };
      const max = { x: Math.max(...xs), y: Math.max(...ys) };
      item.points =
        shape === "rectangle"
          ? [min, max]
          : [min, { x: max.x, y: min.y }, max, { x: min.x, y: max.y }];
    }
    return true;
  });
}
