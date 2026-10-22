import {
  distance,
  distanceToPolyline,
  expandRect,
  midpoint,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonPerimeter,
} from "./geometry";
import type { AreaShape, MarkupItem, Point } from "./types";

const ELLIPSE_EDGE_SEGMENTS = 128;
const ELLIPSE_DRAW_SEGMENTS = 64;

export function areaShapeOf(item: MarkupItem): AreaShape {
  if (item.kind !== "area") return "polygon";
  return item.areaShape === "rectangle" || item.areaShape === "ellipse"
    ? item.areaShape
    : "polygon";
}

/** Clockwise corners for a rectangle described by two opposite points. */
export function rectangleCorners(points: Point[]): Point[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  const rect = expandRect(points[0], points[1]);
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

export function ellipseOutline(points: Point[], segments = ELLIPSE_DRAW_SEGMENTS): Point[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  const rect = expandRect(points[0], points[1]);
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const rx = rect.width / 2;
  const ry = rect.height / 2;
  const count = Math.max(16, Math.round(segments));
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      x: center.x + Math.cos(angle) * rx,
      y: center.y + Math.sin(angle) * ry,
    };
  });
}

/** A closed outline suitable for rendering, hit testing and label containment. */
export function areaOutline(points: Point[], shape: AreaShape): Point[] {
  if (shape === "rectangle") return rectangleCorners(points);
  if (shape === "ellipse") return ellipseOutline(points);
  return points.map((point) => ({ ...point }));
}

export function areaValue(points: Point[], shape: AreaShape): number {
  if (shape === "rectangle") {
    if (points.length < 2) return 0;
    const rect = expandRect(points[0], points[1]);
    return rect.width * rect.height;
  }
  if (shape === "ellipse") {
    if (points.length < 2) return 0;
    const rect = expandRect(points[0], points[1]);
    return (Math.PI * rect.width * rect.height) / 4;
  }
  return polygonArea(points);
}

export function areaPerimeter(points: Point[], shape: AreaShape): number {
  if (shape === "rectangle") {
    if (points.length < 2) return 0;
    const rect = expandRect(points[0], points[1]);
    return 2 * (rect.width + rect.height);
  }
  if (shape === "ellipse") {
    if (points.length < 2) return 0;
    const rect = expandRect(points[0], points[1]);
    const a = rect.width / 2;
    const b = rect.height / 2;
    // Ramanujan's second approximation, accurate for the eccentricity range
    // found on architectural drawings.
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  }
  return polygonPerimeter(points);
}

export function areaCentroid(points: Point[], shape: AreaShape): Point {
  if (shape === "rectangle" || shape === "ellipse") {
    if (points.length < 2) return points[0] ? { ...points[0] } : { x: 0, y: 0 };
    const rect = expandRect(points[0], points[1]);
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }
  return polygonCentroid(points);
}

export function pointInAreaShape(point: Point, points: Point[], shape: AreaShape): boolean {
  if (shape === "rectangle") {
    if (points.length < 2) return false;
    const rect = expandRect(points[0], points[1]);
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  }
  if (shape === "ellipse") {
    if (points.length < 2) return false;
    const rect = expandRect(points[0], points[1]);
    const rx = rect.width / 2;
    const ry = rect.height / 2;
    const center = midpoint(points[0], points[1]);
    if (rx <= 1e-9 || ry <= 1e-9) return distance(point, center) <= 1e-9;
    const nx = (point.x - center.x) / rx;
    const ny = (point.y - center.y) / ry;
    return nx * nx + ny * ny <= 1;
  }
  return pointInPolygon(point, points);
}

export function distanceToAreaShape(point: Point, points: Point[], shape: AreaShape): number {
  if (shape === "rectangle") {
    return points.length < 2
      ? points[0]
        ? distance(point, points[0])
        : Infinity
      : distanceToPolyline(point, rectangleCorners(points), true);
  }
  if (shape === "ellipse") {
    return points.length < 2
      ? points[0]
        ? distance(point, points[0])
        : Infinity
      : distanceToPolyline(point, ellipseOutline(points, ELLIPSE_EDGE_SEGMENTS), true);
  }
  return distanceToPolyline(point, points, true);
}

/** Corners/outline points used by snap and vector export. */
export function areaSnapOutline(item: MarkupItem): Point[] {
  if (item.kind !== "area") return item.points;
  return areaOutline(item.points, areaShapeOf(item));
}
