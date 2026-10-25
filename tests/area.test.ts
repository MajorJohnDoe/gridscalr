import { describe, expect, it } from "vitest";
import {
  areaCentroid,
  areaOutline,
  areaPerimeter,
  areaShapeOf,
  areaValue,
  distanceToAreaShape,
  pointInAreaShape,
  rectangleCorners,
} from "../src/model/area";
import type { MarkupItem, Point } from "../src/model/types";

const RECT: Point[] = [
  { x: 10, y: 20 },
  { x: 110, y: 70 },
];

function areaItem(overrides: Partial<MarkupItem> = {}): MarkupItem {
  return {
    id: "area",
    page: 1,
    kind: "area",
    points: RECT,
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("quick area geometry", () => {
  it("uses two opposite points for a rectangle", () => {
    expect(rectangleCorners(RECT)).toEqual([
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 70 },
      { x: 10, y: 70 },
    ]);
    expect(areaValue(RECT, "rectangle")).toBe(5000);
    expect(areaPerimeter(RECT, "rectangle")).toBe(300);
    expect(areaCentroid(RECT, "rectangle")).toEqual({ x: 60, y: 45 });
    expect(pointInAreaShape({ x: 60, y: 45 }, RECT, "rectangle")).toBe(true);
    expect(pointInAreaShape({ x: 0, y: 45 }, RECT, "rectangle")).toBe(false);
    expect(distanceToAreaShape({ x: 5, y: 45 }, RECT, "rectangle")).toBe(5);
    expect(areaOutline(RECT, "rectangle")).toHaveLength(4);
  });

  it("measures an ellipse from its bounding rectangle", () => {
    expect(areaValue(RECT, "ellipse")).toBeCloseTo((Math.PI * 100 * 50) / 4, 9);
    expect(areaPerimeter(RECT, "ellipse")).toBeGreaterThan(200);
    expect(areaCentroid(RECT, "ellipse")).toEqual({ x: 60, y: 45 });
    expect(pointInAreaShape({ x: 60, y: 45 }, RECT, "ellipse")).toBe(true);
    expect(pointInAreaShape({ x: 10, y: 20 }, RECT, "ellipse")).toBe(false);
    expect(distanceToAreaShape({ x: 60, y: 10 }, RECT, "ellipse")).toBeCloseTo(10, 0);
    expect(areaOutline(RECT, "ellipse").length).toBe(64);
  });

  it("keeps polygon behaviour when areaShape is missing", () => {
    const item = areaItem({
      areaShape: undefined,
      points: [
        { x: 10, y: 20 },
        { x: 110, y: 20 },
        { x: 110, y: 70 },
        { x: 10, y: 70 },
      ],
    });
    expect(areaShapeOf(item)).toBe("polygon");
    expect(areaValue(item.points, areaShapeOf(item))).toBe(5000);
    expect(areaCentroid(item.points, "polygon")).toEqual({ x: 60, y: 45 });
  });

  it("reads rectangle and ellipse shapes from area items only", () => {
    expect(areaShapeOf(areaItem({ areaShape: "rectangle" }))).toBe("rectangle");
    expect(areaShapeOf(areaItem({ areaShape: "ellipse" }))).toBe("ellipse");
    expect(areaShapeOf(areaItem({ kind: "rect", points: RECT, areaShape: "ellipse" }))).toBe(
      "polygon",
    );
  });
});
