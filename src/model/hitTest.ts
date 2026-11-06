import { distanceToAreaShape, areaShapeOf, pointInAreaShape } from "./area";
import { layerLockedOnPage, layerVisibleOnPage } from "./layers";
import {
  arcPolyline,
  distanceToPolyline,
  expandRect,
  itemBounds,
  itemLocalBounds,
  itemLocalToPage,
  itemSelectionBounds,
  pointInPolygon,
  pointToItemLocal,
  pointToSegmentDistance,
  radiusCircle,
} from "./geometry";
import { calloutLayout, cloudLabelLayout, deltaLayout, stampLayout } from "./annotations";
import { railGeometry } from "./rail";
import { parseSymbolPath, type SymbolCommand } from "./symbolPaths";
import { symbolFor, symbolSizeOf } from "../features/schematics/symbols/registry";
import type { Layer, MarkupItem, Point, Project } from "./types";

const symbolPolylineCache = new Map<string, Point[][]>();

function sampleCubic(
  from: Point,
  control1: Point,
  control2: Point,
  to: Point,
  steps = 12,
): Point[] {
  const points: Point[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const inverse = 1 - t;
    points.push({
      x:
        inverse ** 3 * from.x +
        3 * inverse ** 2 * t * control1.x +
        3 * inverse * t ** 2 * control2.x +
        t ** 3 * to.x,
      y:
        inverse ** 3 * from.y +
        3 * inverse ** 2 * t * control1.y +
        3 * inverse * t ** 2 * control2.y +
        t ** 3 * to.y,
    });
  }
  return points;
}

function symbolPolylines(data: string): Point[][] {
  const cached = symbolPolylineCache.get(data);
  if (cached) return cached;
  const commands: SymbolCommand[] = parseSymbolPath(data);
  const polylines: Point[][] = [];
  let current: Point[] = [];
  let cursor: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  const flush = () => {
    if (current.length > 1) polylines.push(current);
    current = [];
  };
  for (const command of commands) {
    if (command.type === "M") {
      flush();
      start = { x: command.x, y: command.y };
      cursor = { ...start };
      current = [{ ...start }];
    } else if (command.type === "L") {
      cursor = { x: command.x, y: command.y };
      current.push({ ...cursor });
    } else if (command.type === "C") {
      const points = sampleCubic(
        cursor,
        { x: command.x1, y: command.y1 },
        { x: command.x2, y: command.y2 },
        { x: command.x, y: command.y },
      );
      current.push(...points.slice(1));
      cursor = { x: command.x, y: command.y };
    } else {
      if (current.length > 1) current.push({ ...start });
      flush();
      cursor = { ...start };
    }
  }
  flush();
  symbolPolylineCache.set(data, polylines);
  return polylines;
}

function symbolStrokeHit(
  symbolId: string | undefined,
  vx: number,
  vy: number,
  tolerance: number,
  size: number,
): boolean {
  const definition = symbolFor(symbolId);
  const point = { x: vx, y: vy };
  for (const shape of definition.art.shapes) {
    const polylines = symbolPolylines(shape.d);
    const strokeHalf = shape.stroke ? ((shape.strokeWidth ?? 0.7) * (64 / size)) / 2 : 0;
    const reach = tolerance + strokeHalf;
    for (const line of polylines) {
      if (shape.stroke && distanceToPolyline(point, line, false) <= reach) return true;
      if (!shape.stroke && pointInPolygon(point, line)) return true;
    }
  }
  return false;
}

export interface HitResult {
  layer: Layer;
  item: MarkupItem;
  distance: number;
  vertexIndex: number;
  segmentIndex: number;
}

