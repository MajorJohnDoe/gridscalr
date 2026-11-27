// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GestureRenderController, type GestureRenderHost } from "../src/features/gestureRender";

function harness(): GestureRenderController {
  const host: GestureRenderHost = {
    canvas: document.createElement("canvas"),
    context: {} as CanvasRenderingContext2D,
    dpr: () => 1,
    viewport: () => ({ zoom: 1, panX: 0, panY: 0 }),
    contentKey: () => "page-a:1",
    onSettle: () => undefined,
  };
  return new GestureRenderController(host);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("gesture render invalidation", () => {
  it("stays inactive after a content change clears a wheel settle", () => {
    const controller = harness();
    controller.begin("wheel");
    expect(controller.isActive).toBe(true);

    // A content change during the idle window drops the raster and the pending
    // settle. The host then draws the items for real and calls afterRedraw.
    controller.invalidate();
    controller.afterRedraw();

    expect(controller.isActive).toBe(false);
    expect(controller.paint()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(controller.isActive).toBe(false);
  });

  it("reuses a new gesture after invalidation", () => {
    const controller = harness();
    controller.begin("wheel");
    controller.invalidate();
    controller.afterRedraw();

    controller.begin("pointer");
    expect(controller.isActive).toBe(true);
  });
});
