// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TouchNavigation } from "../src/canvas/touchNavigation";
import { TouchInput } from "../src/canvas/pointer/touchInput";
import type { Viewport } from "../src/canvas/viewport";
import { store } from "../src/state/store";
import { makeCanvas, makeCanvasHarness, makePointerProject } from "./helpers/canvasPointer";

function touchEvent(type: string, init: PointerEventInit): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    ...init,
  });
}

function penEvent(type: string, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 99,
    pointerType: "pen",
    ...init,
  });
}

afterEach(() => {
  store.closeProject();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("two-finger touch navigation", () => {
  function navigation(options: { suppressOneFinger?: () => boolean } = {}) {
    let view: Viewport = { page: 1, zoom: 1, panX: 0, panY: 0 };
    const start = vi.fn();
    const end = vi.fn();
    const captured: number[] = [];
    const released: number[] = [];
    const touch = new TouchNavigation({
      getView: () => view,
      toLocal: (clientX, clientY) => ({ x: clientX, y: clientY }),
      setView: (next) => {
        view = next;
      },
      onGestureStart: start,
      onGestureEnd: end,
      suppressOneFinger: options.suppressOneFinger,
      capturePointer: (pointerId) => captured.push(pointerId),
      releasePointer: (pointerId) => released.push(pointerId),
    });
    return { touch, start, end, captured, released, view: () => view };
  }

  it("pinches around the moving finger midpoint and pans with both fingers", () => {
    const gesture = navigation();

    expect(
      gesture.touch.pointerDown(
        touchEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
      ),
    ).toBe(false);
    expect(
      gesture.touch.pointerDown(
        touchEvent("pointerdown", { pointerId: 2, clientX: 200, clientY: 100 }),
      ),
    ).toBe(true);
    expect(gesture.touch.active).toBe(true);
    expect(gesture.start).toHaveBeenCalledTimes(1);
    expect(gesture.captured).toEqual([1, 2]);

    gesture.touch.pointerMove(
      touchEvent("pointermove", { pointerId: 2, clientX: 300, clientY: 100 }),
    );
    expect(gesture.view().zoom).toBeCloseTo(2, 10);
    expect(gesture.view().panX).toBeCloseTo(-100, 10);
    expect(gesture.view().panY).toBeCloseTo(-100, 10);

    // Moving both fingers the same distance pans without changing zoom.
    gesture.touch.pointerMove(
      touchEvent("pointermove", { pointerId: 1, clientX: 120, clientY: 120 }),
    );
    gesture.touch.pointerMove(
      touchEvent("pointermove", { pointerId: 2, clientX: 320, clientY: 120 }),
    );
    expect(gesture.view().zoom).toBeCloseTo(2, 10);
    expect(gesture.view().panX).toBeCloseTo(-80, 10);
    expect(gesture.view().panY).toBeCloseTo(-80, 10);
  });

  it("suppresses a remaining finger until every touch is lifted", () => {
    const gesture = navigation();
    gesture.touch.pointerDown(
      touchEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
    );
    gesture.touch.pointerDown(
      touchEvent("pointerdown", { pointerId: 2, clientX: 200, clientY: 100 }),
    );
    expect(gesture.touch.suppressed).toBe(true);

    expect(gesture.touch.pointerUp(touchEvent("pointerup", { pointerId: 2 }))).toBe(true);
    expect(gesture.touch.active).toBe(false);
    expect(gesture.touch.suppressed).toBe(true);
    expect(gesture.end).toHaveBeenCalledTimes(1);
    expect(gesture.released).toEqual([2]);

    expect(
      gesture.touch.pointerMove(
        touchEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 100 }),
      ),
    ).toBe(true);
    expect(gesture.touch.pointerUp(touchEvent("pointerup", { pointerId: 1 }))).toBe(true);
    expect(gesture.touch.suppressed).toBe(false);
  });

  it("rejects a one-finger press, except while a palm is being suppressed", () => {
    const gesture = navigation();
    expect(
      gesture.touch.pointerDown(
        touchEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
      ),
    ).toBe(false);
    expect(gesture.touch.pointerUp(touchEvent("pointerup", { pointerId: 1 }))).toBe(false);

    const palm = navigation({ suppressOneFinger: () => true });
    expect(
      palm.touch.pointerDown(touchEvent("pointerdown", { pointerId: 3, clientX: 60, clientY: 60 })),
    ).toBe(true);
    expect(palm.touch.suppressed).toBe(true);
    expect(palm.touch.pointerUp(touchEvent("pointerup", { pointerId: 3 }))).toBe(true);
    expect(palm.touch.suppressed).toBe(false);
  });

  it("ignores mouse pointers and non-tracked touch moves", () => {
    const gesture = navigation();
    expect(
      gesture.touch.pointerDown(
        new PointerEvent("pointerdown", { pointerType: "mouse", pointerId: 1 }),
      ),
    ).toBe(false);
    expect(
      gesture.touch.pointerMove(
        touchEvent("pointermove", { pointerId: 8, clientX: 1, clientY: 1 }),
      ),
    ).toBe(false);
  });
});

