import { textItemLayout } from "./text";
import { calloutLayout, cloudLabelLayout, deltaLayout, stampLayout } from "./annotations";
import { symbolSizeOf } from "./symbols";
import type { MarkupItem, Point } from "./types";

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distanceSquared(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

export function polylineLength(points: Point[], closed = false): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  if (closed) total += distance(points[points.length - 1], points[0]);
  return total;
}

export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonPerimeter(points: Point[]): number {
  return polylineLength(points, true);
}

export function polygonCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length < 3) return averagePoint(points);
  let cx = 0;
  let cy = 0;
  let areaFactor = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    areaFactor += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(areaFactor) < 1e-9) return averagePoint(points);
  return { x: cx / (3 * areaFactor), y: cy / (3 * areaFactor) };
}

export function averagePoint(points: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function boundingBox(points: Point[]): { min: Point; max: Point } {
  if (points.length === 0) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const lengthSq = distanceSquared(a, b);
  if (lengthSq === 0) return distance(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

export function nearestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const lengthSq = distanceSquared(a, b);
  if (lengthSq === 0) return { ...a };
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function distanceToPolyline(p: Point, points: Point[], closed = false): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return distance(p, points[0]);
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    best = Math.min(best, pointToSegmentDistance(p, points[i - 1], points[i]));
  }
  if (closed)
    best = Math.min(best, pointToSegmentDistance(p, points[points.length - 1], points[0]));
  return best;
}

export function closestVertex(p: Point, points: Point[], maxDistance: number): number {
  let best = -1;
  let bestDistance = maxDistance;
  points.forEach((candidate, index) => {
    const d = distance(p, candidate);
    if (d <= bestDistance) {
      bestDistance = d;
      best = index;
    }
  });
  return best;
}

export function constrainAngle(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return to;
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  return { x: from.x + Math.cos(snapped) * length, y: from.y + Math.sin(snapped) * length };
}

export function simplifyPolyline(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  const sqTolerance = tolerance * tolerance;

  const getSqSegDist = (p: Point, a: Point, b: Point): number => {
    let x = a.x;
    let y = a.y;
    let dx = b.x - x;
    let dy = b.y - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b.x;
        y = b.y;
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p.x - x;
    dy = p.y - y;
    return dx * dx + dy * dy;
  };

  const simplifyStep = (first: number, last: number, output: Point[]): void => {
    let maxSqDist = sqTolerance;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const sqDist = getSqSegDist(points[i], points[first], points[last]);
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }
    if (index > 0) {
      if (index - first > 1) simplifyStep(first, index, output);
      output.push(points[index]);
      if (last - index > 1) simplifyStep(index, last, output);
    }
  };

  const simplified: Point[] = [points[0]];
  simplifyStep(0, points.length - 1, simplified);
  simplified.push(points[points.length - 1]);
  return simplified;
}

