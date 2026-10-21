import { pageCalibration } from "./calibration";
import {
  boundingBox,
  itemBounds,
  midpoint,
  pointInPolygon,
  type Bounds,
} from "./geometry";
import {
  labelAnchorForPoints,
  labelBox,
  labelMetrics,
  measurementLabelParts,
  LABEL_CALIBRATION_OFFSET,
  LABEL_COLLISION_GAP,
  LABEL_INSIDE_MARGIN,
  LABEL_MIN_SCALE,
  LABEL_PAGE_MARGIN,
  type LabelBox,
  type LabelMeasure,
  type LabelMetrics,
  type LabelParts,
} from "./label";
import { formatNumber } from "./units";
import type { PageSize, Point, Project } from "./types";

export type LabelPlacement = "center" | "outside" | "line";

export interface LabelSource {
  id: string;
  kind: "area" | "length" | "calibration";
  parts: LabelParts;
  anchor: Point;
  obstacle: Bounds;
  /** Area outline, when the source is a measured polygon. */
  polygon?: Point[];
  color: string;
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
}

export const CALIBRATION_LABEL_ID = "calibration";

const LABEL_SCALES = [
  1,
  0.95,
  0.9,
  0.85,
  LABEL_MIN_SCALE,
].filter((scale, index, values) => values.indexOf(scale) === index);

/** Collects every visible measurement/calibration label in render order. */
export function pageLabelSources(project: Project, page: number): LabelSource[] {
  const sources: LabelSource[] = [];

  for (const layer of project.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    for (const item of layer.items) {
      if (item.page !== page || item.visible === false) continue;
      if (item.kind !== "length" && item.kind !== "area") continue;
      const parts = measurementLabelParts(item, project);
      if (!parts) continue;
      sources.push({
        id: item.id,
        kind: item.kind,
        parts,
        anchor: labelAnchorForPoints(item, item.points),
        obstacle: itemBounds(item),
        polygon: item.kind === "area" ? item.points : undefined,
        color: item.color,
      });
    }
  }

  if (project.settings.showCalibration) {
    const calibration = pageCalibration(project, page);
    if (calibration) {
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

function layoutLabel(
  source: LabelSource,
  options: LabelLayoutOptions,
  occupied: Bounds[],
): LabelLayout {
  if (source.kind === "area") {
    const centers = [source.anchor, boundsCenter(source.obstacle)];
    for (const scale of LABEL_SCALES) {
      for (const center of centers) {
        const layout = buildLayout(source, scale, center, "center", options);
        if (
          fitsInsideArea(layout.box, source) &&
          fitsPage(layout.box, options.pageSize) &&
          !collides(layout.box, occupied)
        ) {
          return layout;
        }
      }
    }
  } else {
    const preferred = buildLayout(source, 1, source.anchor, "line", options);
    if (fitsPage(preferred.box, options.pageSize) && !collides(preferred.box, occupied)) {
      return preferred;
    }

    const oppositeAnchor = reflectPoint(source.anchor, boundsCenter(source.obstacle));
    const opposite = buildLayout(source, 1, oppositeAnchor, "line", options);
    if (fitsPage(opposite.box, options.pageSize) && !collides(opposite.box, occupied)) {
      return withLeader(opposite, source);
    }
  }

  for (const scale of LABEL_SCALES) {
    for (const anchor of outsideAnchors(source, scale, options.measure)) {
      const layout = buildLayout(source, scale, anchor, "outside", options);
      if (
        fitsPage(layout.box, options.pageSize) &&
        !overlapsObstacle(layout.box, source.obstacle) &&
        !collides(layout.box, occupied)
      ) {
        return withLeader(layout, source);
      }
    }
  }

  const fallbackScale = LABEL_SCALES[LABEL_SCALES.length - 1];
  const fallbackAnchor =
    outsideAnchors(source, fallbackScale, options.measure)[0] ?? source.anchor;
  const fallback = clampToPage(
    buildLayout(source, fallbackScale, fallbackAnchor, "outside", options),
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

function outsideAnchors(
  source: LabelSource,
  scale: number,
  measure: LabelMeasure,
): Point[] {
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
  return [
    { x: center.x, y: bounds.min.y - gap - size.height / 2 },
    { x: center.x, y: bounds.max.y + gap + size.height / 2 },
    { x: bounds.max.x + gap + size.width / 2, y: center.y },
    { x: bounds.min.x - gap - size.width / 2, y: center.y },
  ];
}

function withLeader(layout: LabelLayout, source: LabelSource): LabelLayout {
  if (source.kind === "calibration") return layout;
  const box = boxBounds(layout.box);
  const target =
    source.kind === "area"
      ? closestPointOnBounds(source.obstacle, boxCenter(box))
      : boundsCenter(source.obstacle);
  return {
    ...layout,
    leader: {
      from: closestPointOnBounds(box, target),
      to: target,
    },
  };
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
  return (
    box.x >= bounds.min.x + LABEL_INSIDE_MARGIN &&
    box.y >= bounds.min.y + LABEL_INSIDE_MARGIN &&
    box.x + box.width <= bounds.max.x - LABEL_INSIDE_MARGIN &&
    box.y + box.height <= bounds.max.y - LABEL_INSIDE_MARGIN
  );
}

function fitsPage(box: LabelBox, page: PageSize): boolean {
  return (
    box.x >= LABEL_PAGE_MARGIN &&
    box.y >= LABEL_PAGE_MARGIN &&
    box.x + box.width <= page.width - LABEL_PAGE_MARGIN &&
    box.y + box.height <= page.height - LABEL_PAGE_MARGIN
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
        layout.box.secondaryCenterY === undefined
          ? undefined
          : layout.box.secondaryCenterY + dy,
    },
    leader: layout.leader
      ? {
          from: { x: layout.leader.from.x + dx, y: layout.leader.from.y + dy },
          to: layout.leader.to,
        }
      : undefined,
  };
}

