import { isReferenceCalibration, pageCalibration } from "./calibration";
import { layerVisibleOnPage } from "./layers";
import { areaOutline, areaShapeOf } from "./area";
import { countSymbolBounds } from "./countSymbols";
import {
  arcPolyline,
  boundingBox,
  circlePolyline,
  itemBounds,
  midpoint,
  pointInPolygon,
  radiusCircle,
  type Bounds,
} from "./geometry";
import {
  labelBox,
  labelMetrics,
  labelPlacementHintForPoints,
  labelScaleForSize,
  measurementLabelParts,
  LABEL_CALIBRATION_OFFSET,
  LABEL_COLLISION_GAP,
  LABEL_INSIDE_MARGIN,
  LABEL_MIN_SIZE,
  LABEL_PAGE_MARGIN,
  LABEL_PRIMARY_SIZE,
  type LabelBox,
  type LabelMeasure,
  type LabelMetrics,
  type LabelParts,
} from "./label";
import { formatNumber } from "./units";
import type { LabelFitPosition, MarkupItem, PageSize, Point, Project } from "./types";

export type LabelPlacement = "center" | "outside" | "line";

export interface LabelSource {
  id: string;
  kind: "area" | "length" | "count" | "calibration";
  parts: LabelParts;
  anchor: Point;
  obstacle: Bounds;
  /** Area outline, when the source is a measured polygon. */
  polygon?: Point[];
  /** Manual label offset in PDF points. Manual placement skips collision layout. */
  labelOffset?: Point;
  /** Manual leader connection point in PDF coordinates. */
  labelAnchor?: Point;
  /** Line or outline used to find the nearest connection point. */
  outline?: Point[];
  /** Reject placements whose box touches the outline or obstacle. */
  avoidSource?: boolean;
  /** Unit vector pointing away from a curve, line or wedge. */
  outward?: Point;
  /** Per-measurement primary size in PDF points. Omit to use the project size. */
  labelSize?: number;
  /** Keep the label inside the area and fit its size to the available space. */
  labelFit?: LabelFitPosition;
  color: string;
}

export const LABEL_FIT_POSITIONS: readonly LabelFitPosition[] = [
  "center",
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
];

export const LABEL_FIT_LABELS: Record<LabelFitPosition, string> = {
  center: "Center",
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-right": "Bottom right",
  "bottom-left": "Bottom left",
};

export function isLabelFitPosition(value: unknown): value is LabelFitPosition {
  return typeof value === "string" && (LABEL_FIT_POSITIONS as readonly string[]).includes(value);
}

export interface LabelLeader {
  from: Point;
  to: Point;
}

export interface LabelLayout {
  id: string;
  text: string;
  secondary?: string;
  color: string;
  box: LabelBox;
  metrics: LabelMetrics;
  placement: LabelPlacement;
  leader?: LabelLeader;
}

export interface LabelLayoutOptions {
  pageSize: PageSize;
  measure: LabelMeasure;
  /** Project-wide primary size in PDF points. */
  labelSize?: number;
}

export interface LabelSourceOptions {
  /** Layers selected for a drawing export. Omit to use every visible layer. */
  layerIds?: ReadonlySet<string>;
  /** False leaves generated measurement labels out of an export. */
  includeLabels?: boolean;
  /** Overrides the project's on-canvas calibration visibility when provided. */
  includeCalibration?: boolean;
}

export const CALIBRATION_LABEL_ID = "calibration";

/** A locked label may use at most this share of its area's paper width/height. */
const LABEL_FIT_WIDTH_RATIO = 0.6;
const LABEL_FIT_HEIGHT_RATIO = 0.4;