function hitItem(
  item: MarkupItem,
  point: Point,
  tolerance: number,
): Omit<HitResult, "layer" | "item"> | null {
  const { min, max } = itemBounds(item);
  if (
    point.x < min.x - tolerance ||
    point.y < min.y - tolerance ||
    point.x > max.x + tolerance ||
    point.y > max.y + tolerance
  ) {
    return null;
  }

  const localPoint = pointToItemLocal(item, point);

  if (item.kind === "symbol") {
    const anchor = item.points[0];
    if (!anchor) return null;
    const definition = symbolFor(item.symbolId);
    const selection = itemSelectionBounds(item);
    const insideSelection =
      point.x >= selection.min.x - tolerance &&
      point.y >= selection.min.y - tolerance &&
      point.x <= selection.max.x + tolerance &&
      point.y <= selection.max.y + tolerance;
    if (!insideSelection) return null;
    if (definition.style !== "schematic") {
      return { distance: 0, vertexIndex: -1, segmentIndex: -1 };
    }
    const size = symbolSizeOf(item);
    const scale = size / 64;
    const viewPoint = {
      x: 32 + (localPoint.x - anchor.x) / scale,
      y: 32 + (localPoint.y - anchor.y) / scale,
    };
    return symbolStrokeHit(item.symbolId, viewPoint.x, viewPoint.y, tolerance / scale, size)
      ? { distance: 0, vertexIndex: -1, segmentIndex: -1 }
      : null;
  }

  if (item.kind === "count") {
    const anchor = item.points[0];
    if (!anchor) return null;
    const distance = Math.hypot(localPoint.x - anchor.x, localPoint.y - anchor.y);
    return distance <= tolerance ? { distance, vertexIndex: -1, segmentIndex: -1 } : null;
  }

  if (item.kind === "angle" || item.kind === "slope") {
    const d = distanceToPolyline(localPoint, item.points, false);
    return d <= tolerance ? { distance: d, vertexIndex: -1, segmentIndex: -1 } : null;
  }

  if (item.kind === "radius" || item.kind === "diameter") {
    const circle = radiusCircle(item);
    if (!circle) return null;
    const distanceFromCenter = Math.hypot(
      localPoint.x - circle.center.x,
      localPoint.y - circle.center.y,
    );
    const onCircle = Math.abs(distanceFromCenter - circle.radius);
    const onLine = pointToSegmentDistance(localPoint, circle.center, circle.edge);
    const distance = Math.min(onCircle, onLine);
    return distance <= tolerance ? { distance, vertexIndex: -1, segmentIndex: -1 } : null;
  }

  if (item.kind === "arc") {
    const distance = distanceToPolyline(localPoint, arcPolyline(item), false);
    return distance <= tolerance ? { distance, vertexIndex: -1, segmentIndex: -1 } : null;
  }

  if (item.kind === "area" || item.kind === "volume") {
    const shape = areaShapeOf(item);
    const inside = pointInAreaShape(localPoint, item.points, shape);
    const edgeDistance = distanceToAreaShape(localPoint, item.points, shape);
    if (inside || edgeDistance <= tolerance) {
      return { distance: inside ? 0 : edgeDistance, vertexIndex: -1, segmentIndex: -1 };
    }
    return null;
  }

  if (item.kind === "cloud") {
    const inside = pointInPolygon(localPoint, item.points);
    const edgeDistance = distanceToPolyline(localPoint, item.points, true);
    const label = cloudLabelLayout(item);
    const inLabel =
      label &&
      localPoint.x >= label.center.x - label.width / 2 - tolerance &&
      localPoint.y >= label.center.y - label.height / 2 - tolerance &&
      localPoint.x <= label.center.x + label.width / 2 + tolerance &&
      localPoint.y <= label.center.y + label.height / 2 + tolerance;
    if (inside || edgeDistance <= tolerance || inLabel) {
      return {
        distance: inside || inLabel ? 0 : edgeDistance,
        vertexIndex: -1,
        segmentIndex: -1,
      };
    }
    return null;
  }

  if (item.kind === "highlight" && item.highlightShape !== "stroke" && item.highlightShape) {
    const inside =
      item.highlightShape === "rectangle"
        ? pointInRect(localPoint, expandRect(item.points[0], item.points[1]))
        : pointInPolygon(localPoint, item.points);
    const edgeDistance =
      item.highlightShape === "rectangle"
        ? distanceToPolyline(localPoint, rectangleCorners(item.points[0], item.points[1]), true)
        : distanceToPolyline(localPoint, item.points, true);
    if (inside || edgeDistance <= tolerance) {
      return { distance: inside ? 0 : edgeDistance, vertexIndex: -1, segmentIndex: -1 };
    }
    return null;
  }

  if (item.kind === "stamp") {
    const layout = stampLayout(item);
    const inside =
      localPoint.x >= layout.center.x - layout.width / 2 - tolerance &&
      localPoint.y >= layout.center.y - layout.height / 2 - tolerance &&
      localPoint.x <= layout.center.x + layout.width / 2 + tolerance &&
      localPoint.y <= layout.center.y + layout.height / 2 + tolerance;
    return inside ? { distance: 0, vertexIndex: -1, segmentIndex: -1 } : null;
  }

  if (item.kind === "callout") {
    const layout = calloutLayout(item);
    const inBox =
      localPoint.x >= layout.box.x - tolerance &&
      localPoint.y >= layout.box.y - tolerance &&
      localPoint.x <= layout.box.x + layout.box.width + tolerance &&
      localPoint.y <= layout.box.y + layout.box.height + tolerance;
    const d = pointToSegmentDistance(localPoint, layout.leaderStart, layout.anchor);
    if (inBox || d <= tolerance) {
      return { distance: inBox ? 0 : d, vertexIndex: -1, segmentIndex: -1 };
    }
    return null;
  }

  if (item.kind === "delta") {
    const layout = deltaLayout(item);
    const inside =
      Math.abs(localPoint.x - layout.center.x) <= layout.size / 2 + tolerance &&
      Math.abs(localPoint.y - layout.center.y) <= layout.size / 2 + tolerance;
    return inside ? { distance: 0, vertexIndex: -1, segmentIndex: -1 } : null;
  }

  if (item.kind === "polyline") {
    const distance = distanceToPolyline(localPoint, item.points, false);
    return distance <= tolerance ? { distance, vertexIndex: -1, segmentIndex: -1 } : null;
  }

  if (item.kind === "rail") {
    const geometry = railGeometry(item);
    if (!geometry) return null;
    for (const row of geometry.rows) {
      const distance = pointToSegmentDistance(
        localPoint,
        { x: geometry.left, y: row.y },
        { x: geometry.right, y: row.y },
      );
      if (distance <= tolerance) {
        return { distance, vertexIndex: -1, segmentIndex: -1 };
      }
    }
    return null;
  }

  if (item.kind === "textbox") {
    if (item.points.length < 2) return null;
    const rect = expandRect(item.points[0], item.points[1]);
    return pointInRect(localPoint, rect)
      ? { distance: 0, vertexIndex: -1, segmentIndex: -1 }
      : null;
  }

  if (item.kind === "text") {
    const bounds = itemLocalBounds(item);
    if (
      localPoint.x >= bounds.min.x - tolerance &&
      localPoint.y >= bounds.min.y - tolerance &&
      localPoint.x <= bounds.max.x + tolerance &&
      localPoint.y <= bounds.max.y + tolerance
    ) {
      return { distance: 0, vertexIndex: -1, segmentIndex: -1 };
    }
    return null;
  }

  if (item.kind === "rect" || item.kind === "ellipse" || item.kind === "image") {
    const nearEdge = distanceToPolyline(localPoint, item.points, true);
    if (nearEdge <= tolerance) return { distance: nearEdge, vertexIndex: -1, segmentIndex: -1 };
    return { distance: 0, vertexIndex: -1, segmentIndex: -1 };
  }

  const d = distanceToPolyline(localPoint, item.points, false);
  if (d <= tolerance) return { distance: d, vertexIndex: -1, segmentIndex: -1 };
  return null;
}

