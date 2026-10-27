import { describe, expect, it } from "vitest";
import {
  arrowHeadGeometry,
  boundingBox,
  constrainAngle,
  distance,
  itemLocalBounds,
  nearestPointOnSegment,
  pointInPolygon,
  pointToSegmentDistance,
  polygonArea,
  polygonCentroid,
  polygonPerimeter,
  polylineLength,
  simplifyPolyline,
  translatePoints,
} from "../src/model/geometry";
import type { MarkupItem } from "../src/model/types";

describe("geometry", () => {
  it("measures distances and polyline lengths", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 3, y: 8 },
      ]),
    ).toBe(9);
  });

  it("closes a polyline when measuring a perimeter", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(polygonPerimeter(square)).toBe(40);
  });

  it("computes polygon area and centroid in either winding direction", () => {
    const clockwise = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
    ];
    expect(polygonArea(clockwise)).toBe(100);
    expect(polygonCentroid(clockwise)).toEqual({ x: 5, y: 5 });
  });

  it("detects points inside a polygon", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
  });

  it("finds the nearest point on a segment", () => {
    expect(nearestPointOnSegment({ x: 5, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({
      x: 5,
      y: 0,
    });
    expect(pointToSegmentDistance({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });

  it("constrains angles to 45 degree increments", () => {
    const constrained = constrainAngle({ x: 0, y: 0 }, { x: 10, y: 2 });
    expect(constrained.y).toBeCloseTo(0);
    expect(constrained.x).toBeCloseTo(Math.hypot(10, 2));
  });

  it("simplifies a noisy collinear line", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 5, y: 0.1 },
      { x: 10, y: 0 },
      { x: 15, y: 0.1 },
      { x: 20, y: 0 },
    ];
    expect(simplifyPolyline(points, 0.5)).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
  });

  it("puts the arrow tip at the endpoint and shortens the shaft underneath it", () => {
    const head = arrowHeadGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(head.shaftEnd.x).toBeCloseTo(92);
    expect(head.shaftEnd.y).toBeCloseTo(0);
    expect(head.wingA.x).toBeCloseTo(head.wingB.x);
    expect(head.wingA.y).toBeCloseTo(-head.wingB.y);
    expect(head.wingA.x).toBeLessThan(100);
  });

  it("does not push the shaft behind the start point on a very short arrow", () => {
    const head = arrowHeadGeometry({ x: 0, y: 0 }, { x: 3, y: 0 }, 10);
    expect(head.shaftEnd).toEqual({ x: 0, y: 0 });
  });

  it("grows a symbol's bounds with its stored plate size", () => {
    const symbol: MarkupItem = {
      id: "symbol",
      page: 1,
      kind: "symbol",
      points: [{ x: 100, y: 100 }],
      color: "#e5484d",
      strokeWidth: 1,
      symbolId: "fire.extinguisher",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(itemLocalBounds(symbol)).toEqual({
      min: { x: 88, y: 88 },
      max: { x: 112, y: 112 },
    });
    expect(itemLocalBounds({ ...symbol, symbolSize: 40 })).toEqual({
      min: { x: 80, y: 80 },
      max: { x: 120, y: 120 },
    });
  });

  it("translates and bounds points without mutating the input", () => {
    const points = [{ x: 1, y: 2 }];
    expect(translatePoints(points, 5, -1)).toEqual([{ x: 6, y: 1 }]);
    expect(points).toEqual([{ x: 1, y: 2 }]);
    expect(
      boundingBox([
        { x: -2, y: 4 },
        { x: 7, y: -1 },
      ]),
    ).toEqual({
      min: { x: -2, y: -1 },
      max: { x: 7, y: 4 },
    });
  });
});
