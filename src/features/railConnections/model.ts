import { itemLocalToPage } from "../../model/geometry";
import { buildLayerHierarchy, type LayerHierarchy } from "../../model/layerHierarchy";
import { itemIsLocked, itemIsVisible, layerVisibleOnPage } from "../../model/layers";
import { railGeometry } from "../../model/rail";
import type { Layer, MarkupItem, Point, Project } from "../../model/types";

/** Screen-pixel radius around the click that still counts as a rail crossing. */
export const CONNECTION_HIT_TOLERANCE_PX = 12;

export interface RailCrossing {
  railItemId: string;
  railLayerId: string;
  /** Exact wire/row intersection in page coordinates. */
  point: Point;
  /** Distance from the click to the crossing, in screen pixels at the given zoom. */
  distance: number;
}

export interface WireRef {
  layerId: string;
  itemId: string;
}

/** A wire is a line-like drawing that can be connected to one rail row. */
export function isWireKind(item: MarkupItem): boolean {
  return item.kind === "polyline" || item.kind === "line";
}

/**
 * A wire can be connected only when it is a line-like item on a visible,
 * unlocked draw layer and the item itself is visible and unlocked. Layer
 * hierarchy visibility and locking follow the same rules as the canvas.
 */
export function canConnectWireToChannel(
  item: MarkupItem,
  layer: Layer | undefined,
  hierarchy?: LayerHierarchy,
): boolean {
  if (!layer || layer.kind !== "draw" || !isWireKind(item)) return false;
  return itemIsVisible(item, layer, hierarchy) && !itemIsLocked(item, layer, hierarchy);
}

function segmentIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denominator;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * rx, y: a.y + t * ry };
}

function wireSegments(item: MarkupItem): Array<{ a: Point; b: Point }> {
  const points = item.points.map((point) => itemLocalToPage(item, point));
  const segments: Array<{ a: Point; b: Point }> = [];
  for (let index = 1; index < points.length; index += 1) {
    segments.push({ a: points[index - 1], b: points[index] });
  }
  return segments;
}

/**
 * Finds the rail-row crossing nearest to the click. Rails only contribute when
 * their layer and item are visible on the wire's page; a locked rail is still a
 * valid target because the action edits the wire, not the rail.
 */
export function findRailCrossing(
  project: Project,
  wire: WireRef,
  click: Point,
  zoom: number,
  tolerancePx = CONNECTION_HIT_TOLERANCE_PX,
): RailCrossing | null {
  const wireLayer = project.layers.find((layer) => layer.id === wire.layerId);
  const wireEntry = wireLayer?.items.find((item) => item.id === wire.itemId);
  if (!wireLayer || !wireEntry) return null;
  const hierarchy = buildLayerHierarchy(project.layers);
  if (!canConnectWireToChannel(wireEntry, wireLayer, hierarchy)) return null;

  const pageId = wireEntry.pageId;
  const segments = wireSegments(wireEntry);
  if (!segments.length) return null;

  let nearest: RailCrossing | null = null;
  for (const layer of project.layers) {
    if (layer.kind !== "draw" || !layerVisibleOnPage(layer, pageId, hierarchy)) continue;
    for (const rail of layer.items) {
      if (rail.kind !== "rail" || rail.pageId !== pageId) continue;
      if (!itemIsVisible(rail, layer, hierarchy)) continue;
      const geometry = railGeometry(rail);
      if (!geometry) continue;
      for (const row of geometry.rows) {
        const rowStart = { x: geometry.left, y: row.y };
        const rowEnd = { x: geometry.right, y: row.y };
        for (const segment of segments) {
          const point = segmentIntersection(segment.a, segment.b, rowStart, rowEnd);
          if (!point) continue;
          const distance = Math.hypot(point.x - click.x, point.y - click.y) * zoom;
          if (distance > tolerancePx) continue;
          if (nearest && nearest.distance <= distance) continue;
          nearest = {
            railItemId: rail.id,
            railLayerId: layer.id,
            point,
            distance,
          };
        }
      }
    }
  }
  return nearest;
}
