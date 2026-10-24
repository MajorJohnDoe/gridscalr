import type { MarkupItem, Point } from "./types";

export interface TextBoxLayout {
  center: Point;
  width: number;
  height: number;
  lines: string[];
  fontSize: number;
  lineHeight: number;
  padding: number;
}

export interface PointRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function textLines(text: string | undefined): string[] {
  return (text ?? "").replace(/\r\n?/g, "\n").split("\n");
}

export function textBoxLayout(
  text: string | undefined,
  fontSize: number,
  width?: number,
  height?: number,
  tracking = 0,
): Omit<TextBoxLayout, "center"> {
  const lines = textLines(text);
  const size = Math.max(0.5, fontSize);
  const padding = Math.max(4, size * 0.45);
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 1);
  const autoWidth =
    longest * size * 0.62 + Math.max(0, longest - 1) * tracking + padding * 2;
  const autoHeight = lines.length * size * 1.25 + padding * 2;
  return {
    width: width && width > 0 ? width : Math.max(size * 3.5, autoWidth),
    height: height && height > 0 ? height : Math.max(size * 1.8, autoHeight),
    lines,
    fontSize: size,
    lineHeight: size * 1.25,
    padding,
  };
}

export function stampLayout(item: MarkupItem): TextBoxLayout {
  const size = item.fontSize ?? 12;
  const layout = textBoxLayout(item.text || "STAMP", size, undefined, undefined, size * 0.08);
  const center = item.points[0] ?? { x: 0, y: 0 };
  return { ...layout, center };
}

export function deltaLayout(item: MarkupItem): { center: Point; size: number } {
  return {
    center: item.points[0] ?? { x: 0, y: 0 },
    size: Math.max(12, item.fontSize ?? 14) * 2.1,
  };
}

export function calloutLayout(item: MarkupItem): Omit<TextBoxLayout, "center"> & {
  anchor: Point;
  center: Point;
  box: PointRect;
  leaderStart: Point;
} {
  const anchor = item.points[0] ?? { x: 0, y: 0 };
  const center = item.points[1] ?? anchor;
  const layout = textBoxLayout(
    item.text || "Callout",
    item.fontSize ?? 12,
    item.textBoxWidth,
    item.textBoxHeight,
  );
  const box = {
    x: center.x - layout.width / 2,
    y: center.y - layout.height / 2,
    width: layout.width,
    height: layout.height,
  };
  return {
    ...layout,
    anchor,
    center,
    box,
    leaderStart: closestPointOnBox(box, anchor),
  };
}

export function cloudLabelLayout(item: MarkupItem): (TextBoxLayout & { leaderEnd: Point }) | null {
  if (!item.text?.trim()) return null;
  const layout = textBoxLayout(
    item.text,
    item.fontSize ?? 12,
    item.textBoxWidth,
    item.textBoxHeight,
  );
  const bounds = pointBounds(item.points);
  const centroid = average(item.points);
  const center = item.textOffset
    ? { x: centroid.x + item.textOffset.x, y: centroid.y + item.textOffset.y }
    : {
        x: centroid.x,
        y: bounds.min.y - layout.height / 2 - 9,
      };
  return {
    ...layout,
    center,
    leaderEnd: centroid,
  };
}

export function closestPointOnBox(box: PointRect, point: Point): Point {
  return {
    x: Math.max(box.x, Math.min(box.x + box.width, point.x)),
    y: Math.max(box.y, Math.min(box.y + box.height, point.y)),
  };
}

export function pointBounds(points: readonly Point[]): { min: Point; max: Point } {
  if (!points.length) {
    const zero = { x: 0, y: 0 };
    return { min: zero, max: zero };
  }
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

function average(points: readonly Point[]): Point {
  if (!points.length) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}


/** Closest point on a closed polygon outline. */
export function closestPointOnPolygon(points: readonly Point[], point: Point): Point {
  if (!points.length) return point;
  if (points.length === 1) return points[0];
  let best = points[0];
  let bestDistance = Infinity;
  for (let index = 0; index < points.length; index += 1) {
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
