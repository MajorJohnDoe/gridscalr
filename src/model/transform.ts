import { itemSelectionBounds, type Bounds } from "./geometry";
import { itemIsLocked, itemIsVisible, layerLockedOnPage, layerVisibleOnPage } from "./layers";
import { resolveSelection } from "./selection";
import { clampSymbolSize } from "./symbols";
import { clampTextSize } from "./text";
import type { MarkupItem, Point, Project, SelectionRef } from "./types";

const MIN_LABEL_SIZE = 0.5;
const MIN_CLOUD_RADIUS = 0.5;
const MIN_TEXT_BOX = 15;

function scalePoint(point: Point, anchor: Point, scale: number): Point {
  return {
    x: anchor.x + (point.x - anchor.x) * scale,
    y: anchor.y + (point.y - anchor.y) * scale,
  };
}

/**
 * Scales one item around a page anchor. Geometry, symbol size, text sizes and
 * annotation boxes follow; stroke width, opacity, rotation and physical depth
 * deliberately stay unchanged.
 */
export function scaleItemAround(item: MarkupItem, scale: number, anchor: Point): void {
  if (!Number.isFinite(scale) || scale <= 0) return;
  item.points = item.points.map((point) => scalePoint(point, anchor, scale));
  if (item.symbolSize !== undefined) item.symbolSize = clampSymbolSize(item.symbolSize * scale);
  if (item.fontSize !== undefined) item.fontSize = clampTextSize(item.fontSize * scale);
  if (item.labelSize !== undefined) {
    item.labelSize = Math.max(MIN_LABEL_SIZE, item.labelSize * scale);
  }
  if (item.padding !== undefined) item.padding = Math.max(0, item.padding * scale);
  if (item.textBoxWidth !== undefined) {
    item.textBoxWidth = Math.max(MIN_TEXT_BOX, item.textBoxWidth * scale);
  }
  if (item.textBoxHeight !== undefined) {
    item.textBoxHeight = Math.max(MIN_TEXT_BOX, item.textBoxHeight * scale);
  }
  if (item.rowSpacing !== undefined) item.rowSpacing = Math.max(2, item.rowSpacing * scale);
  if (item.cloudRadius !== undefined) {
    item.cloudRadius = Math.max(MIN_CLOUD_RADIUS, item.cloudRadius * scale);
  }
  if (item.labelAnchor) item.labelAnchor = scalePoint(item.labelAnchor, anchor, scale);
  for (const key of ["textOffset", "labelOffset", "tagOffset"] as const) {
    const offset = item[key];
    if (offset) item[key] = { x: offset.x * scale, y: offset.y * scale };
  }
  if (item.runs?.length) {
    item.runs = item.runs.map((run) => ({
      ...run,
      ...(run.size === undefined ? {} : { size: Math.max(MIN_LABEL_SIZE, run.size * scale) }),
    }));
  }
  item.updatedAt = new Date().toISOString();
}

/** Union of the visible selection boxes of the referenced items. */
export function selectionBounds(project: Project, refs: SelectionRef[]): Bounds | null {
  let bounds: Bounds | null = null;
  for (const { item } of resolveSelection(project, refs)) {
    const next = itemSelectionBounds(item);
    bounds = bounds
      ? {
          min: {
            x: Math.min(bounds.min.x, next.min.x),
            y: Math.min(bounds.min.y, next.min.y),
          },
          max: {
            x: Math.max(bounds.max.x, next.max.x),
            y: Math.max(bounds.max.y, next.max.y),
          },
        }
      : next;
  }
  return bounds;
}

/**
 * Scales every unlocked, visible selected item around `anchor`. Call inside one
 * store mutation so the whole action is one undo step.
 */
export function scaleSelection(
  project: Project,
  refs: SelectionRef[],
  scale: number,
  anchor: Point,
): number {
  let scaled = 0;
  for (const { layer, item } of resolveSelection(project, refs)) {
    if (
      itemIsLocked(item, layer) ||
      !itemIsVisible(item, layer) ||
      !layerVisibleOnPage(layer, item.page) ||
      layerLockedOnPage(layer, item.page)
    ) {
      continue;
    }
    scaleItemAround(item, scale, anchor);
    scaled += 1;
  }
  return scaled;
}
