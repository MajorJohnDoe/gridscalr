// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavigationGesture } from "../src/canvas/pointer/navigation";
import { wheelZoomFactor } from "../src/canvas/pointer/wheel";
import type { Viewport } from "../src/canvas/viewport";
import { store } from "../src/state/store";
import {
  addLength,
  makeCanvasHarness,
  makeNavigationContext,
  makePointerProject,
} from "./helpers/canvasPointer";
import { pageIdFor } from "./helpers/pages";

function pointerMove(clientX: number, clientY: number): PointerEvent {
  return new PointerEvent("pointermove", { clientX, clientY });
}

function makeWheel(init: WheelEventInit): WheelEvent {
  return new WheelEvent("wheel", { cancelable: true, ...init });
}

beforeEach(() => {
  store.setProject(makePointerProject(), null);
});

afterEach(() => {
  store.closeProject();
});

describe("canvas pan", () => {
  it("pans from the pointer delta and ends the view gesture", () => {
    const view: Viewport = { page: 1, zoom: 2, panX: 10, panY: 20 };
    const { context, calls } = makeNavigationContext(view);
    const navigation = new NavigationGesture(context);

    navigation.beginPan(100, 120, 7);
    expect(navigation.panActive).toBe(true);
    expect(calls.captures).toEqual([7]);
    expect(calls.begins).toEqual(["pointer"]);

    // Pan uses the press point, not the previous move, so a reversed drag
    // returns to the original pan instead of drifting.
    expect(navigation.updatePan(pointerMove(150, 100))).toBe(true);
    expect(store.ui.panX).toBe(60);
    expect(store.ui.panY).toBe(0);
    expect(navigation.updatePan(pointerMove(80, 140))).toBe(true);
    expect(store.ui.panX).toBe(-10);
    expect(store.ui.panY).toBe(40);

    expect(navigation.endPan()).toBe(true);
    expect(navigation.panActive).toBe(false);
    expect(calls.ends).toEqual(["pointer"]);
    expect(navigation.updatePan(pointerMove(0, 0))).toBe(false);
    expect(navigation.endPan()).toBe(false);
  });

  it("pans with the space bar or the middle button through the controller", () => {
    const middle = makeCanvasHarness({ view: { zoom: 2, panX: 10, panY: 20 } });
    middle.pointer("pointerdown", { clientX: 100, clientY: 120, button: 1 });
    expect(middle.controller.panActive).toBe(true);
    middle.pointer("pointermove", { clientX: 150, clientY: 100 });
    expect(store.ui.panX).toBe(60);
    expect(store.ui.panY).toBe(0);
    middle.pointer("pointerup", { clientX: 150, clientY: 100 });
    expect(middle.controller.panActive).toBe(false);
    expect(middle.host.beginViewGesture).toHaveBeenCalledWith("pointer");
    expect(middle.host.endViewGesture).toHaveBeenCalledWith("pointer");

    const spaced = makeCanvasHarness({ view: { zoom: 1, panX: 0, panY: 0 } });
    spaced.controller.setSpaceDown(true);
    spaced.pointer("pointerdown", { clientX: 20, clientY: 30 });
    expect(spaced.controller.panActive).toBe(true);
    spaced.pointer("pointermove", { clientX: 25, clientY: 55 });
    expect(store.ui.panX).toBe(5);
    expect(store.ui.panY).toBe(25);
    spaced.pointer("pointerup", { clientX: 25, clientY: 55 });
    expect(spaced.controller.panActive).toBe(false);
  });
});

describe("canvas marquee", () => {
  it("selects visible intersecting items and ignores hidden ones", () => {
    const project = store.project;
    if (!project) throw new Error("expected a project");
    const visible = addLength(project, "visible");
    const hidden = addLength(project, "hidden", [
      { x: 120, y: 110 },
      { x: 180, y: 110 },
    ]);
    hidden.item.visible = false;
    const view: Viewport = { page: 1, zoom: 1, panX: 0, panY: 0 };
    const { context, calls } = makeNavigationContext(view);
    const navigation = new NavigationGesture(context);

    navigation.beginMarquee({ x: 50, y: 50 }, false, 3);
    expect(navigation.marqueeActive).toBe(true);
    expect(navigation.marqueeState).toEqual({
      start: { x: 50, y: 50 },
      current: { x: 50, y: 50 },
      additive: false,
    });
    expect(calls.captures).toEqual([3]);

    expect(navigation.updateMarquee({ x: 250, y: 150 })).toBe(true);
    expect(navigation.marqueeState?.current).toEqual({ x: 250, y: 150 });
    navigation.finishMarquee();

    expect(navigation.marqueeActive).toBe(false);
    expect(store.ui.selection).toEqual([{ layerId: visible.layer.id, itemId: "visible" }]);
    expect(calls.draws).toBeGreaterThan(0);
  });

  it("keeps the existing selection when the marquee is additive", () => {
    const project = store.project;
    if (!project) throw new Error("expected a project");
    const inside = addLength(project, "inside");
    const outside = addLength(project, "outside", [
      { x: 400, y: 400 },
      { x: 450, y: 400 },
    ]);
    const view: Viewport = { page: 1, zoom: 1, panX: 0, panY: 0 };
    const navigation = new NavigationGesture(makeNavigationContext(view).context);
    store.setSelection({ layerId: outside.layer.id, itemId: "outside" });

    navigation.beginMarquee({ x: 50, y: 50 }, true, 4);
    navigation.updateMarquee({ x: 250, y: 150 });
    navigation.finishMarquee();

    expect(store.ui.selection).toEqual([
      { layerId: outside.layer.id, itemId: "outside" },
      { layerId: inside.layer.id, itemId: "inside" },
    ]);
  });

  it("ignores an accidental click-sized marquee", () => {
    const project = store.project;
    if (!project) throw new Error("expected a project");
    const { layer, item } = addLength(project, "item");
    store.setSelection({ layerId: layer.id, itemId: item.id });
    const view: Viewport = { page: 1, zoom: 1, panX: 0, panY: 0 };
    const navigation = new NavigationGesture(makeNavigationContext(view).context);

    navigation.beginMarquee({ x: 50, y: 50 }, false, 5);
    navigation.updateMarquee({ x: 51, y: 51 });
    navigation.finishMarquee();

    expect(store.ui.selection).toEqual([{ layerId: layer.id, itemId: item.id }]);
  });

  it("starts, updates and finishes a marquee through pointer dispatch", () => {
    const project = makePointerProject();
    const { layer, item } = addLength(project, "marquee-item");
    const harness = makeCanvasHarness({ project });

    harness.pointer("pointerdown", { clientX: 50, clientY: 50 });
    expect(harness.controller.marqueeActive).toBe(true);
    expect(harness.controller.marqueeState?.start).toEqual({ x: 50, y: 50 });

    harness.pointer("pointermove", { clientX: 250, clientY: 150 });
    expect(harness.controller.marqueeState?.current).toEqual({ x: 250, y: 150 });
    expect(store.ui.selection).toEqual([]);

    harness.pointer("pointerup", { clientX: 250, clientY: 150 });
    expect(harness.controller.marqueeActive).toBe(false);
    expect(store.ui.selection).toEqual([{ layerId: layer.id, itemId: item.id }]);
  });
});