/** A label source for one measurement item, shared by the canvas and exports. */
export function measurementLabelSource(
  item: MarkupItem,
  parts: LabelParts,
  color: string,
): LabelSource {
  const hint = labelPlacementHintForPoints(item, item.points);
  const circle = radiusCircle(item);
  const outline =
    item.kind === "area" || item.kind === "volume"
      ? areaOutline(item.points, areaShapeOf(item))
      : item.kind === "length"
        ? item.points.map((point) => ({ ...point }))
        : circle
          ? circlePolyline(circle.center, circle.radius)
          : item.kind === "arc"
            ? arcPolyline(item)
            : item.kind === "angle" || item.kind === "slope"
              ? item.points.map((point) => ({ ...point }))
              : undefined;
  return {
    id: item.id,
    kind: item.kind === "area" ? "area" : item.kind === "count" ? "count" : "length",
    parts,
    anchor: hint.anchor,
    outward: hint.outward,
    avoidSource: hint.avoidSource,
    obstacle:
      item.kind === "count" && item.points[0]
        ? countSymbolBounds(item.points[0])
        : itemBounds(item),
    polygon:
      item.kind === "area" || item.kind === "volume"
        ? areaOutline(item.points, areaShapeOf(item))
        : undefined,
    labelOffset: item.labelOffset ? { ...item.labelOffset } : undefined,
    labelAnchor: item.labelAnchor ? { ...item.labelAnchor } : undefined,
    outline,
    labelSize: item.labelSize,
    labelFit: item.labelFit,
    color,
  };
}

/** Collects every visible measurement/calibration label in render order. */
export function pageLabelSources(
  project: Project,
  page: number,
  options: LabelSourceOptions = {},
): LabelSource[] {
  const sources: LabelSource[] = [];
  const includeLabels = options.includeLabels !== false;
  const includeCalibration = options.includeCalibration ?? project.settings.showCalibration;

  if (includeLabels) {
    for (const layer of project.layers) {
      if (!layerVisibleOnPage(layer, page) || layer.opacity <= 0) continue;
      if (options.layerIds && !options.layerIds.has(layer.id)) continue;
      for (const item of layer.items) {
        if (item.page !== page || item.visible === false) continue;
        if (
          item.kind !== "length" &&
          item.kind !== "area" &&
          item.kind !== "count" &&
          item.kind !== "radius" &&
          item.kind !== "diameter" &&
          item.kind !== "arc" &&
          item.kind !== "angle" &&
          item.kind !== "slope" &&
          item.kind !== "volume"
        ) {
          continue;
        }
        const parts = measurementLabelParts(item, project);
        if (!parts) continue;
        sources.push(measurementLabelSource(item, parts, item.color));
      }
    }
  }

  if (includeCalibration) {
    const calibration = pageCalibration(project, page);
    if (calibration && isReferenceCalibration(calibration)) {
      sources.push({
        id: CALIBRATION_LABEL_ID,
        kind: "calibration",
        parts: {
          text: `${formatNumber(calibration.knownLength, 2)} ${calibration.unit} reference`,
        },
        anchor: calibrationAnchor(calibration.p1, calibration.p2),
        obstacle: boundingBox([calibration.p1, calibration.p2]),
        color: "#a78bfa",
      });
    }
  }

  return sources;
}

export function layoutPageLabels(
  sources: LabelSource[],
  options: LabelLayoutOptions,
): Map<string, LabelLayout> {
  const layouts = new Map<string, LabelLayout>();
  const occupied: Bounds[] = [];

  for (const source of sources) {
    const layout = layoutLabel(source, options, occupied);
    layouts.set(source.id, layout);
    occupied.push(boxBounds(layout.box));
  }

  return layouts;
}

/**
 * Lays out a live drawing preview with the same rules as a saved label, so the
 * preview cannot drift away from the final placement.
 */
export function previewLabelLayout(
  item: MarkupItem,
  text: string,
  options: LabelLayoutOptions,
  color = "#35c2a1",
): LabelLayout {
  return layoutLabel(measurementLabelSource(item, { text }, color), options, []);
}

function searchInside(
  source: LabelSource,
  options: LabelLayoutOptions,
  high: number,
  anchorAt: (scale: number) => Point,
  fits: (layout: LabelLayout) => boolean,
): LabelLayout | null {
  const minScale = LABEL_MIN_SIZE / LABEL_PRIMARY_SIZE;
  const minimum = buildLayout(source, minScale, anchorAt(minScale), "center", options);
  if (!fits(minimum)) return null;
  let low = minScale;
  let upper = Math.max(minScale, high);
  let best = minimum;
  for (let index = 0; index < 9; index += 1) {
    const mid = (low + upper) / 2;
    const layout = buildLayout(source, mid, anchorAt(mid), "center", options);
    if (fits(layout)) {
      best = layout;
      low = mid;
    } else {
      upper = mid;
    }
  }
  return best;
}

