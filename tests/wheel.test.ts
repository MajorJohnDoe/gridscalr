import { describe, expect, it } from "vitest";
import { wheelDeltaPixels, wheelZoomFactor } from "../src/canvas/pointer/wheel";

describe("wheel zoom", () => {
  it("normalizes line and page deltas to pixels", () => {
    expect(wheelDeltaPixels(3, 0)).toBe(3);
    expect(wheelDeltaPixels(3, 1)).toBe(48);
    expect(wheelDeltaPixels(3, 2)).toBe(300);
  });

  it("zooms visibly for touchpad-sized pinch deltas", () => {
    expect(wheelZoomFactor({ deltaY: 1, deltaMode: 0 })).toBeLessThan(0.995);
    expect(wheelZoomFactor({ deltaY: 2, deltaMode: 0 })).toBeLessThan(0.98);
    expect(wheelZoomFactor({ deltaY: -1, deltaMode: 0 })).toBeGreaterThan(1.01);
  });

  it("keeps a Ctrl + mouse wheel notch at the previous scale", () => {
    const factor = wheelZoomFactor({ deltaY: 100, deltaMode: 0 });
    expect(factor).toBeGreaterThan(0.82);
    expect(factor).toBeLessThan(0.85);
    expect(wheelZoomFactor({ deltaY: -100, deltaMode: 0 })).toBeCloseTo(1 / factor, 5);
  });

  it("ignores empty wheel events", () => {
    expect(wheelZoomFactor({ deltaY: 0, deltaMode: 0 })).toBe(1);
  });
});
