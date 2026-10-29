import { distanceToAreaShape, areaShapeOf, pointInAreaShape } from "./area";
import { layerLockedOnPage, layerVisibleOnPage } from "./layers";
import {
  arcPolyline,
  distanceToPolyline,
  expandRect,
  itemBounds,
  itemLocalBounds,
  itemLocalToPage,
  pointInPolygon,
  pointToItemLocal,
  pointToSegmentDistance,
  radiusCircle,
} from "./geometry";
import { calloutLayout, cloudLabelLayout, deltaLayout, stampLayout } from "./annotations";
import type { Layer, MarkupItem, Point, Project } from "./types";

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
    const bounds = itemLocalBounds(item);
    const inside =
      localPoint.x >= bounds.min.x - tolerance &&
      localPoint.y >= bounds.min.y - tolerance &&
      localPoint.x <= bounds.max.x + tolerance &&
      localPoint.y <= bounds.max.y + tolerance;
    return inside ? { distance: 0, vertexIndex: -1, segmentIndex: -1 } : null;
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

function rectangleCorners(a: Point, b: Point | undefined): Point[] {
  const c = b ?? a;
  return [
    { x: a.x, y: a.y },
    { x: c.x, y: a.y },
    { x: c.x, y: c.y },
    { x: a.x, y: c.y },
  ];
}
