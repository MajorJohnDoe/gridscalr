import { describe, expect, it } from "vitest";
import { cloudCurves, cloudRadiusForPoints } from "../src/model/cloud";

const square = [
  { x: 40, y: 40 },
  { x: 200, y: 40 },
  { x: 200, y: 140 },
  { x: 40, y: 140 },
];

describe("revision cloud geometry", () => {
  it("creates a continuous closed scalloped path", () => {
    const curves = cloudCurves(square, 6);
    expect(curves.length).toBeGreaterThan(4);
    expect(curves[0].start).toEqual(square[0]);
    for (let index = 1; index < curves.length; index += 1) {
      expect(curves[index].start.x).toBeCloseTo(curves[index - 1].end.x);
      expect(curves[index].start.y).toBeCloseTo(curves[index - 1].end.y);
    }
    expect(curves[curves.length - 1].end.x).toBeCloseTo(square[0].x);
    expect(curves[curves.length - 1].end.y).toBeCloseTo(square[0].y);
  });

  it("bulges outward from the polygon", () => {
    const curves = cloudCurves(square, 6);
    // The first edge goes left-to-right along the top; outward is negative Y.
    expect(curves[0].cp1.y).toBeLessThan(40);
    expect(curves[0].cp2.y).toBeLessThan(40);
  });

  it("requires at least three points", () => {
    expect(cloudCurves([{ x: 0, y: 0 }, { x: 10, y: 0 }], 6)).toEqual([]);
  });

  it("suggests smaller scallops for smaller clouds", () => {
    const small = cloudRadiusForPoints([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ]);
    const large = cloudRadiusForPoints([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ]);
    expect(small).toBeLessThan(large);
    expect(small).toBeGreaterThanOrEqual(3);
    expect(large).toBeLessThanOrEqual(14);
  });
});
