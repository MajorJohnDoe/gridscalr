import { polygonCentroid } from "./geometry";
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
  primaryY: number;
  secondaryY?: number;
}

export const LABEL_PRIMARY_SIZE = 11;
export const LABEL_SECONDARY_SIZE = 9.5;
export const LABEL_PADDING_X = 7;

/** Label anchor in the same coordinate space as the supplied item points. */
export function labelAnchorForPoints(item: MarkupItem, points: Point[]): Point {
  if (item.kind === "area") {
    return polygonCentroid(item.points);
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
    return { x: mid.x - (dy / length) * 14, y: mid.y + (dx / length) * 14 };
  }
  return points[0];
}

export function measurementLabelParts(
  item: MarkupItem,
  project: Project,
): LabelParts | null {
  const metrics = itemMetrics(item, project);
  if (!metrics) return null;
  return {
    text: item.label ? `${item.label} · ${metrics.primary}` : metrics.primary,
    secondary: metrics.secondary,
  };
}

export function labelBox(
  anchor: Point,
  primaryWidth: number,
  secondaryWidth: number,
  secondary?: string,
): LabelBox {
  const width = Math.max(primaryWidth, secondaryWidth) + LABEL_PADDING_X * 2;
  const height = secondary ? 34 : 20;
  const x = anchor.x - width / 2;
  const y = anchor.y - height / 2;
  return {
    x,
    y,
    width,
    height,
    primaryY: secondary ? y + 11 : anchor.y + 0.5,
    secondaryY: secondary ? y + 24 : undefined,
  };
}