function fitLabelInArea(
  source: LabelSource,
  options: LabelLayoutOptions,
  placement: LabelFitPosition,
): LabelLayout {
  const maxScale = labelScaleForSize(source.labelSize ?? options.labelSize ?? LABEL_PRIMARY_SIZE);
  const minScale = LABEL_MIN_SIZE / LABEL_PRIMARY_SIZE;

  const boxAt = (scale: number): LabelBox => {
    const metrics = labelMetrics(scale);
    const primaryWidth = options.measure(source.parts.text, metrics.primarySize, "bold");
    const secondaryWidth = source.parts.secondary
      ? options.measure(source.parts.secondary, metrics.secondarySize, "regular")
      : 0;
    return labelBox({ x: 0, y: 0 }, primaryWidth, secondaryWidth, source.parts.secondary, scale);
  };

  const base = boxAt(1);
  const boundsWidth = source.obstacle.max.x - source.obstacle.min.x;
  const boundsHeight = source.obstacle.max.y - source.obstacle.min.y;
  // A locked label should stay visually subordinate to its room. Fitting only
  // to overflow still produced a label covering most of a small A4 room, so
  // cap the fitted size to a share of the area as well.
  const high = Math.max(
    minScale,
    Math.min(
      maxScale,
      (boundsWidth * LABEL_FIT_WIDTH_RATIO) / Math.max(0.001, base.width),
      (boundsHeight * LABEL_FIT_HEIGHT_RATIO) / Math.max(0.001, base.height),
    ),
  );

  const fits = (layout: LabelLayout): boolean =>
    fitsInsideArea(layout.box, source) && fitsPage(layout.box, options.pageSize);

  if (placement === "center") {
    for (const anchor of [source.anchor, boundsCenter(source.obstacle)]) {
      const layout = searchInside(source, options, high, () => anchor, fits);
      if (layout) return layout;
    }
  } else {
    const layout = searchInside(
      source,
      options,
      high,
      (scale) => insideCornerAnchor(source.obstacle, placement, boxAt(scale)),
      fits,
    );
    if (layout) return layout;
  }

  // A concave or very small area may not hold even the minimum size at the
  // requested position. Keep the label centred at the minimum rather than
  // dropping it or moving it outside.
  return buildLayout(source, minScale, source.anchor, "center", options);
}

function insideCornerAnchor(bounds: Bounds, placement: LabelFitPosition, box: LabelBox): Point {
  const margin = LABEL_INSIDE_MARGIN;
  const left = bounds.min.x + margin + box.width / 2;
  const right = bounds.max.x - margin - box.width / 2;
  const top = bounds.min.y + margin + box.height / 2;
  const bottom = bounds.max.y - margin - box.height / 2;
  switch (placement) {
    case "top-left":
      return { x: left, y: top };
    case "top-right":
      return { x: right, y: top };
    case "bottom-right":
      return { x: right, y: bottom };
    case "bottom-left":
      return { x: left, y: bottom };
    default:
      return boundsCenter(bounds);
  }
}

