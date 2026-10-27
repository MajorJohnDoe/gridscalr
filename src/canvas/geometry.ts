import { distance, rotatePoint, type Bounds } from "../model/geometry";
import type { PageRect } from "../model/export";
import type { SnapKind } from "../model/snap";
import type { PageSize, Point } from "../model/types";

export type BoxHandleRole = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export function clampPointToPage(point: Point, size: PageSize): Point {
  return {
    x: Math.max(0, Math.min(size.width, point.x)),
    y: Math.max(0, Math.min(size.height, point.y)),
  };
}

export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export interface FocusBoundsOptions {
  /** Page padding used by Fit page, in screen pixels. */
  fitPadding?: number;
  /** Extra context around the target bounds. 1.25 adds 25 % breathing room. */
  marginFactor?: number;
  maxZoom?: number;
  minZoom?: number;
}

/**
 * Centers target bounds in the viewport without zooming out further than Fit
 * page. Small markups get a close-up; oversized targets fall back to the whole
 * page so the drawing remains the frame of reference.
 */
export function focusViewTransform(
  bounds: Bounds,
  pageSize: PageSize,
  viewport: { width: number; height: number },
  options: FocusBoundsOptions = {},
): ViewTransform {
  const fitPadding = options.fitPadding ?? 42;
  const marginFactor = options.marginFactor ?? 1.25;
  const maxZoom = options.maxZoom ?? 8;
  const minZoom = options.minZoom ?? 0.03;
  const innerWidth = Math.max(1, viewport.width - fitPadding * 2);
  const innerHeight = Math.max(1, viewport.height - fitPadding * 2);
  const fitZoom = Math.max(
    minZoom,
    Math.min(innerWidth / Math.max(1, pageSize.width), innerHeight / Math.max(1, pageSize.height)),
  );
  const width = Math.max(1, bounds.max.x - bounds.min.x) * marginFactor;
  const height = Math.max(1, bounds.max.y - bounds.min.y) * marginFactor;
  const targetZoom = Math.min(innerWidth / width, innerHeight / height);

  if (!Number.isFinite(targetZoom) || targetZoom <= fitZoom) {
    return {
      zoom: fitZoom,
      panX: (viewport.width - pageSize.width * fitZoom) / 2,
      panY: (viewport.height - pageSize.height * fitZoom) / 2,
    };
  }

  const zoom = Math.min(Math.max(targetZoom, fitZoom), Math.max(fitZoom, maxZoom));
  const center = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
  };
  return {
    zoom,
    panX: viewport.width / 2 - center.x * zoom,
    panY: viewport.height / 2 - center.y * zoom,
  };
}

