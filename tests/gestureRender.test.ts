import { describe, expect, it } from "vitest";
import type { Project } from "../src/model/types";
import {
  GESTURE_REFRESH_DISTANCE,
  GESTURE_REFRESH_MS,
  GESTURE_SETTLE_MS,
  MIN_GESTURE_SETTLE_MS,
  ViewGestureSignal,
  captureStale,
  clampSettleMs,
  gestureContentKey,
  movedFar,
  rasterTransform,
  refreshDue,
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

function layersProject(): Project {
  return {
    layers: [
      {
        id: "root",
        kind: "measure",
        name: "Root",
        visible: true,
        locked: false,
        opacity: 1,
        color: "#ff0000",
        items: [],
      },
      {
        id: "child",
        kind: "measure",
        name: "Child",
        visible: true,
        locked: false,
        opacity: 1,
        color: "#ff0000",
        items: [],
        parentId: "root",
      },
    ],
  } as unknown as Project;
}

describe("gesture content identity", () => {
  it("changes only when the page or effective visibility changes", () => {
    const project = layersProject();
    const first = gestureContentKey(project, "page-a");
    expect(gestureContentKey(project, "page-a")).toBe(first);
    expect(gestureContentKey(project, "page-b")).not.toBe(first);
  });

  it("changes when a parent hides a child layer on the page", () => {
    const project = layersProject();
    const visible = gestureContentKey(project, "page-a");
    project.layers[0].pageState = { "page-a": { visible: false } };
    expect(gestureContentKey(project, "page-a")).not.toBe(visible);
  });

  it("has no key without a project", () => {
    expect(gestureContentKey(null, "page-a")).toBeNull();
  });
});

describe("gesture content key", () => {
  it("keeps the raster while the page and visibility are unchanged", () => {
    expect(captureStale("page-a:110", "page-a:110")).toBe(false);
  });

  it("drops the raster when the page changes", () => {
    expect(captureStale("page-a:110", "page-b:110")).toBe(true);
  });

  it("drops the raster when a layer's effective visibility changes", () => {
    expect(captureStale("page-a:110", "page-a:100")).toBe(true);
  });

  it("does not invalidate an unkeyed host", () => {
    expect(captureStale(null, "page-a:110")).toBe(false);
    expect(captureStale("page-a:110", null)).toBe(false);
    expect(captureStale(null, null)).toBe(false);
  });
});

describe("gesture refresh rule", () => {
  it("owes a real redraw once the refresh window has passed", () => {
    expect(refreshDue(1_000, 1_000)).toBe(false);
    expect(refreshDue(1_000 + GESTURE_REFRESH_MS - 1, 1_000)).toBe(false);
    expect(refreshDue(1_000 + GESTURE_REFRESH_MS, 1_000)).toBe(true);
  });

  it("never forces a redraw from an unusable clock", () => {
    expect(refreshDue(Number.NaN, 0)).toBe(false);
    expect(refreshDue(1_000, Number.NaN)).toBe(false);
  });

  it("refreshes well before a user could call the view frozen", () => {
    expect(GESTURE_REFRESH_MS).toBeGreaterThanOrEqual(GESTURE_SETTLE_MS);
    expect(GESTURE_REFRESH_MS).toBeLessThanOrEqual(150);
  });
});

describe("gesture distance rule", () => {
  it("keeps the capture while the view has barely moved", () => {
    expect(movedFar({ panX: 0, panY: 0 }, { panX: 40, panY: 30 }, 800, 600)).toBe(false);
  });

  it("refreshes once the view moved past the distance limit", () => {
    const limit = 600 * GESTURE_REFRESH_DISTANCE;
    expect(movedFar({ panX: 0, panY: 0 }, { panX: limit + 1, panY: 0 }, 800, 600)).toBe(true);
  });

  it("never refreshes from an unusable viewport", () => {
    expect(movedFar({ panX: 0, panY: 0 }, { panX: Number.NaN, panY: 0 }, 800, 600)).toBe(false);
  });

  it("refreshes a fast drag well before a quarter of a second", () => {
    expect(GESTURE_REFRESH_MS).toBeLessThanOrEqual(150);
  });
});

describe("view gesture signal", () => {
  it("delivers each begin and end edge to every listener", () => {
    const signal = new ViewGestureSignal();
    const first: string[] = [];
    const second: string[] = [];
    signal.subscribe((event) => first.push(`${event.phase}:${event.kind}`));
    signal.subscribe((event) => second.push(`${event.phase}:${event.kind}`));

    signal.publish({ phase: "begin", kind: "pointer" });
    signal.publish({ phase: "end", kind: "pointer" });
    signal.publish({ phase: "begin", kind: "wheel" });

    expect(first).toEqual(["begin:pointer", "end:pointer", "begin:wheel"]);
    expect(second).toEqual(first);
  });

  it("stops delivering to a listener once it unsubscribes", () => {
    const signal = new ViewGestureSignal();
    const events: string[] = [];
    const unsubscribe = signal.subscribe((event) => events.push(event.phase));

    signal.publish({ phase: "begin", kind: "pointer" });
    unsubscribe();
    signal.publish({ phase: "end", kind: "pointer" });

    expect(events).toEqual(["begin"]);
  });

  it("keeps the listener set stable when one listener unsubscribes mid-publish", () => {
    const signal = new ViewGestureSignal();
    const events: string[] = [];
    const unsubscribe = signal.subscribe((event) => {
      events.push(`first:${event.phase}`);
      unsubscribe();
    });
    signal.subscribe((event) => events.push(`second:${event.phase}`));

    signal.publish({ phase: "begin", kind: "pointer" });

    expect(events).toEqual(["first:begin", "second:begin"]);
  });
});