function layoutLabel(
  source: LabelSource,
  options: LabelLayoutOptions,
  occupied: Bounds[],
): LabelLayout {
  // An explicitly locked label ignores manual offsets and the automatic
  // outside placement. It stays inside its area and uses the largest size that
  // fits, up to the project or per-measurement maximum.
  if (source.labelFit) return fitLabelInArea(source, options, source.labelFit);

  // Prefer the label inside its area. If the full size does not fit, shrink
  // just enough to stay inside (down to the minimum) before moving the label
  // outside with a leader. The same values drive the canvas and the export.
  const scale = labelScaleForSize(source.labelSize ?? options.labelSize ?? LABEL_PRIMARY_SIZE);

  if (source.labelOffset) {
    const anchor = {
      x: source.anchor.x + source.labelOffset.x,
      y: source.anchor.y + source.labelOffset.y,
    };
    return clampToPage(
      withLeader(buildLayout(source, scale, anchor, "line", options), source),
      options.pageSize,
    );
  }
  if (source.kind === "area") {
    const fits = (layout: LabelLayout): boolean =>
      fitsInsideArea(layout.box, source) &&
      fitsPage(layout.box, options.pageSize) &&
      !collides(layout.box, occupied);
    for (const center of [source.anchor, boundsCenter(source.obstacle)]) {
      const full = buildLayout(source, scale, center, "center", options);
      if (fits(full)) return full;
      const fitted = searchInside(source, options, scale, () => center, fits);
      if (fitted) return fitted;
    }
  } else if (source.avoidSource) {
    // Curves, wedges and slopes start outside their own geometry: offset the
    // preferred anchor along the outward direction by half the label box, so
    // the box never covers the measured line.
    const outward = source.outward ? outwardLayout(source, scale, options) : null;
    if (
      outward &&
      fitsPage(outward.box, options.pageSize) &&
      !overlapsSource(outward.box, source) &&
      !collides(outward.box, occupied)
    ) {
      return withLeader(outward, source);
    }
    const preferred = buildLayout(source, scale, source.anchor, "line", options);
    if (
      fitsPage(preferred.box, options.pageSize) &&
      !overlapsSource(preferred.box, source) &&
      !collides(preferred.box, occupied)
    ) {
      return withLeader(preferred, source);
    }
  } else {
    const preferred = buildLayout(source, scale, source.anchor, "line", options);
    if (fitsPage(preferred.box, options.pageSize) && !collides(preferred.box, occupied)) {
      return preferred;
    }

    const oppositeAnchor = reflectPoint(source.anchor, boundsCenter(source.obstacle));
    const opposite = buildLayout(source, scale, oppositeAnchor, "line", options);
    if (fitsPage(opposite.box, options.pageSize) && !collides(opposite.box, occupied)) {
      return withLeader(opposite, source);
    }
  }

  for (const anchor of outsideAnchors(source, scale, options.measure)) {
    const layout = buildLayout(source, scale, anchor, "outside", options);
    if (
      fitsPage(layout.box, options.pageSize) &&
      !overlapsSource(layout.box, source) &&
      !collides(layout.box, occupied)
    ) {
      return withLeader(layout, source);
    }
  }

  const fallbackAnchor = outsideAnchors(source, scale, options.measure)[0] ?? source.anchor;
  const fallback = clampToPage(
    buildLayout(source, scale, fallbackAnchor, "outside", options),
    options.pageSize,
  );
  return withLeader(fallback, source);
}

function buildLayout(
  source: LabelSource,
  scale: number,
  anchor: Point,
  placement: LabelPlacement,
  options: LabelLayoutOptions,
): LabelLayout {
  const metrics = labelMetrics(scale);
  const primaryWidth = options.measure(source.parts.text, metrics.primarySize, "bold");
  const secondaryWidth = source.parts.secondary
    ? options.measure(source.parts.secondary, metrics.secondarySize, "regular")
    : 0;
  return {
    id: source.id,
    text: source.parts.text,
    secondary: source.parts.secondary,
    color: source.color,
    box: labelBox(anchor, primaryWidth, secondaryWidth, source.parts.secondary, scale),
    metrics,
    placement,
  };
}

function outwardLayout(
  source: LabelSource,
  scale: number,
  options: LabelLayoutOptions,
): LabelLayout | null {
  const outward = source.outward;
  if (!outward) return null;
  const metrics = labelMetrics(scale);
  const primaryWidth = options.measure(source.parts.text, metrics.primarySize, "bold");
  const secondaryWidth = source.parts.secondary
    ? options.measure(source.parts.secondary, metrics.secondarySize, "regular")
    : 0;
  const size = labelBox(
    { x: 0, y: 0 },
    primaryWidth,
    secondaryWidth,
    source.parts.secondary,
    scale,
  );
  const offset =
    metrics.gap + (Math.abs(outward.x) * size.width + Math.abs(outward.y) * size.height) / 2;
  return buildLayout(
    source,
    scale,
    {
      x: source.anchor.x + outward.x * offset,
      y: source.anchor.y + outward.y * offset,
    },
    "outside",
    options,
  );
}

