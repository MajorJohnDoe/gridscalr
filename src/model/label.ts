import { areaCentroid, areaShapeOf } from "./area";
import { COUNT_LABEL_OFFSET } from "./countSymbols";
import { itemMetrics } from "./measure";
import type { MarkupItem, Point, Project } from "./types";

export interface LabelParts {
  text: string;
  secondary?: string;
}

export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
  primaryCenterY: number;
  secondaryCenterY?: number;
}

export interface LabelMetrics {
  primarySize: number;
  secondarySize: number;
  paddingX: number;
  paddingY: number;
  primaryLine: number;
  secondaryLine: number;
  rowGap: number;
  radius: number;
  borderWidth: number;
  leaderWidth: number;
  gap: number;
}

export type LabelWeight = "regular" | "bold";
export type LabelMeasure = (text: string, size: number, weight: LabelWeight) => number;

/**
 * Labels are paper-space annotations. The same point values are used for the
 * interactive canvas (multiplied by the viewport zoom) and for PDF export.
 * Keeping the source values in points prevents labels from growing relative
 * to the drawing when the user zooms or when the page is printed.
 *
 * There is deliberately no on-screen size cap: the canvas must show the same
 * relative label size as the exported PDF. Users who need larger labels can
 * raise the project size or resize an individual label.
 *
 * Keep these compact: measurement labels are annotations on top of the plan,
 * not headings.
 */
export const LABEL_PRIMARY_SIZE = 6;
export const LABEL_SECONDARY_SIZE = 5;
export const LABEL_MIN_SIZE = 4;
export const LABEL_MAX_SIZE = 16;
export const LABEL_PADDING_X = 4.2;
export const LABEL_PADDING_Y = 2.6;
export const LABEL_ROW_GAP = 0.4;
export const LABEL_RADIUS = 2.2;
export const LABEL_BORDER_WIDTH = 0.6;
export const LABEL_LEADER_WIDTH = 0.6;
export const LABEL_GAP = 5;
export const LABEL_LINE_OFFSET = 11;
export const LABEL_CALIBRATION_OFFSET = 13;
export const LABEL_INSIDE_MARGIN = 1.5;
export const LABEL_PAGE_MARGIN = 1.5;
export const LABEL_COLLISION_GAP = 1.5;

/** Keeps a stored or user-entered label size inside the supported range. */
export function clampLabelSize(size: number | null | undefined): number {
  if (typeof size !== "number" || !Number.isFinite(size)) return LABEL_PRIMARY_SIZE;
  return Math.max(LABEL_MIN_SIZE, Math.min(LABEL_MAX_SIZE, size));
}

/** Converts a primary label size in points to the shared metrics scale. */
export function labelScaleForSize(size: number | null | undefined): number {
  return clampLabelSize(size) / LABEL_PRIMARY_SIZE;
}

export function labelMetricsForSize(size: number | null | undefined): LabelMetrics {
  return labelMetrics(labelScaleForSize(size));
}

export function labelMetrics(scale = 1): LabelMetrics {
  const primarySize = LABEL_PRIMARY_SIZE * scale;
  const secondarySize = LABEL_SECONDARY_SIZE * scale;
  return {
    primarySize,
    secondarySize,
    paddingX: LABEL_PADDING_X * scale,
    paddingY: LABEL_PADDING_Y * scale,
    primaryLine: primarySize * 1.15,
    secondaryLine: secondarySize * 1.15,
    rowGap: LABEL_ROW_GAP * scale,
    radius: LABEL_RADIUS * scale,
    borderWidth: LABEL_BORDER_WIDTH,
    leaderWidth: LABEL_LEADER_WIDTH,
    gap: LABEL_GAP * scale,
  };
}

/** Label anchor in the same coordinate space as the supplied item points. */
export function labelAnchorForPoints(item: MarkupItem, points: Point[]): Point {
  if (item.kind === "area") {
    return areaCentroid(item.points, areaShapeOf(item));
  }
  if (item.kind === "count" && points.length === 1) {
    return { x: points[0].x, y: points[0].y - COUNT_LABEL_OFFSET };
  }
  if (points.length === 1) return points[0];
  if (item.kind === "rect" || item.kind === "ellipse") {
    return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
  }
  if (item.kind === "length" || item.kind === "line" || item.kind === "arrow") {
    const index = Math.max(0, Math.floor((points.length - 1) / 2));
    const a = points[index];
    const b = points[Math.min(points.length - 1, index + 1)];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: mid.x - (dy / length) * LABEL_LINE_OFFSET,
      y: mid.y + (dx / length) * LABEL_LINE_OFFSET,
    };
  }
  return points[0];
}

export function measurementLabelParts(item: MarkupItem, project: Project): LabelParts | null {
  const metrics = itemMetrics(item, project);
  if (!metrics) return null;
  // Compact labels only change the drawn annotation. The inspector and CSV
  // keep the descriptive "Perimeter" wording.
  const secondary =
    item.kind === "area" && project.settings.compactAreaLabels && metrics.secondary
      ? metrics.secondary.replace("Perimeter ", "P ")
      : metrics.secondary;
  return {
    text: item.label ? `${item.label} · ${metrics.primary}` : metrics.primary,
    secondary,
  };
}

/**
 * Builds a label box around a centered anchor. All measurements are in paper
 * points when used for layout; the canvas scales the result by the viewport
 * zoom before drawing.
 *
 * `scale` shrinks padding, row heights, and baselines together. Text widths
 * must already be measured at the correspondingly scaled font size.
 */
export function labelBox(
  anchor: Point,
  primaryWidth: number,
  secondaryWidth: number,
  secondary?: string,
  scale = 1,
): LabelBox {
  const metrics = labelMetrics(scale);
  const width = Math.max(primaryWidth, secondaryWidth) + metrics.paddingX * 2;
  const height =
    metrics.paddingY * 2 +
    metrics.primaryLine +
    (secondary ? metrics.rowGap + metrics.secondaryLine : 0);
  const x = anchor.x - width / 2;
  const y = anchor.y - height / 2;
  const primaryCenterY = y + metrics.paddingY + metrics.primaryLine / 2;
  return {
    x,
    y,
    width,
    height,
    primaryCenterY,
    secondaryCenterY: secondary
      ? primaryCenterY + metrics.primaryLine / 2 + metrics.rowGap + metrics.secondaryLine / 2
      : undefined,
  };
}