export function pointInRect(point: Point, rect: PageRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function rectFromPoints(start: Point, end: Point): PageRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function movePageRect(rect: PageRect, start: Point, point: Point, size: PageSize): PageRect {
  return {
    x: Math.max(0, Math.min(size.width - rect.width, rect.x + point.x - start.x)),
    y: Math.max(0, Math.min(size.height - rect.height, rect.y + point.y - start.y)),
    width: rect.width,
    height: rect.height,
  };
}

export function resizePageRect(
  rect: PageRect,
  handle: BoxHandleRole | undefined,
  point: Point,
  size: PageSize,
): PageRect {
  if (!handle) return rect;
  const minSize = 1;
  let left = rect.x;
  let right = rect.x + rect.width;
  let top = rect.y;
  let bottom = rect.y + rect.height;
  if (handle.includes("w")) {
    left = Math.max(0, Math.min(right - minSize, point.x));
  }
  if (handle.includes("e")) {
    right = Math.min(size.width, Math.max(left + minSize, point.x));
  }
  if (handle.includes("n")) {
    top = Math.max(0, Math.min(bottom - minSize, point.y));
  }
  if (handle.includes("s")) {
    bottom = Math.min(size.height, Math.max(top + minSize, point.y));
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function constrainSquare(start: Point, point: Point): Point {
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: start.x + Math.sign(dx || 1) * size,
    y: start.y + Math.sign(dy || 1) * size,
  };
}

export function snapLabel(kind: SnapKind): string {
  if (kind === "endpoint") return "Endpoint";
  if (kind === "midpoint") return "Midpoint";
  return "Intersection";
}

export function cursorForRole(role: BoxHandleRole): string {
  switch (role) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
  }
}

export function handleLocalPoint(bounds: Bounds, role: BoxHandleRole): Point {
  const midX = (bounds.min.x + bounds.max.x) / 2;
  const midY = (bounds.min.y + bounds.max.y) / 2;
  switch (role) {
    case "nw":
      return { x: bounds.min.x, y: bounds.min.y };
    case "n":
      return { x: midX, y: bounds.min.y };
    case "ne":
      return { x: bounds.max.x, y: bounds.min.y };
    case "e":
      return { x: bounds.max.x, y: midY };
    case "se":
      return { x: bounds.max.x, y: bounds.max.y };
    case "s":
      return { x: midX, y: bounds.max.y };
    case "sw":
      return { x: bounds.min.x, y: bounds.max.y };
    case "w":
      return { x: bounds.min.x, y: midY };
  }
}

export function oppositeHandlePoint(bounds: Bounds, role: BoxHandleRole): Point {
  const midX = (bounds.min.x + bounds.max.x) / 2;
  const midY = (bounds.min.y + bounds.max.y) / 2;
  switch (role) {
    case "nw":
      return { x: bounds.max.x, y: bounds.max.y };
    case "n":
      return { x: midX, y: bounds.max.y };
    case "ne":
      return { x: bounds.min.x, y: bounds.max.y };
    case "e":
      return { x: bounds.min.x, y: midY };
    case "se":
      return { x: bounds.min.x, y: bounds.min.y };
    case "s":
      return { x: midX, y: bounds.min.y };
    case "sw":
      return { x: bounds.max.x, y: bounds.min.y };
    case "w":
      return { x: bounds.max.x, y: midY };
  }
}

export function scaleBounds(
  bounds: Bounds,
  anchor: Point,
  factorX: number,
  factorY: number,
): Bounds {
  return {
    min: {
      x: anchor.x + (bounds.min.x - anchor.x) * factorX,
      y: anchor.y + (bounds.min.y - anchor.y) * factorY,
    },
    max: {
      x: anchor.x + (bounds.max.x - anchor.x) * factorX,
      y: anchor.y + (bounds.max.y - anchor.y) * factorY,
    },
  };
}

export function rotatedAabb(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const center = { x: x + width / 2, y: y + height / 2 };
  const corners = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ].map((point) => rotatePoint(point, center, rotation));
  return {
    minX: Math.min(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxX: Math.max(...corners.map((point) => point.x)),
    maxY: Math.max(...corners.map((point) => point.y)),
  };
}

export function pointInBox(
  point: Point,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
}

export function closestPointOnBox(
  box: { x: number; y: number; width: number; height: number },
  point: Point,
): Point {
  return {
    x: Math.max(box.x, Math.min(box.x + box.width, point.x)),
    y: Math.max(box.y, Math.min(box.y + box.height, point.y)),
  };
}

export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function dedupeLast(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  if (distance(last, prev) < 0.0001) return points.slice(0, -1);
  return points;
}

export function hexAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const int = parseInt(full, 16);
  if (!Number.isFinite(int) || full.length !== 6) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function averagePoints(points: Point[]): Point {
  if (!points.length) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

export function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tip: Point,
  head: { wingA: Point; wingB: Point },
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(head.wingA.x, head.wingA.y);
  ctx.lineTo(head.wingB.x, head.wingB.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function isCancellation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ((error as { name?: string }).name === "RenderingCancelledException" ||
      (error as { name?: string }).name === "AbortException")
  );
}