function outsideAnchors(source: LabelSource, scale: number, measure: LabelMeasure): Point[] {
  const metrics = labelMetrics(scale);
  const primaryWidth = measure(source.parts.text, metrics.primarySize, "bold");
  const secondaryWidth = source.parts.secondary
    ? measure(source.parts.secondary, metrics.secondarySize, "regular")
    : 0;
  const size = labelBox(
    { x: 0, y: 0 },
    primaryWidth,
    secondaryWidth,
    source.parts.secondary,
    scale,
  );
  const bounds = source.obstacle;
  const center = boundsCenter(bounds);
  const gap = metrics.gap;
  const anchors: Point[] = [];
  if (source.outward) {
    const offset =
      gap +
      (Math.abs(source.outward.x) * size.width + Math.abs(source.outward.y) * size.height) / 2;
    anchors.push({
      x: source.anchor.x + source.outward.x * offset,
      y: source.anchor.y + source.outward.y * offset,
    });
  }
  if (source.kind === "length" && source.outline && source.outline.length > 1) {
    const count = source.outline.length - 1;
    const step = Math.max(1, Math.ceil(count / 12));
    for (let index = 0; index < count; index += step) {
      const a = source.outline[index];
      const b = source.outline[index + 1];
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length < 1e-6) continue;
      const nx = -dy / length;
      const ny = dx / length;
      const offset = gap + (Math.abs(nx) * size.width + Math.abs(ny) * size.height) / 2;
      anchors.push(
        { x: midpoint.x + nx * offset, y: midpoint.y + ny * offset },
        { x: midpoint.x - nx * offset, y: midpoint.y - ny * offset },
      );
    }
  }
  anchors.push(
    { x: center.x, y: bounds.min.y - gap - size.height / 2 },
    { x: center.x, y: bounds.max.y + gap + size.height / 2 },
    { x: bounds.max.x + gap + size.width / 2, y: center.y },
    { x: bounds.min.x - gap - size.width / 2, y: center.y },
  );
  return anchors;
}

/**
 * A line label may sit inside the line's bounding box; only the line itself is
 * an obstacle. Areas and other sources keep the rectangular obstacle test.
 */
function overlapsSource(box: LabelBox, source: LabelSource): boolean {
  if (source.kind === "length" && source.outline && source.outline.length > 1) {
    return polylineIntersectsBox(source.outline, box, false, 2);
  }
  return overlapsObstacle(box, source.obstacle);
}

function polylineIntersectsBox(
  points: readonly Point[],
  box: LabelBox,
  closed: boolean,
  margin: number,
): boolean {
  const minX = box.x - margin;
  const minY = box.y - margin;
  const maxX = box.x + box.width + margin;
  const maxY = box.y + box.height + margin;
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1) {
    if (
      segmentIntersectsBox(
        points[index],
        points[(index + 1) % points.length],
        minX,
        minY,
        maxX,
        maxY,
      )
    ) {
      return true;
    }
  }
  return false;
}

function segmentIntersectsBox(
  a: Point,
  b: Point,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - minX, maxX - a.x, a.y - minY, maxY - a.y];
  for (let index = 0; index < 4; index += 1) {
    const denominator = p[index];
    const numerator = q[index];
    if (denominator === 0) {
      if (numerator < 0) return false;
      continue;
    }
    const ratio = numerator / denominator;
    if (denominator < 0) {
      if (ratio > t1) return false;
      if (ratio > t0) t0 = ratio;
    } else {
      if (ratio < t0) return false;
      if (ratio < t1) t1 = ratio;
    }
  }
  return true;
}

function withLeader(layout: LabelLayout, source: LabelSource): LabelLayout {
  if (source.kind === "calibration") return layout;
  const box = boxBounds(layout.box);
  const boxCenterPoint = boxCenter(box);
  const manualAnchor = source.labelAnchor;
  let anchorStillOnOutline = Boolean(manualAnchor);
  if (manualAnchor && source.outline && source.outline.length > 1) {
    const nearest = closestPointOnPolyline(source.outline, manualAnchor, source.kind === "area");
    anchorStillOnOutline = Math.hypot(manualAnchor.x - nearest.x, manualAnchor.y - nearest.y) <= 2;
  }
  const target = anchorStillOnOutline
    ? manualAnchor!
    : source.kind === "count"
      ? boundsCenter(source.obstacle)
      : source.outline && source.outline.length > 1
        ? closestPointOnPolyline(source.outline, boxCenterPoint, source.kind === "area")
        : closestPointOnBounds(source.obstacle, boxCenterPoint);
  return {
    ...layout,
    leader: {
      from: closestPointOnBounds(box, target),
      to: target,
    },
  };
}

