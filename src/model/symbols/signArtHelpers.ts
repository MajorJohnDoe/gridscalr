import type { SymbolArtShape } from "./types";
import { parseSymbolPath, serializeSymbolPath, transformSymbolCommands } from "../symbolPaths";

/** Status badge anchors and radii in the 64-unit view box. */
export const SIGN_BADGE = { x: 57, y: 9, r: 5 };
export const GLYPH_BADGE = { x: 52.5, y: 11.5, r: 5.5 };

export const filled = (d: string, fillRule: "nonzero" | "evenodd" = "nonzero"): SymbolArtShape => ({
  d,
  fillRule,
});

export const stroked = (d: string, strokeWidth = 4): SymbolArtShape => ({
  d,
  stroke: true,
  strokeWidth,
});

export function rotateD(data: string, degrees: number, cx = 32, cy = 32): string {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return serializeSymbolPath(
    transformSymbolCommands(parseSymbolPath(data), (point) => ({
      x: cx + (point.x - cx) * cos - (point.y - cy) * sin,
      y: cy + (point.x - cx) * sin + (point.y - cy) * cos,
    })),
  );
}

function bandBetween(ax: number, ay: number, bx: number, by: number, thickness: number): string {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  const nx = (-dy / length) * (thickness / 2);
  const ny = (dx / length) * (thickness / 2);
  return `M ${(ax + nx).toFixed(3)} ${(ay + ny).toFixed(3)} L ${(bx + nx).toFixed(3)} ${(by + ny).toFixed(3)} L ${(bx - nx).toFixed(3)} ${(by - ny).toFixed(3)} L ${(ax - nx).toFixed(3)} ${(ay - ny).toFixed(3)} Z`;
}

function headBetween(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  length: number,
): string {
  const dx = bx - ax;
  const dy = by - ay;
  const distance = Math.hypot(dx, dy);
  const ux = dx / distance;
  const uy = dy / distance;
  const nx = (-uy * width) / 2;
  const ny = (ux * width) / 2;
  const tip = { x: bx + ux * length, y: by + uy * length };
  const base = { x: bx - ux * 2, y: by - uy * 2 };
  return `M ${tip.x.toFixed(3)} ${tip.y.toFixed(3)} L ${(base.x + nx).toFixed(3)} ${(base.y + ny).toFixed(3)} L ${(base.x - nx).toFixed(3)} ${(base.y - ny).toFixed(3)} Z`;
}

export const RECYCLING_ARM = bandBetween(35.3, 19, 48, 39, 7);
export const RECYCLING_HEAD = headBetween(35.3, 19, 48, 39, 16, 11);