describe("touch input state", () => {
  function touchInput() {
    const view: Viewport = { page: 1, zoom: 1, panX: 0, panY: 0 };
    const calls = {
      openContextMenu: vi.fn(),
      cancelGesture: vi.fn(),
      cancelDraft: vi.fn(),
      beginViewGesture: vi.fn(),
      endViewGesture: vi.fn(),
      capture: vi.fn(),
      release: vi.fn(),
    };
    const element = makeCanvas();
    const input = new TouchInput(element, {
      viewport: () => view,
      localFromClient: (clientX, clientY) => ({ x: clientX, y: clientY }),
      capturePointer: (pointerId) => calls.capture(pointerId),
      releasePointer: (pointerId) => calls.release(pointerId),
      cancelGesture: () => calls.cancelGesture(),
      cancelDraft: () => calls.cancelDraft(),
      openContextMenu: (clientX, clientY) => calls.openContextMenu(clientX, clientY),
      beginViewGesture: (kind) => calls.beginViewGesture(kind),
      endViewGesture: (kind) => calls.endViewGesture(kind),
    });
    return { input, calls, element };
  }

  beforeEach(() => {
    store.setProject(makePointerProject(), null);
    expect(store.ui.activeTool).toBe("select");
  });

  it("opens the context menu after a 550 ms touch long-press", () => {
    vi.useFakeTimers({ now: 10_000 });
    vi.spyOn(performance, "now").mockReturnValue(10_000);
    const { input, calls } = touchInput();
    expect(
      input.down(touchEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 120 })),
    ).toBe(false);

    vi.advanceTimersByTime(549);
    expect(calls.openContextMenu).not.toHaveBeenCalled();
    expect(input.longPressFired).toBe(false);

    vi.advanceTimersByTime(1);
    expect(input.longPressFired).toBe(true);
    expect(calls.cancelGesture).toHaveBeenCalledTimes(1);
    expect(calls.openContextMenu).toHaveBeenCalledWith(100, 120);

    // The long-press owns the release: the caller must not start a drawing.
    expect(input.up(touchEvent("pointerup", { pointerId: 1 }))).toBe(true);
    expect(input.longPressFired).toBe(false);
  });

  it("cancels the long-press once the finger moves more than 8 px", () => {
    vi.useFakeTimers({ now: 10_000 });
    const { input, calls } = touchInput();
    input.down(touchEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }));
    input.move(touchEvent("pointermove", { pointerId: 1, clientX: 109, clientY: 100 }));
    vi.advanceTimersByTime(600);
    expect(input.longPressFired).toBe(false);
    expect(calls.openContextMenu).not.toHaveBeenCalled();
  });

  it("does not arm a long-press for a drawing tool or a pen", () => {
    vi.useFakeTimers({ now: 10_000 });
    store.setTool("length");
    const drawing = touchInput();
    drawing.input.down(touchEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }));
    vi.advanceTimersByTime(600);
    expect(drawing.calls.openContextMenu).not.toHaveBeenCalled();

    store.setTool("select");
    const pen = touchInput();
    pen.input.markPenDown(penEvent("pointerdown"));
    // A pen event never starts a touch timer, even with the select tool.
    pen.input.down(touchEvent("pointerdown", { pointerId: 2, clientX: 50, clientY: 50 }));
    vi.advanceTimersByTime(600);
    expect(pen.calls.openContextMenu).not.toHaveBeenCalled();
  });

  it("gives the pen priority and rejects touch while the pen is active or recent", () => {
    vi.useFakeTimers({ now: 10_000 });
    let now = 10_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { input, calls } = touchInput();
    input.markPenDown(penEvent("pointerdown"));
    expect(
      input.down(touchEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 })),
    ).toBe(true);
    expect(calls.openContextMenu).not.toHaveBeenCalled();
    expect(input.up(touchEvent("pointerup", { pointerId: 1 }))).toBe(true);
    expect(input.up(penEvent("pointerup"))).toBe(false);

    // A palm arriving within the 800 ms pen grace window is still rejected.
    expect(input.down(touchEvent("pointerdown", { pointerId: 2, clientX: 60, clientY: 60 }))).toBe(
      true,
    );
    input.up(touchEvent("pointerup", { pointerId: 2 }));

    vi.advanceTimersByTime(900);
    now += 900;
    expect(input.down(touchEvent("pointerdown", { pointerId: 3, clientX: 60, clientY: 60 }))).toBe(
      false,
    );
    expect(input.touchBlocked).toBe(false);
  });

  it("drives two-finger navigation and reports the blocked state", () => {
    const { input, calls } = touchInput();
    expect(
      input.down(touchEvent("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 })),
    ).toBe(false);
    expect(
      input.down(touchEvent("pointerdown", { pointerId: 2, clientX: 200, clientY: 100 })),
    ).toBe(true);
    expect(input.touchBlocked).toBe(true);
    expect(calls.cancelGesture).toHaveBeenCalled();
    expect(calls.cancelDraft).toHaveBeenCalled();
    expect(calls.beginViewGesture).toHaveBeenCalledWith("pointer");

    input.move(touchEvent("pointermove", { pointerId: 2, clientX: 300, clientY: 100 }));
    expect(store.ui.zoom).toBeCloseTo(2, 10);

    expect(input.up(touchEvent("pointerup", { pointerId: 2 }))).toBe(true);
    expect(calls.endViewGesture).toHaveBeenCalledWith("pointer");
    expect(input.up(touchEvent("pointerup", { pointerId: 1 }))).toBe(true);
    expect(input.touchBlocked).toBe(false);
  });

  it("keeps a palm touch from starting a drag while the pen is down", () => {
    const project = makePointerProject();
    const harness = makeCanvasHarness({ project });
    harness.controller.markPenDown(penEvent("pointerdown"));

    harness.pointer("pointerdown", {
      pointerType: "touch",
      pointerId: 5,
      clientX: 150,
      clientY: 100,
    });
    expect(harness.controller.dragActive).toBe(false);
    expect(store.ui.selection).toEqual([]);
  });
});