/** Nearest point on a closed polygon or an open polyline. */
export function closestPointOnPolyline(
  points: readonly Point[],
  point: Point,
  closed: boolean,
): Point {
  if (!points.length) return point;
  if (points.length === 1) return points[0];
  let best = points[0];
  let bestDistance = Infinity;
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
    const candidate = { x: a.x + dx * t, y: a.y + dy * t };
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function calibrationAnchor(p1: Point, p2: Point): Point {
  const mid = midpoint(p1, p2);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: mid.x + (dy / length) * LABEL_CALIBRATION_OFFSET,
    y: mid.y - (dx / length) * LABEL_CALIBRATION_OFFSET,
  };
}

function boxBounds(box: LabelBox): Bounds {
  return {
    min: { x: box.x, y: box.y },
    max: { x: box.x + box.width, y: box.y + box.height },
  };
}

function boxCenter(bounds: Bounds): Point {
  return boundsCenter(bounds);
}

function boundsCenter(bounds: Bounds): Point {
  return {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
  };
}

function reflectPoint(point: Point, center: Point): Point {
  return {
    x: center.x * 2 - point.x,
    y: center.y * 2 - point.y,
  };
}

function fitsInsideArea(box: LabelBox, source: LabelSource): boolean {
  if (!fitsInside(box, source.obstacle)) return false;
  const polygon = source.polygon;
  if (!polygon || polygon.length < 3) return true;
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
  return corners.every((corner) => pointInPolygon(corner, polygon));
}

function fitsInside(box: LabelBox, bounds: Bounds): boolean {
  // The fit search places corner labels exactly on the margin. Allow a tiny
  // tolerance so binary floating-point rounding does not reject a valid size.
  const tolerance = 1e-6;
  return (
    box.x >= bounds.min.x + LABEL_INSIDE_MARGIN - tolerance &&
    box.y >= bounds.min.y + LABEL_INSIDE_MARGIN - tolerance &&
    box.x + box.width <= bounds.max.x - LABEL_INSIDE_MARGIN + tolerance &&
    box.y + box.height <= bounds.max.y - LABEL_INSIDE_MARGIN + tolerance
  );
}

function fitsPage(box: LabelBox, page: PageSize): boolean {
  const tolerance = 1e-6;
  return (
    box.x >= LABEL_PAGE_MARGIN - tolerance &&
    box.y >= LABEL_PAGE_MARGIN - tolerance &&
    box.x + box.width <= page.width - LABEL_PAGE_MARGIN + tolerance &&
    box.y + box.height <= page.height - LABEL_PAGE_MARGIN + tolerance
  );
}

function collides(box: LabelBox, occupied: Bounds[]): boolean {
  const bounds = boxBounds(box);
  return occupied.some((other) => boxesOverlap(bounds, other, LABEL_COLLISION_GAP));
}

function overlapsObstacle(box: LabelBox, obstacle: Bounds): boolean {
  return boxesOverlap(boxBounds(box), obstacle, 0.5);
}

function boxesOverlap(a: Bounds, b: Bounds, gap: number): boolean {
  return (
    a.min.x < b.max.x + gap &&
    a.max.x > b.min.x - gap &&
    a.min.y < b.max.y + gap &&
    a.max.y > b.min.y - gap
  );
}

function closestPointOnBounds(bounds: Bounds, point: Point): Point {
  return {
    x: Math.max(bounds.min.x, Math.min(bounds.max.x, point.x)),
    y: Math.max(bounds.min.y, Math.min(bounds.max.y, point.y)),
  };
}

function clampToPage(layout: LabelLayout, page: PageSize): LabelLayout {
  const maxX = Math.max(LABEL_PAGE_MARGIN, page.width - LABEL_PAGE_MARGIN - layout.box.width);
  const maxY = Math.max(LABEL_PAGE_MARGIN, page.height - LABEL_PAGE_MARGIN - layout.box.height);
  const x = Math.max(LABEL_PAGE_MARGIN, Math.min(maxX, layout.box.x));
  const y = Math.max(LABEL_PAGE_MARGIN, Math.min(maxY, layout.box.y));
  const dx = x - layout.box.x;
  const dy = y - layout.box.y;
  return {
    ...layout,
    box: {
      ...layout.box,
      x,
      y,
      primaryCenterY: layout.box.primaryCenterY + dy,
      secondaryCenterY:
        layout.box.secondaryCenterY === undefined ? undefined : layout.box.secondaryCenterY + dy,
    },
    leader: layout.leader
      ? {
          from: { x: layout.leader.from.x + dx, y: layout.leader.from.y + dy },
          to: layout.leader.to,
        }
      : undefined,
  };
}
