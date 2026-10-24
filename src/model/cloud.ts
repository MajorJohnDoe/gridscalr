import type { Point } from "./types";

/** Suggested scallop radius for a cloud, based on its shorter side. */
export function cloudRadiusForPoints(points: readonly Point[]): number {
  if (!points.length) return 4;
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const shorter = Math.min(maxX - minX, maxY - minY);
  return Math.max(3, Math.min(14, shorter * 0.07));
}

export interface CloudCurve {
  start: Point;
  cp1: Point;
  cp2: Point;
  end: Point;
}

/**
 * Bluebeam-style scalloped border. Each polygon edge becomes a series of
 * outward cubic bumps. The source points remain the editable vertices.
 */
export function cloudCurves(points: readonly Point[], radius = 6): CloudCurve[] {
  if (points.length < 3) return [];
  const curves: CloudCurve[] = [];
  const area = signedArea(points);
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.0001) continue;
    const ux = dx / length;
    const uy = dy / length;
    const nx = area >= 0 ? uy : -uy;
    const ny = area >= 0 ? -ux : ux;
    const count = Math.max(1, Math.round(length / (radius * 2)));
    const step = length / count;
    const depth = Math.min(radius * 0.95, step * 0.55) * (4 / 3);
    for (let bump = 0; bump < count; bump += 1) {
      const start = {
        x: a.x + ux * step * bump,
        y: a.y + uy * step * bump,
      };
      const end = {
        x: a.x + ux * step * (bump + 1),
        y: a.y + uy * step * (bump + 1),
      };
      curves.push({
        start,
        cp1: { x: start.x + nx * depth, y: start.y + ny * depth },
        cp2: { x: end.x + nx * depth, y: end.y + ny * depth },
        end,
      });
    }
  }
  return curves;
}

function signedArea(points: readonly Point[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}
