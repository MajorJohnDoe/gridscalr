import type { Bounds } from "./geometry";
import type { CountType, Point } from "./types";

/**
 * Count symbols are paper-space vector geometry. The same primitives are used
 * by the interactive canvas and by the flattened PDF export, so a symbol looks
 * identical on screen and in print. Coordinates are PDF points centered on the
 * clicked anchor and fit inside a COUNT_SYMBOL_SIZE box.
 */
export const COUNT_SYMBOL_SIZE = 12;
export const COUNT_SYMBOL_RADIUS = COUNT_SYMBOL_SIZE / 2;
/** Distance from the anchor to the label center, clear of the symbol. */
export const COUNT_LABEL_OFFSET = COUNT_SYMBOL_RADIUS + 11;

export const COUNT_TYPES: CountType[] = ["door", "window", "radiator", "fixture", "other"];

export const COUNT_TYPE_LABELS: Record<CountType, string> = {
  door: "Door",
  window: "Window",
  radiator: "Radiator",
  fixture: "Fixture",
  other: "Other",
};

export interface CountSymbolPath {
  points: Point[];
  closed: boolean;
}

export interface CountSymbolDot {
  center: Point;
  radius: number;
}

export interface CountSymbol {
  paths: CountSymbolPath[];
  dots: CountSymbolDot[];
}

export function countTypeLabel(type: CountType | undefined): string {
  return type ? COUNT_TYPE_LABELS[type] : COUNT_TYPE_LABELS.other;
}

export function countSymbolBounds(anchor: Point): Bounds {
  return {
    min: { x: anchor.x - COUNT_SYMBOL_RADIUS, y: anchor.y - COUNT_SYMBOL_RADIUS },
    max: { x: anchor.x + COUNT_SYMBOL_RADIUS, y: anchor.y + COUNT_SYMBOL_RADIUS },
  };
}

/** Returns the vector primitives for a count type, centered on the origin. */
export function countSymbol(type: CountType | undefined): CountSymbol {
  switch (type ?? "other") {
    case "door":
      return {
        paths: [line(-5, -5, -5, 5), arc(-5, -5, 10, Math.PI / 2, 0)],
        dots: [],
      };
    case "window":
      return {
        paths: [rect(-6, -2.5, 6, 2.5), line(-6, -0.8, 6, -0.8), line(-6, 0.8, 6, 0.8)],
        dots: [],
      };
    case "radiator":
      return {
        paths: [
          rect(-5, -3.5, 5, 3.5),
          line(-2.5, -3.5, -2.5, 3.5),
          line(0, -3.5, 0, 3.5),
          line(2.5, -3.5, 2.5, 3.5),
        ],
        dots: [],
      };
    case "fixture":
      return {
        paths: [circle(0, 0, 4), line(-2.8, -2.8, 2.8, 2.8), line(-2.8, 2.8, 2.8, -2.8)],
        dots: [],
      };
    case "other":
      return {
        paths: [circle(0, 0, 4)],
        dots: [{ center: { x: 0, y: 0 }, radius: 1.2 }],
      };
  }
}

function line(x1: number, y1: number, x2: number, y2: number): CountSymbolPath {
  return {
    points: [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ],
    closed: false,
  };
}

function rect(minX: number, minY: number, maxX: number, maxY: number): CountSymbolPath {
  return {
    points: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
    closed: true,
  };
}

function circle(cx: number, cy: number, radius: number): CountSymbolPath {
  return arc(cx, cy, radius, 0, Math.PI * 2);
}

/** Flattens an arc into short line segments so canvas and PDF share geometry. */
function arc(cx: number, cy: number, radius: number, start: number, end: number): CountSymbolPath {
  const steps = 24;
  const points: Point[] = [];
  for (let index = 0; index <= steps; index++) {
    const angle = start + ((end - start) * index) / steps;
    points.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  }
  return { points, closed: false };
}
