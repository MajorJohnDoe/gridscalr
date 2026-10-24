import {
  distanceToAreaShape,
  areaShapeOf,
  pointInAreaShape,
} from "./area";
import {
  distanceToPolyline,
  itemBounds,
  itemLocalBounds,
  itemLocalToPage,
  pointToItemLocal,
  pointToSegmentDistance,
} from "./geometry";
import type { Layer, MarkupItem, Point, Project } from "./types";

export interface HitResult {
  layer: Layer;
  item: MarkupItem;
  distance: number;
  vertexIndex: number;
  segmentIndex: number;
}

function hitItem(item: MarkupItem, point: Point, tolerance: number): Omit<HitResult, "layer" | "item"> | null {
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

  if (item.kind === "count") {
    const anchor = item.points[0];
    if (!anchor) return null;
    const distance = Math.hypot(localPoint.x - anchor.x, localPoint.y - anchor.y);
    return distance <= tolerance
      ? { distance, vertexIndex: -1, segmentIndex: -1 }
      : null;
  }

  if (item.kind === "area") {
    const shape = areaShapeOf(item);
    const inside = pointInAreaShape(localPoint, item.points, shape);
    const edgeDistance = distanceToAreaShape(localPoint, item.points, shape);
    if (inside || edgeDistance <= tolerance) {
      return { distance: inside ? 0 : edgeDistance, vertexIndex: -1, segmentIndex: -1 };
    }
    return null;
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
    if (!options.includeHidden && !layer.visible) continue;
    if (!options.includeLocked && layer.locked) continue;
    for (let i = layer.items.length - 1; i >= 0; i--) {
      const item = layer.items[i];
      if (item.page !== page) continue;
      if (!options.includeHidden && item.visible === false) continue;
      if (!options.includeLocked && item.locked === true) continue;
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

export function findVertex(
  item: MarkupItem,
  point: Point,
  tolerance: number,
): number {
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