export function translatePoints(points: Point[], dx: number, dy: number): Point[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function expandRect(
  a: Point,
  b: Point,
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

export interface Bounds {
  min: Point;
  max: Point;
}

export function normalizeDegrees(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function rotatePoint(point: Point, center: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return rotatePointRadians(point, center, radians);
}

export function rotatePointRadians(point: Point, center: Point, radians: number): Point {
  if (radians === 0) return { x: point.x, y: point.y };
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export interface ArrowHeadGeometry {
  /** Point where the shaft should stop so it does not poke through the tip. */
  shaftEnd: Point;
  wingA: Point;
  wingB: Point;
}

/**
 * Filled arrowhead with the tip exactly at `end`. The shaft is shortened to sit
 * under the head instead of extending past it with a rounded cap.
 */
export function arrowHeadGeometry(start: Point, end: Point, size: number): ArrowHeadGeometry {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.0001) {
    return { shaftEnd: end, wingA: end, wingB: end };
  }
  const angle = Math.atan2(dy, dx);
  const inset = Math.min(size * 0.8, length);
  return {
    shaftEnd: {
      x: end.x - (dx / length) * inset,
      y: end.y - (dy / length) * inset,
    },
    wingA: {
      x: end.x - size * Math.cos(angle - Math.PI / 7),
      y: end.y - size * Math.sin(angle - Math.PI / 7),
    },
    wingB: {
      x: end.x - size * Math.cos(angle + Math.PI / 7),
      y: end.y - size * Math.sin(angle + Math.PI / 7),
    },
  };
}

export function itemRotation(item: MarkupItem): number {
  return Number.isFinite(item.rotation) ? (item.rotation as number) : 0;
}

/** Unrotated item bounds in page coordinates. */
export interface ArcGeometry {
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
  /** Positive sweep in radians from start to end through the middle point. */
  sweep: number;
  length: number;
}

function normalizeRadians(angle: number): number {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}

/** Circle through three page-space points, or null when they are collinear. */
export function circleFromPoints(
  a: Point,
  b: Point,
  c: Point,
): { center: Point; radius: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const center = {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
  return { center, radius: Math.hypot(center.x - a.x, center.y - a.y) };
}

/** Radius edge and centre for a radius or diameter item. */
export function radiusCircle(
  item: MarkupItem,
): { center: Point; edge: Point; radius: number } | null {
  if (item.kind !== "radius" && item.kind !== "diameter") return null;
  const [center, edge] = item.points;
  if (!center || !edge) return null;
  return { center, edge, radius: Math.hypot(edge.x - center.x, edge.y - center.y) };
}

/** Arc through start, middle and end points. */
export function arcGeometry(item: MarkupItem): ArcGeometry | null {
  if (item.kind !== "arc") return null;
  const [start, middle, end] = item.points;
  if (!start || !middle || !end) return null;
  const circle = circleFromPoints(start, middle, end);
  if (!circle || circle.radius < 1e-6) return null;
  const startAngle = Math.atan2(start.y - circle.center.y, start.x - circle.center.x);
  const middleAngle = Math.atan2(middle.y - circle.center.y, middle.x - circle.center.x);
  const endAngle = Math.atan2(end.y - circle.center.y, end.x - circle.center.x);
  const ccwSweep = normalizeRadians(endAngle - startAngle);
  const middleSweep = normalizeRadians(middleAngle - startAngle);
  const sweep = middleSweep <= ccwSweep ? ccwSweep : Math.PI * 2 - ccwSweep;
  return {
    center: circle.center,
    radius: circle.radius,
    startAngle,
    endAngle,
    sweep,
    length: circle.radius * sweep,
  };
}

/** Sampled page-space polyline for a full circle. */
export function circlePolyline(center: Point, radius: number, segments = 64): Point[] {
  const points: Point[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = (Math.PI * 2 * index) / segments;
    points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  return points;
}

/** Sampled page-space polyline for an arc, used by hit testing and bounds. */
export function arcPolyline(item: MarkupItem, segments = 64): Point[] {
  const arc = arcGeometry(item);
  if (!arc) return item.points.map((point) => ({ ...point }));
  const points: Point[] = [];
  const direction = arc.sweep >= 0 ? 1 : -1;
  for (let index = 0; index <= segments; index += 1) {
    const angle = arc.startAngle + direction * arc.sweep * (index / segments);
    points.push({
      x: arc.center.x + Math.cos(angle) * arc.radius,
      y: arc.center.y + Math.sin(angle) * arc.radius,
    });
  }
  return points;
}

export interface AngleGeometry {
  start: Point;
  vertex: Point;
  end: Point;
  startAngle: number;
  endAngle: number;
  sweep: number;
  degrees: number;
}

/** Angle between two rays from the middle point, in degrees. */
export function angleGeometry(item: MarkupItem): AngleGeometry | null {
  if (item.kind !== "angle") return null;
  const [start, vertex, end] = item.points;
  if (!start || !vertex || !end) return null;
  const startAngle = Math.atan2(start.y - vertex.y, start.x - vertex.x);
  const endAngle = Math.atan2(end.y - vertex.y, end.x - vertex.x);
  let sweep = normalizeRadians(endAngle - startAngle);
  if (sweep > Math.PI) sweep = Math.PI * 2 - sweep;
  return { start, vertex, end, startAngle, endAngle, sweep, degrees: (sweep * 180) / Math.PI };
}

export function angleValue(item: MarkupItem): number | null {
  return angleGeometry(item)?.degrees ?? null;
}

/** Signed grade percentage from the horizontal run between two points. */
export function slopeValue(item: MarkupItem): number | null {
  if (item.kind !== "slope") return null;
  const [start, end] = item.points;
  if (!start || !end) return null;
  const run = Math.abs(end.x - start.x);
  const rise = Math.abs(end.y - start.y);
  return (rise / Math.max(run, 1e-6)) * 100;
}

export function slopeDegrees(item: MarkupItem): number | null {
  if (item.kind !== "slope") return null;
  const [start, end] = item.points;
  if (!start || !end) return null;
  return (Math.atan2(Math.abs(end.y - start.y), Math.abs(end.x - start.x)) * 180) / Math.PI;
}

/** Sampled polyline for the angle arc between its two rays. */
export function angleArcPolyline(item: MarkupItem, segments = 32): Point[] {
  const angle = angleGeometry(item);
  if (!angle) return [];
  const radius =
    Math.min(
      Math.hypot(angle.start.x - angle.vertex.x, angle.start.y - angle.vertex.y),
      Math.hypot(angle.end.x - angle.vertex.x, angle.end.y - angle.vertex.y),
    ) * 0.35;
  const points: Point[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const value = angle.startAngle + (angle.sweep * index) / segments;
    points.push({
      x: angle.vertex.x + Math.cos(value) * radius,
      y: angle.vertex.y + Math.sin(value) * radius,
    });
  }
  return points;
}

/** Length value for a measurement kind, in PDF points. */
export function measurementValue(item: MarkupItem): number | null {
  if (item.kind === "length") return polylineLength(item.points);
  if (item.kind === "radius") return radiusCircle(item)?.radius ?? null;
  if (item.kind === "diameter") {
    const circle = radiusCircle(item);
    return circle ? circle.radius * 2 : null;
  }
  if (item.kind === "arc") return arcGeometry(item)?.length ?? null;
  return null;
}

export function itemLocalBounds(item: MarkupItem): Bounds {
  if (item.kind === "symbol") {
    const anchor = item.points[0] ?? { x: 0, y: 0 };
    const half = symbolSizeOf(item) / 2;
    return {
      min: { x: anchor.x - half, y: anchor.y - half },
      max: { x: anchor.x + half, y: anchor.y + half },
    };
  }
  if (item.kind === "text") {
    const anchor = item.points[0] ?? { x: 0, y: 0 };
    const layout = textItemLayout(item);
    return {
      min: { x: anchor.x, y: anchor.y },
      max: { x: anchor.x + layout.width, y: anchor.y + layout.height },
    };
  }
  if (item.kind === "stamp") {
    const layout = stampLayout(item);
    return {
      min: { x: layout.center.x - layout.width / 2, y: layout.center.y - layout.height / 2 },
      max: { x: layout.center.x + layout.width / 2, y: layout.center.y + layout.height / 2 },
    };
  }
  if (item.kind === "callout") {
    const layout = calloutLayout(item);
    return {
      min: {
        x: Math.min(layout.box.x, layout.anchor.x),
        y: Math.min(layout.box.y, layout.anchor.y),
      },
      max: {
        x: Math.max(layout.box.x + layout.box.width, layout.anchor.x),
        y: Math.max(layout.box.y + layout.box.height, layout.anchor.y),
      },
    };
  }
  if (item.kind === "delta") {
    const layout = deltaLayout(item);
    return {
      min: { x: layout.center.x - layout.size / 2, y: layout.center.y - layout.size / 2 },
      max: { x: layout.center.x + layout.size / 2, y: layout.center.y + layout.size / 2 },
    };
  }
  if (item.kind === "radius" || item.kind === "diameter") {
    const circle = radiusCircle(item);
    if (!circle) return boundingBox(item.points);
    return {
      min: { x: circle.center.x - circle.radius, y: circle.center.y - circle.radius },
      max: { x: circle.center.x + circle.radius, y: circle.center.y + circle.radius },
    };
  }
  if (item.kind === "arc") {
    return boundingBox(arcPolyline(item));
  }
  if (item.kind === "cloud") {
    const bounds = boundingBox(item.points);
    const label = cloudLabelLayout(item);
    const min = { x: bounds.min.x - 8, y: bounds.min.y - 8 };
    const max = { x: bounds.max.x + 8, y: bounds.max.y + 8 };
    if (label) {
      min.x = Math.min(min.x, label.center.x - label.width / 2);
      min.y = Math.min(min.y, label.center.y - label.height / 2);
      max.x = Math.max(max.x, label.center.x + label.width / 2);
      max.y = Math.max(max.y, label.center.y + label.height / 2);
    }
    return { min, max };
  }
  return boundingBox(item.points);
}

export function itemCenter(item: MarkupItem): Point {
  const bounds = itemLocalBounds(item);
  return midpoint(bounds.min, bounds.max);
}

/** Clockwise corners: top-left, top-right, bottom-right, bottom-left. */
export function itemCorners(item: MarkupItem): [Point, Point, Point, Point] {
  const bounds = itemLocalBounds(item);
  const center = midpoint(bounds.min, bounds.max);
  const rotation = itemRotation(item);
  return [
    rotatePoint(bounds.min, center, rotation),
    rotatePoint({ x: bounds.max.x, y: bounds.min.y }, center, rotation),
    rotatePoint(bounds.max, center, rotation),
    rotatePoint({ x: bounds.min.x, y: bounds.max.y }, center, rotation),
  ];
}

export function itemBounds(item: MarkupItem): Bounds {
  return boundingBox(itemCorners(item));
}

export function pointToItemLocal(item: MarkupItem, point: Point): Point {
  return rotatePoint(point, itemCenter(item), -itemRotation(item));
}

export function itemLocalToPage(item: MarkupItem, point: Point): Point {
  return rotatePoint(point, itemCenter(item), itemRotation(item));
}

export function rotatePointsAround(points: Point[], center: Point, degrees: number): Point[] {
  return points.map((point) => rotatePoint(point, center, degrees));
}