export function hitTest(
  project: Project,
  page: number,
  point: Point,
  tolerance: number,
  options: { includeLocked?: boolean; includeHidden?: boolean } = {},
): HitResult | null {
  // Background images render below every markup. Remember the first one as a
  // fallback so overlapping markups keep their visual priority for selection.
  let backgroundHit: HitResult | null = null;
  for (let l = project.layers.length - 1; l >= 0; l--) {
    const layer = project.layers[l];
    if (!options.includeHidden && !layerVisibleOnPage(layer, page)) continue;
    if (!options.includeLocked && layerLockedOnPage(layer, page)) continue;
    for (let i = layer.items.length - 1; i >= 0; i--) {
      const item = layer.items[i];
      if (item.page !== page) continue;
      if (!options.includeHidden && item.visible === false) continue;
      if (!options.includeLocked && (item.locked === true || layerLockedOnPage(layer, page)))
        continue;
      const hit = hitItem(item, point, tolerance);
      if (hit) {
        const result = { layer, item, ...hit };
        if (item.kind === "image" && item.image?.mode !== "annotation") {
          if (!backgroundHit) backgroundHit = result;
          continue;
        }
        return result;
      }
    }
  }
  return backgroundHit;
}

export function findVertex(item: MarkupItem, point: Point, tolerance: number): number {
  let best = -1;
  let bestDistance = tolerance;
  item.points.forEach((localVertex, index) => {
    const vertex = itemLocalToPage(item, localVertex);
    const d = Math.hypot(vertex.x - point.x, vertex.y - point.y);
    if (d <= bestDistance) {
      best = index;
      bestDistance = d;
    }
  });
  return best;
}

