import { describe, expect, it } from "vitest";
import {
  GESTURE_SETTLE_MS,
  MIN_GESTURE_SETTLE_MS,
  clampSettleMs,
  rasterTransform,
  settleDelay,
  settleDue,
} from "../src/features/gestureRender";

describe("gesture settle rule", () => {
  it("waits the whole idle window from the most recent input", () => {
    const clock = { lastInputAt: 1_000, idleMs: GESTURE_SETTLE_MS };
    expect(settleDelay(1_000, clock)).toBe(120);
    expect(settleDue(1_000, clock)).toBe(false);
    expect(settleDelay(1_119, clock)).toBe(1);
  });

  it("is due exactly at the idle boundary", () => {
    expect(settleDue(1_120, { lastInputAt: 1_000, idleMs: 120 })).toBe(true);
    expect(settleDue(1_500, { lastInputAt: 1_000, idleMs: 120 })).toBe(true);
  });

  it("settles at once when the clock reads before the last input", () => {
    expect(settleDue(900, { lastInputAt: 1_000, idleMs: 120 })).toBe(true);
  });

  it("settles at once for a non-finite sample", () => {
    expect(settleDue(Number.NaN, { lastInputAt: 1_000, idleMs: 120 })).toBe(true);
  });

  it("keeps an idle window inside a range a timer can honour", () => {
    expect(clampSettleMs(0)).toBe(MIN_GESTURE_SETTLE_MS);
    expect(clampSettleMs(-30)).toBe(MIN_GESTURE_SETTLE_MS);
    expect(clampSettleMs(Number.NaN)).toBe(GESTURE_SETTLE_MS);
    expect(clampSettleMs(GESTURE_SETTLE_MS)).toBe(GESTURE_SETTLE_MS);
    expect(clampSettleMs(500)).toBe(500);
  });
});

describe("gesture raster transform", () => {
  it("is the identity for an unchanged viewport", () => {
    expect(
      rasterTransform({ zoom: 2, panX: 10, panY: -5 }, { zoom: 2, panX: 10, panY: -5 }),
    ).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it("maps a pan to a translation", () => {
    expect(
      rasterTransform({ zoom: 1.5, panX: 20, panY: -40 }, { zoom: 1.5, panX: 50, panY: 10 }),
    ).toEqual({ scale: 1, offsetX: 30, offsetY: 50 });
  });

  it("keeps a page point on the same screen point the viewport puts it on", () => {
    const from = { zoom: 2, panX: 100, panY: 50 };
    const to = { zoom: 3, panX: -10, panY: -20 };
    const transform = rasterTransform(from, to);
    for (const point of [
      { x: 0, y: 0 },
      { x: 120, y: -40 },
      { x: -15.5, y: 82.25 },
    ]) {
      const before = { x: point.x * from.zoom + from.panX, y: point.y * from.zoom + from.panY };
      const after = { x: point.x * to.zoom + to.panX, y: point.y * to.zoom + to.panY };
      expect(transform.scale * before.x + transform.offsetX).toBeCloseTo(after.x, 9);
      expect(transform.scale * before.y + transform.offsetY).toBeCloseTo(after.y, 9);
    }
  });

  it("falls back to a translation when the captured zoom is unusable", () => {
    expect(rasterTransform({ zoom: 0, panX: 5, panY: 5 }, { zoom: 2, panX: 10, panY: 15 })).toEqual(
      { scale: 1, offsetX: 5, offsetY: 10 },
    );
    expect(
      rasterTransform({ zoom: Number.NaN, panX: 5, panY: 5 }, { zoom: 2, panX: 10, panY: 15 }),
    ).toEqual({ scale: 1, offsetX: 5, offsetY: 10 });
  });
});
