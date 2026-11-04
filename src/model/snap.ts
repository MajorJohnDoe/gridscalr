import { areaShapeOf, rectangleCorners } from "./area";
import { isReferenceCalibration, pageCalibration } from "./calibration";
import {
  arcPolyline,
  circlePolyline,
  distance,
  itemCorners,
  itemLocalToPage,
  itemRotation,
  radiusCircle,
  rotatePoint,
} from "./geometry";
import type { MarkupItem, Point, Project } from "./types";
import { layerVisibleOnPage } from "./layers";
import { railGeometry } from "./rail";
import { symbolFor, symbolSizeOf } from "../features/schematics/symbols/registry";

export type SnapKind = "endpoint" | "midpoint" | "intersection" | "segment";

export interface SnapCandidate {
  point: Point;
  kind: SnapKind;
  /** Items that produced the candidate. Used to ignore an item while dragging its own vertex. */
  itemIds?: string[];
  /** For kind "segment": the line the pointer is projected onto. */
  segment?: { a: Point; b: Point };
}

export interface SnapResult extends SnapCandidate {
  distance: number;
}

const KIND_PRIORITY: Record<SnapKind, number> = {
  endpoint: 0,
  intersection: 1,
  midpoint: 2,
  segment: 3,
};

/** Closest point on a finite segment to the given point. */
function closestOnSegment(point: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return { ...a };
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

interface Segment {
  a: Point;
  b: Point;
  itemId: string;
}

/**
 * Endpoint targets are existing item vertices. Rectangle corners are added so
 * a quick rectangle can snap to its four visible corners, not just the two
 * opposite points that define it.
 */
function endpointCandidates(item: MarkupItem): Point[] {
  const points = item.points.map((point) => itemLocalToPage(item, point));
  if (item.kind === "rect" || item.kind === "image") {
    return [...points, ...itemCorners(item)];
  }
  if (item.kind === "area" && areaShapeOf(item) === "rectangle") {
    return [
      ...points,
      ...rectangleCorners(item.points).map((point) => itemLocalToPage(item, point)),
    ];
  }
  if (item.kind === "highlight" && item.highlightShape === "rectangle") {
    return [
      ...points,
      ...rectangleCorners(item.points).map((point) => itemLocalToPage(item, point)),
    ];
  }
  if (item.kind === "rail") {
    const geometry = railGeometry(item);
    if (!geometry) return points;
    return geometry.rows.flatMap((row) => [
      { x: geometry.left, y: row.y },
      { x: (geometry.left + geometry.right) / 2, y: row.y },
      { x: geometry.right, y: row.y },
    ]);
  }
  if (item.kind === "symbol") {
    const definition = symbolFor(item.symbolId);
    const anchor = points[0];
    if (!anchor || !definition.ports?.length) return points;
    const scale = symbolSizeOf(item) / 64;
    const rotation = itemRotation(item);
    return [
      ...points,
      ...definition.ports.map((port) =>
        rotatePoint(
          {
            x: anchor.x + (port.x - 32) * scale,
            y: anchor.y + (port.y - 32) * scale,
          },
          anchor,
          rotation,
        ),
      ),
    ];
  }
  return points;
}

function openSegments(item: MarkupItem, points: Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let index = 1; index < points.length; index++) {
    segments.push({ a: points[index - 1], b: points[index], itemId: item.id });
  }
  return segments;
}

function closedSegments(item: MarkupItem, points: Point[]): Segment[] {
  if (points.length < 2) return [];
  const segments = openSegments(item, points);
  if (points.length > 2) {
    segments.push({ a: points[points.length - 1], b: points[0], itemId: item.id });
  }
  return segments;
}

/**
 * Straight segments that contribute midpoints and intersections in milestone 3A.
 * Freehand pen, highlight, ellipse, count and text are deliberately excluded.
 */
function straightsForItem(item: MarkupItem): Segment[] {
  if (item.kind === "length") {
    return openSegments(
      item,
      item.points.map((point) => itemLocalToPage(item, point)),
    );
  }
  if (item.kind === "radius" || item.kind === "diameter") {
    const circle = radiusCircle(item);
    return circle ? closedSegments(item, circlePolyline(circle.center, circle.radius)) : [];
  }
  if (item.kind === "arc") {
    return openSegments(item, arcPolyline(item));
  }
  if (item.kind === "angle" || item.kind === "slope") {
    return openSegments(item, item.points);
  }
  if (item.kind === "volume") {
    return closedSegments(item, item.points);
  }
  if (item.kind === "area") {
    const shape = areaShapeOf(item);
    if (shape === "ellipse") return [];
    if (shape === "rectangle") {
      const corners = rectangleCorners(item.points).map((point) => itemLocalToPage(item, point));
      return closedSegments(item, corners);
    }
    return closedSegments(
      item,
      item.points.map((point) => itemLocalToPage(item, point)),
    );
  }
  if (item.kind === "cloud") {
    return closedSegments(
      item,
      item.points.map((point) => itemLocalToPage(item, point)),
    );
  }
  if (item.kind === "rail") {
    const geometry = railGeometry(item);
    if (!geometry) return [];
    return geometry.rows.map((row) => ({
      a: { x: geometry.left, y: row.y },
      b: { x: geometry.right, y: row.y },
      itemId: item.id,
    }));
  }
  if (item.kind === "highlight" && item.highlightShape && item.highlightShape !== "stroke") {
    const points =
      item.highlightShape === "rectangle"
        ? rectangleCorners(item.points).map((point) => itemLocalToPage(item, point))
        : item.points.map((point) => itemLocalToPage(item, point));
    return closedSegments(item, points);
  }
  if (item.kind === "line" || item.kind === "arrow") {
    return openSegments(
      item,
      item.points.slice(0, 2).map((point) => itemLocalToPage(item, point)),
    );
  }
  if (item.kind === "rect") {
    return closedSegments(item, itemCorners(item));
  }
  return [];
}

