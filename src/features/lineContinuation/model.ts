import { itemLocalToPage } from "../../model/geometry";
import type { LayerHierarchy } from "../../model/layerHierarchy";
import { itemIsLocked, itemIsVisible } from "../../model/layers";
import type { Layer, MarkupItem, Point } from "../../model/types";

/** Screen-pixel radius around a polyline end vertex that still counts as a hit. */
export const CONTINUATION_HIT_TOLERANCE_PX = 12;

export interface ContinuableEndpoint {
  /** Vertex index in the item's own point list: always the first or last. */
  index: number;
  /** Vertex position in page coordinates. */
  point: Point;
}

export interface PolylineContinuationTarget {
  layerId: string;
  itemId: string;
  vertexIndex: number;
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

/** Only a polyline with at least one segment has a free end to continue. */
export function isContinuablePolyline(item: MarkupItem): boolean {
  return item.kind === "polyline" && item.points.length >= 2;
}

/**
 * A line can be continued only on a visible, unlocked draw layer, with the item
 * itself visible and unlocked. Layer hierarchy visibility and locking follow
 * the same rules as the canvas.
 */
export function canContinuePolyline(
  item: MarkupItem,
  layer: Layer | undefined,
  hierarchy?: LayerHierarchy,
): boolean {
  if (!layer || layer.kind !== "draw" || !isContinuablePolyline(item)) return false;
  return itemIsVisible(item, layer, hierarchy) && !itemIsLocked(item, layer, hierarchy);
}

/**
 * Finds the first or last vertex within the click tolerance in screen pixels.
 * Middle vertices are ignored; a click near two equal endpoints keeps the
 * first one.
 */
export function nearestContinuableEndpoint(
  item: MarkupItem,
  pagePoint: Point,
  tolerancePx = CONTINUATION_HIT_TOLERANCE_PX,
  zoom = 1,
): ContinuableEndpoint | null {
  if (!isContinuablePolyline(item) || zoom <= 0) return null;
  const tolerancePage = tolerancePx / zoom;
  const last = item.points.length - 1;
  let nearest: ContinuableEndpoint | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const index of [0, last]) {
    const point = itemLocalToPage(item, item.points[index]);
    const distance = Math.hypot(point.x - pagePoint.x, point.y - pagePoint.y);
    if (distance > tolerancePage || distance >= nearestDistance) continue;
    nearest = { index, point };
    nearestDistance = distance;
  }
  return nearest;
}

/** The page-space position of a valid continuation vertex, or null. */
export function polylineEndpoint(item: MarkupItem, vertexIndex: number): Point | null {
  if (!isContinuablePolyline(item)) return null;
  const last = item.points.length - 1;
  if (vertexIndex !== 0 && vertexIndex !== last) return null;
  return itemLocalToPage(item, item.points[vertexIndex]);
}

/**
 * Appends the drawn tail to the shared endpoint. `continuationPoints[0]` is the
 * shared joint, so it is dropped; duplicate consecutive points are dropped too.
 * At the last vertex the tail is appended, at the first vertex the reversed tail
 * is prepended so the path never gains a segment from the old last vertex to the
 * old first. No actual new point returns null, so a cancelled draft never
 * mutates the item.
 */
export function mergeContinuedPoints(
  existingPoints: Point[],
  continuationPoints: Point[],
  vertexIndex: number,
): Point[] | null {
  const last = existingPoints.length - 1;
  if (existingPoints.length < 2 || continuationPoints.length < 2) return null;
  if (vertexIndex !== 0 && vertexIndex !== last) return null;

  const tail: Point[] = [];
  for (const point of continuationPoints.slice(1)) {
    const previous = tail.length ? tail[tail.length - 1] : existingPoints[vertexIndex];
    if (samePoint(previous, point)) continue;
    tail.push({ ...point });
  }
  if (!tail.length) return null;

  const existing = existingPoints.map((point) => ({ ...point }));
  if (vertexIndex === 0) {
    return [...tail.reverse(), ...existing];
  }
  return [...existing, ...tail];
}