describe("canvas wheel dispatch", () => {
  it("zooms with Ctrl/Cmd + wheel and keeps plain wheel for panning", () => {
    const view: Viewport = { page: 1, zoom: 1, panX: 10, panY: 20 };
    const { context, calls } = makeNavigationContext(view);
    const navigation = new NavigationGesture(context);
    const zoomAt = vi.fn();

    const pinch = makeWheel({ ctrlKey: true, deltaY: -20, deltaMode: 0 });
    navigation.onWheel(pinch, { x: 300, y: 200 }, zoomAt);
    expect(pinch.defaultPrevented).toBe(true);
    expect(zoomAt).toHaveBeenCalledWith({ x: 300, y: 200 }, wheelZoomFactor(pinch));
    expect(wheelZoomFactor(pinch)).toBeGreaterThan(1);
    expect(calls.begins).toEqual(["wheel"]);
    expect(calls.ends).toEqual(["wheel"]);

    // A zero delta (for example a horizontal-only touchpad event) is a no-op.
    zoomAt.mockClear();
    navigation.onWheel(makeWheel({ ctrlKey: true, deltaY: 0 }), { x: 1, y: 1 }, zoomAt);
    expect(zoomAt).not.toHaveBeenCalled();

    navigation.onWheel(makeWheel({ deltaX: 5, deltaY: 7 }), { x: 0, y: 0 }, zoomAt);
    expect(store.ui.panX).toBe(5);
    expect(store.ui.panY).toBe(13);

    // Shift + wheel scrolls horizontally from the viewport the context reports.
    navigation.onWheel(makeWheel({ shiftKey: true, deltaX: 5, deltaY: 9 }), { x: 0, y: 0 }, zoomAt);
    expect(store.ui.panX).toBe(1);
    expect(store.ui.panY).toBe(20);
    expect(zoomAt).not.toHaveBeenCalled();
    expect(calls.begins).toEqual(["wheel", "wheel", "wheel"]);
  });

  it("zooms and pans through the controller without touching the active tool", () => {
    const harness = makeCanvasHarness({ view: { zoom: 1, panX: 0, panY: 0 } });
    expect(store.ui.activeTool).toBe("select");

    const wheel = harness.wheel({ ctrlKey: true, clientX: 400, clientY: 300, deltaY: -40 });
    expect(wheel.defaultPrevented).toBe(true);
    expect(harness.zoomAt).toHaveBeenCalledTimes(1);
    expect(harness.view.zoom).toBeGreaterThan(1);
    expect(store.ui.zoom).toBeCloseTo(harness.view.zoom, 6);
    expect(store.ui.activeTool).toBe("select");

    const panX = harness.view.panX;
    const panY = harness.view.panY;
    harness.wheel({ clientX: 400, clientY: 300, deltaX: 12, deltaY: 4 });
    expect(store.ui.panX).toBe(panX - 12);
    expect(store.ui.panY).toBe(panY - 4);
  });

  it("ignores wheel input when no project is open", () => {
    store.closeProject();
    const view: Viewport = { page: 1, zoom: 1, panX: 0, panY: 0 };
    const { context } = makeNavigationContext(view);
    const navigation = new NavigationGesture(context);
    const zoomAt = vi.fn();
    const wheel = makeWheel({ ctrlKey: true, deltaY: -20 });
    navigation.onWheel(wheel, { x: 0, y: 0 }, zoomAt);
    expect(wheel.defaultPrevented).toBe(false);
    expect(zoomAt).not.toHaveBeenCalled();
    expect(store.ui.panX).toBe(0);
  });
});

describe("pointer coordinate conversion", () => {
  it("uses the canvas rect for local points", () => {
    const harness = makeCanvasHarness({ view: { zoom: 2, panX: 10, panY: 20 } });
    const event = new PointerEvent("pointermove", { clientX: 210, clientY: 220 });
    expect(harness.controller.localPoint(event)).toEqual({ x: 210, y: 220 });
    expect(harness.host.toPage({ x: 210, y: 220 })).toEqual({ x: 100, y: 100 });
    expect(store.project?.pages[0].id).toBe(pageIdFor(1));
  });
});
