// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyDragState } from "../src/canvas/pointer/drag";
import type { DragState } from "../src/canvas/pointer/pointerState";
import { addItem, layersForKind } from "../src/model/layers";
import type { MarkupItem, Point } from "../src/model/types";
import { store } from "../src/state/store";
import { addLength, makeCanvasHarness, makePointerProject } from "./helpers/canvasPointer";

function snapContext() {
  return {
    snapPoint: vi.fn((point: Point) => point),
    clearSnap: vi.fn(),
  };
}

function moveDrag(item: MarkupItem, layerId: string, startPage = { x: 100, y: 100 }): DragState {
  return {
    mode: "move",
    itemId: item.id,
    layerId,
    vertexIndex: -1,
    last: { ...startPage },
    moved: false,
    startPage,
    startSelection: [
      {
        ref: { layerId, itemId: item.id },
        points: item.points.map((point) => ({ ...point })),
      },
    ],
  };
}

afterEach(() => {
  store.closeProject();
});

describe("drag apply rules", () => {
  it("translates the whole selection on a move drag and reports no movement at the press point", () => {
    const project = makePointerProject();
    const { layer, item } = addLength(project, "line");
    store.setProject(project, null);
    const drag = moveDrag(item, layer.id);
    const context = snapContext();

    expect(applyDragState(drag, { x: 100, y: 100 }, false, context)).toBe("noop");
    expect(item.points).toEqual([
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);

    expect(applyDragState(drag, { x: 110, y: 105 }, false, context)).toBe("handled");
    expect(item.points).toEqual([
      { x: 110, y: 105 },
      { x: 210, y: 105 },
    ]);
    expect(drag.moved).toBe(true);
    expect(drag.last).toEqual({ x: 110, y: 105 });

    // Moving back to the press point is still a real move, not a no-op.
    expect(applyDragState(drag, { x: 100, y: 100 }, false, context)).toBe("handled");
    expect(item.points).toEqual([
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);
  });

  it("updates one vertex through snapping and leaves other points alone", () => {
    const project = makePointerProject();
    const { layer, item } = addLength(project, "vertex-line");
    store.setProject(project, null);
    const drag: DragState = {
      mode: "vertex",
      itemId: item.id,
      layerId: layer.id,
      vertexIndex: 1,
      last: { x: 100, y: 100 },
      moved: false,
      startPage: { x: 100, y: 100 },
    };
    const context = snapContext();

    expect(applyDragState(drag, { x: 240, y: 130 }, false, context)).toBe("handled");
    expect(context.snapPoint).toHaveBeenCalledWith({ x: 240, y: 130 }, item.id);
    expect(item.points).toEqual([
      { x: 100, y: 100 },
      { x: 240, y: 130 },
    ]);
    expect(drag.moved).toBe(true);
    expect(context.clearSnap).not.toHaveBeenCalled();
  });

  it("constrains a Shift-dragged line vertex to a 45-degree step", () => {
    const project = makePointerProject();
    const layer = layersForKind(project, "draw")[0];
    const item: MarkupItem = {
      id: "shift-line",
      pageId: project.pages[0].id,
      kind: "line",
      points: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      color: "#f2a93b",
      strokeWidth: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    addItem(project, layer.id, item);
    store.setProject(project, null);
    const drag: DragState = {
      mode: "vertex",
      itemId: item.id,
      layerId: layer.id,
      vertexIndex: 1,
      last: { x: 100, y: 100 },
      moved: false,
      startPage: { x: 100, y: 100 },
    };
    const context = snapContext();

    applyDragState(drag, { x: 220, y: 140 }, true, context);
    expect(item.points[0]).toEqual({ x: 100, y: 100 });
    expect(item.points[1].y).toBeCloseTo(100, 10);
    expect(item.points[1].x).toBeCloseTo(100 + Math.hypot(120, 40), 10);
    expect(context.snapPoint).not.toHaveBeenCalled();
    expect(context.clearSnap).toHaveBeenCalled();
  });

  it("ends when the dragged item is locked or missing", () => {
    const project = makePointerProject();
    const { layer, item } = addLength(project, "locked");
    item.locked = true;
    store.setProject(project, null);
    const context = snapContext();

    expect(applyDragState(moveDrag(item, layer.id), { x: 150, y: 120 }, false, context)).toBe(
      "end",
    );
    item.locked = false;
    expect(
      applyDragState(
        { ...moveDrag(item, layer.id), itemId: "gone" },
        { x: 150, y: 120 },
        false,
        context,
      ),
    ).toBe("end");
  });

  it("leaves resize, group scale and rotation to the transform module", () => {
    const project = makePointerProject();
    const { layer, item } = addLength(project, "transform");
    store.setProject(project, null);
    const context = snapContext();
    for (const mode of ["resize", "scale-selection", "rotate"] as const) {
      expect(
        applyDragState({ ...moveDrag(item, layer.id), mode }, { x: 120, y: 130 }, false, context),
      ).toBe("transform");
    }
  });
});

describe("drag through pointer dispatch", () => {
  it("starts, applies and ends a move drag as one undo step", () => {
    const project = makePointerProject();
    const { item } = addLength(project, "dispatch-move");
    const harness = makeCanvasHarness({ project });

    harness.pointer("pointerdown", { clientX: 150, clientY: 100 });
    expect(harness.controller.dragActive).toBe(true);
    expect(harness.controller.dragState?.mode).toBe("move");

    harness.pointer("pointermove", { clientX: 160, clientY: 110 });
    expect(item.points).toEqual([
      { x: 110, y: 110 },
      { x: 210, y: 110 },
    ]);
    expect(harness.controller.dragActive).toBe(true);

    harness.pointer("pointerup", { clientX: 160, clientY: 110 });
    expect(harness.controller.dragActive).toBe(false);
    expect(store.canUndo).toBe(true);
    expect(store.dirty).toBe(true);
  });

  it("starts a vertex drag on an existing selection", () => {
    const project = makePointerProject();
    const { layer, item } = addLength(project, "dispatch-vertex");
    const harness = makeCanvasHarness({ project });
    store.setSelection({ layerId: layer.id, itemId: item.id });

    harness.pointer("pointerdown", { clientX: 100, clientY: 100 });
    expect(harness.controller.dragState?.mode).toBe("vertex");
    expect(harness.controller.dragState?.vertexIndex).toBe(0);

    harness.pointer("pointermove", { clientX: 120, clientY: 140 });
    expect(item.points[0]).toEqual({ x: 120, y: 140 });
    expect(item.points[1]).toEqual({ x: 200, y: 100 });

    harness.pointer("pointerup", { clientX: 120, clientY: 140 });
    expect(harness.controller.dragActive).toBe(false);
  });

  it("does not begin a drag while the canvas is view-only", () => {
    const project = makePointerProject();
    const { layer, item } = addLength(project, "view-only");
    const harness = makeCanvasHarness({ project, viewOnly: true });

    harness.pointer("pointerdown", { clientX: 150, clientY: 100 });
    expect(harness.controller.dragActive).toBe(false);
    expect(store.ui.selection).toEqual([{ layerId: layer.id, itemId: item.id }]);
  });
});