function segmentIntersection(first: Segment, second: Segment): Point | null {
  const p = first.a;
  const r = { x: first.b.x - p.x, y: first.b.y - p.y };
  const q = second.a;
  const s = { x: second.b.x - q.x, y: second.b.y - q.y };
  const denominator = r.x * s.y - r.y * s.x;
  if (Math.abs(denominator) < 1e-9) return null;
  const qpx = q.x - p.x;
  const qpy = q.y - p.y;
  const t = (qpx * s.y - qpy * s.x) / denominator;
  const u = (qpx * r.y - qpy * r.x) / denominator;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: p.x + t * r.x, y: p.y + t * r.y };
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-7 && Math.abs(a.y - b.y) < 1e-7;
}

function addUnique(
  candidates: SnapCandidate[],
  seen: Map<string, SnapCandidate>,
  candidate: SnapCandidate,
): void {
  const key = `${candidate.kind}:${candidate.point.x.toFixed(5)}:${candidate.point.y.toFixed(5)}`;
  const existing = seen.get(key);
  if (existing) {
    // A shared endpoint belongs to more than one item. Keep every source so
    // excluding the item being dragged does not hide a valid neighbour.
    const ids = new Set([...(existing.itemIds ?? []), ...(candidate.itemIds ?? [])]);
    if (ids.size) existing.itemIds = [...ids];
    return;
  }
  seen.set(key, candidate);
  candidates.push(candidate);
}

/**
 * Pure candidate builder for one page. The canvas caches the result by project
 * revision/page so dragging stays responsive.
 */
export function collectSnapCandidates(project: Project, page: number): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];
  const seen = new Map<string, SnapCandidate>();
  const segments: Segment[] = [];

  for (const layer of project.layers) {
    if (!layerVisibleOnPage(layer, page)) continue;
    for (const item of layer.items) {
      if (item.page !== page || item.visible === false) continue;

      for (const point of endpointCandidates(item)) {
        addUnique(candidates, seen, {
          point: { ...point },
          kind: "endpoint",
          itemIds: [item.id],
        });
      }

      const itemSegments = straightsForItem(item);
      for (const segment of itemSegments) {
        const midpoint = {
          x: (segment.a.x + segment.b.x) / 2,
          y: (segment.a.y + segment.b.y) / 2,
        };
        addUnique(candidates, seen, {
          point: midpoint,
          kind: "midpoint",
          itemIds: [item.id],
        });
        // A projected segment target lets a pipe end anywhere along a rail row
        // or an existing pipe, not only at its endpoints and midpoint.
        candidates.push({
          point: midpoint,
          kind: "segment",
          itemIds: [item.id],
          segment: { a: { ...segment.a }, b: { ...segment.b } },
        });
      }
      segments.push(...itemSegments);
    }
  }

  if (project.settings.showCalibration) {
    const calibration = pageCalibration(project, page);
    if (calibration && isReferenceCalibration(calibration)) {
      for (const point of [calibration.p1, calibration.p2]) {
        addUnique(candidates, seen, { point: { ...point }, kind: "endpoint" });
      }
    }
  }

  for (let firstIndex = 0; firstIndex < segments.length; firstIndex++) {
    const first = segments[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex++) {
      const second = segments[secondIndex];
      if (first.itemId === second.itemId) {
        if (
          samePoint(first.a, second.a) ||
          samePoint(first.a, second.b) ||
          samePoint(first.b, second.a) ||
          samePoint(first.b, second.b)
        ) {
          continue;
        }
      }
      const point = segmentIntersection(first, second);
      if (!point) continue;
      addUnique(candidates, seen, {
        point,
        kind: "intersection",
        itemIds: [...new Set([first.itemId, second.itemId])],
      });
    }
  }

  return candidates;
}

/** Finds the nearest candidate within a screen-pixel threshold. */
export function findSnap(
  point: Point,
  candidates: readonly SnapCandidate[],
  tolerancePx: number,
  zoom: number,
): SnapResult | null {
  if (!Number.isFinite(tolerancePx) || tolerancePx <= 0 || zoom <= 0) return null;
  const radius = tolerancePx / zoom;
  let best: SnapResult | null = null;

  for (const candidate of candidates) {
    const candidatePoint = candidate.segment
      ? closestOnSegment(point, candidate.segment.a, candidate.segment.b)
      : candidate.point;
    const candidateDistance = distance(point, candidatePoint);
    if (candidateDistance > radius) continue;
    const priority = KIND_PRIORITY[candidate.kind];
    const bestPriority = best ? KIND_PRIORITY[best.kind] : Number.POSITIVE_INFINITY;
    if (
      !best ||
      priority < bestPriority ||
      (priority === bestPriority && candidateDistance < best.distance - 1e-9)
    ) {
      best = { ...candidate, point: candidatePoint, distance: candidateDistance };
    }
  }

  return best;
}