export function findSegment(
  item: MarkupItem,
  point: Point,
  tolerance: number,
  closed: boolean,
): { index: number; point: Point; distance: number } | null {
  if (item.points.length < 2) return null;
  const localPoint = pointToItemLocal(item, point);
  let best: { index: number; point: Point; distance: number } | null = null;
  const count = closed ? item.points.length : item.points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = item.points[i];
    const b = item.points[(i + 1) % item.points.length];
    const d = pointToSegmentDistance(localPoint, a, b);
    if (d <= tolerance && (!best || d < best.distance)) {
      const lengthSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      const t =
        lengthSq === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((localPoint.x - a.x) * (b.x - a.x) + (localPoint.y - a.y) * (b.y - a.y)) /
                  lengthSq,
              ),
            );
      best = {
        index: i,
        point: itemLocalToPage(item, {
          x: a.x + t * (b.x - a.x),
          y: a.y + t * (b.y - a.y),
        }),
        distance: d,
      };
    }
  }
  return best;
}

function pointInRect(
  point: Point,
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/** True when the segment from a to b touches the axis-aligned box. */
function segmentTouchesBox(a: Point, b: Point, min: Point, max: Point): boolean {
  const inside = (point: Point) =>
    point.x >= min.x && point.x <= max.x && point.y >= min.y && point.y <= max.y;
  if (inside(a) || inside(b)) return true;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - min.x, max.x - a.x, a.y - min.y, max.y - a.y];
  for (let index = 0; index < 4; index += 1) {
    if (p[index] === 0) {
      if (q[index] < 0) return false;
      continue;
    }
    const ratio = q[index] / p[index];
    if (p[index] < 0) {
      if (ratio > t1) return false;
      if (ratio > t0) t0 = ratio;
    } else {
      if (ratio < t0) return false;
      if (ratio < t1) t1 = ratio;
    }
  }
  return true;
}

/** Page-space polyline used by marquee selection for line-like items. */
function marqueePolyline(item: MarkupItem): { points: Point[]; closed: boolean } | null {
  const toPage = (point: Point) => itemLocalToPage(item, point);
  switch (item.kind) {
    case "length":
    case "polyline":
    case "angle":
    case "slope":
      return { points: item.points.map(toPage), closed: false };
    case "area":
    case "volume":
    case "cloud":
      return { points: item.points.map(toPage), closed: true };
    case "arc":
      return { points: arcPolyline(item).map(toPage), closed: false };
    case "highlight":
      return item.highlightShape === "stroke"
        ? { points: item.points.map(toPage), closed: false }
        : null;
    default:
      return null;
  }
}

/**
 * True when an item's visible geometry touches the marquee box. Line-like items
 * are tested segment by segment, so a long diagonal with a huge bounding box is
 * not selected by a marquee that never crosses the line. Text, symbols, stamps
 * and other box-shaped items keep their exact bounds.
 */
export function itemIntersectsBounds(item: MarkupItem, min: Point, max: Point): boolean {
  const bounds = itemBounds(item);
  if (
    bounds.max.x < min.x ||
    bounds.min.x > max.x ||
    bounds.max.y < min.y ||
    bounds.min.y > max.y
  ) {
    return false;
  }
  const line = marqueePolyline(item);
  if (!line) return true;
  const points = line.points;
  if (points.length === 1) {
    const point = points[0];
    if (point.x >= min.x && point.x <= max.x && point.y >= min.y && point.y <= max.y) {
      return true;
    }
  }
  for (let index = 1; index < points.length; index += 1) {
    if (segmentTouchesBox(points[index - 1], points[index], min, max)) return true;
  }
  if (line.closed) {
    // A marquee that sits entirely inside a filled area still selects it.
    const corners = [
      { x: min.x, y: min.y },
      { x: max.x, y: min.y },
      { x: max.x, y: max.y },
      { x: min.x, y: max.y },
    ];
    if (corners.some((corner) => pointInPolygon(corner, points))) return true;
  }
  return false;
}

function rectangleCorners(a: Point, b: Point | undefined): Point[] {
  const c = b ?? a;
  return [
    { x: a.x, y: a.y },
    { x: c.x, y: a.y },
    { x: c.x, y: c.y },
    { x: a.x, y: c.y },
  ];
}
