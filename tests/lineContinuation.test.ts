// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, defaultDocument } from "../src/model/layers";
import { buildLayerHierarchy } from "../src/model/layerHierarchy";
import type { Layer, MarkupItem, Point, Project } from "../src/model/types";
import { store } from "../src/state/store";
import type { PanelActions } from "../src/ui/panels";
import { showSelectionMenuAt } from "../src/ui/selectionMenu";
import {
  appendContinuedPolyline,
  canContinuePolyline,
  mergeContinuedPoints,
  nearestContinuableEndpoint,
} from "../src/features/lineContinuation";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const FIRST: Point = { x: 50, y: 80 };
const MIDDLE: Point = { x: 90, y: 120 };
const LAST: Point = { x: 50, y: 160 };

function markup(id: string, kind: MarkupItem["kind"], points: Point[]): MarkupItem {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    pageId: pageIdFor(1),
    kind,
    points: points.map((point) => ({ ...point })),
    color: "#123456",
    strokeWidth: 1.5,
    createdAt: now,
    updatedAt: now,
  };
}

function makeProject(): { project: Project; layer: Layer; line: MarkupItem } {
  const project = withTestPageIds(createProject(defaultDocument("Schematic.pdf", 1)));
  const layer = project.layers.find((entry) => entry.kind === "draw");
  if (!layer) throw new Error("Expected a draw layer.");
  const line = markup("wire", "polyline", [FIRST, MIDDLE, LAST]);
  layer.items.push(line);
  return { project, layer, line };
}

function labels(): string[] {
  return [...document.querySelectorAll(".popover button")].map(
    (node) => node.textContent?.trim() ?? "",
  );
}

function menuActions(continuePolyline: ReturnType<typeof vi.fn>): PanelActions {
  return { continuePolyline } as unknown as PanelActions;
}

describe("nearestContinuableEndpoint", () => {
  it("finds the first and last vertex and ignores the middle one", () => {
    const { line } = makeProject();
    expect(nearestContinuableEndpoint(line, { x: 51, y: 81 })).toEqual({
      index: 0,
      point: FIRST,
    });
    expect(nearestContinuableEndpoint(line, { x: 49, y: 161 })).toEqual({
      index: 2,
      point: LAST,
    });
    expect(nearestContinuableEndpoint(line, MIDDLE)).toBeNull();
  });

  it("rejects a click outside the tolerance", () => {
    const { line } = makeProject();
    expect(nearestContinuableEndpoint(line, { x: 50, y: 100 })).toBeNull();
    expect(nearestContinuableEndpoint(line, { x: 20, y: 80 })).toBeNull();
  });

  it("scales the tolerance with the zoom", () => {
    const { line } = makeProject();
    const click = { x: 56, y: 80 };
    expect(nearestContinuableEndpoint(line, click, 12, 1)).not.toBeNull();
    expect(nearestContinuableEndpoint(line, click, 12, 4)).toBeNull();
    expect(nearestContinuableEndpoint(line, { x: 62, y: 80 }, 12, 0.5)).not.toBeNull();
  });

  it("rejects single-point polylines and other kinds", () => {
    const single = markup("single", "polyline", [FIRST]);
    const kind = markup("kind", "line", [FIRST, LAST]);
    expect(nearestContinuableEndpoint(single, FIRST)).toBeNull();
    expect(nearestContinuableEndpoint(kind, LAST)).toBeNull();
  });
});

describe("canContinuePolyline", () => {
  it("accepts a visible, unlocked polyline on a draw layer", () => {
    const { layer, line } = makeProject();
    expect(canContinuePolyline(line, layer)).toBe(true);
  });

  it("rejects hidden and locked layers and items", () => {
    const { layer, line } = makeProject();
    const hiddenLayer = { ...layer, visible: false };
    const lockedLayer = { ...layer, locked: true };
    expect(canContinuePolyline(line, hiddenLayer)).toBe(false);
    expect(canContinuePolyline(line, lockedLayer)).toBe(false);
    expect(canContinuePolyline({ ...line, visible: false }, layer)).toBe(false);
    expect(canContinuePolyline({ ...line, locked: true }, layer)).toBe(false);
  });

  it("applies layer hierarchy locks and rejects a measure layer", () => {
    const { project, layer, line } = makeProject();
    const parent: Layer = {
      ...layer,
      id: "parent",
      name: "Parent",
      parentId: undefined,
      items: [],
      locked: true,
    };
    project.layers.push(parent);
    layer.parentId = parent.id;
    const hierarchy = buildLayerHierarchy(project.layers);
    expect(canContinuePolyline(line, layer, hierarchy)).toBe(false);
    expect(canContinuePolyline(line, { ...layer, kind: "measure" }, hierarchy)).toBe(false);
  });

  it("rejects non-polyline items", () => {
    const { layer } = makeProject();
    const kind = markup("kind", "line", [FIRST, LAST]);
    expect(canContinuePolyline(kind, layer)).toBe(false);
  });
});

describe("mergeContinuedPoints", () => {
  it("appends the tail after the last vertex with one shared joint", () => {
    const existing = [FIRST, LAST];
    const merged = mergeContinuedPoints(existing, [LAST, { x: 90, y: 160 }, { x: 90, y: 200 }], 1);
    expect(merged).toEqual([FIRST, LAST, { x: 90, y: 160 }, { x: 90, y: 200 }]);
  });

  it("prepends the reversed tail at the first vertex without a stray closing segment", () => {
    const existing = [FIRST, LAST];
    const merged = mergeContinuedPoints(existing, [FIRST, { x: 20, y: 80 }, { x: 20, y: 40 }], 0);
    expect(merged).toEqual([{ x: 20, y: 40 }, { x: 20, y: 80 }, FIRST, LAST]);
    // The old last vertex stays last: no segment is added back to the old first.
    expect(merged?.[merged.length - 1]).toEqual(LAST);
  });

  it("removes duplicate consecutive points including a repeated joint", () => {
    const existing = [FIRST, LAST];
    const merged = mergeContinuedPoints(
      existing,
      [LAST, LAST, { x: 90, y: 160 }, { x: 90, y: 160 }],
      1,
    );
    expect(merged).toEqual([FIRST, LAST, { x: 90, y: 160 }]);
  });

  it("returns null when there is no actual new point", () => {
    const existing = [FIRST, LAST];
    expect(mergeContinuedPoints(existing, [LAST], 1)).toBeNull();
    expect(mergeContinuedPoints(existing, [LAST, LAST], 1)).toBeNull();
    expect(mergeContinuedPoints(existing, [FIRST, FIRST], 0)).toBeNull();
  });

  it("rejects a middle vertex and a too-short polyline", () => {
    const existing = [FIRST, MIDDLE, LAST];
    expect(mergeContinuedPoints(existing, [MIDDLE, { x: 120, y: 120 }], 1)).toBeNull();
    expect(mergeContinuedPoints([FIRST], [FIRST, LAST], 0)).toBeNull();
  });
});

describe("appendContinuedPolyline", () => {
  beforeEach(() => {
    const { project } = makeProject();
    store.setProject(project, null);
    const layer = project.layers.find((entry) => entry.kind === "draw");
    if (!layer) throw new Error("Expected a draw layer.");
    store.setSelection({ layerId: layer.id, itemId: "wire" });
  });

  afterEach(() => {
    store.project = null;
    store.readOnly = false;
  });

  it("appends to one item as a single undo step", () => {
    const project = store.project;
    if (!project) throw new Error("Expected a project.");
    const layer = project.layers.find((entry) => entry.kind === "draw");
    if (!layer) throw new Error("Expected a draw layer.");

    const changed = appendContinuedPolyline({ layerId: layer.id, itemId: "wire", vertexIndex: 2 }, [
      LAST,
      { x: 50, y: 200 },
    ]);
    expect(changed).toBe(true);

    const live = store.project?.layers.find((entry) => entry.id === layer.id);
    expect(live?.items).toHaveLength(1);
    expect(live?.items[0].points).toEqual([FIRST, MIDDLE, LAST, { x: 50, y: 200 }]);

    store.undo();
    const restored = store.project?.layers.find((entry) => entry.id === layer.id);
    expect(restored?.items[0].points).toEqual([FIRST, MIDDLE, LAST]);
    expect(store.canUndo).toBe(false);
  });

  it("does not mutate when the draft has no new point", () => {
    const project = store.project;
    if (!project) throw new Error("Expected a project.");
    const layer = project.layers.find((entry) => entry.kind === "draw");
    if (!layer) throw new Error("Expected a draw layer.");
    const changed = appendContinuedPolyline({ layerId: layer.id, itemId: "wire", vertexIndex: 2 }, [
      LAST,
    ]);
    expect(changed).toBe(false);
    expect(store.canUndo).toBe(false);
  });
});

describe("Continue line menu action", () => {
  beforeEach(() => {
    const { project } = makeProject();
    store.setProject(project, null);
    const layer = project.layers.find((entry) => entry.kind === "draw");
    if (!layer) throw new Error("Expected a draw layer.");
    store.setSelection({ layerId: layer.id, itemId: "wire" });
  });

  afterEach(() => {
    store.project = null;
    store.readOnly = false;
    document.body.replaceChildren();
  });

  it("is present at the first and last vertex and passes the vertex index", () => {
    const action = vi.fn();
    showSelectionMenuAt(10, 10, menuActions(action), { x: 50, y: 81 });
    expect(labels()).toContain("Continue line here");
    const button = [...document.querySelectorAll(".popover button")].find(
      (node) => node.textContent?.trim() === "Continue line here",
    ) as HTMLButtonElement | undefined;
    button?.click();
    const project = store.project;
    const layer = project?.layers.find((entry) => entry.kind === "draw");
    expect(action).toHaveBeenCalledWith(layer?.id, "wire", 0);

    document.body.replaceChildren();
    showSelectionMenuAt(10, 10, menuActions(action), { x: 50, y: 159 });
    expect(labels()).toContain("Continue line here");
  });

  it("is absent without a page point, at a middle vertex and away from the ends", () => {
    showSelectionMenuAt(10, 10, menuActions(vi.fn()));
    expect(labels()).not.toContain("Continue line here");
    document.body.replaceChildren();
    showSelectionMenuAt(10, 10, menuActions(vi.fn()), MIDDLE);
    expect(labels()).not.toContain("Continue line here");
    document.body.replaceChildren();
    showSelectionMenuAt(10, 10, menuActions(vi.fn()), { x: 500, y: 500 });
    expect(labels()).not.toContain("Continue line here");
  });

  it("is absent for hidden or locked layers and items and for a view-only session", () => {
    const project = store.project;
    const layer = project?.layers.find((entry) => entry.kind === "draw");
    if (!project || !layer) throw new Error("Expected a draw layer.");
    const absent = () => {
      document.body.replaceChildren();
      showSelectionMenuAt(10, 10, menuActions(vi.fn()), { x: 50, y: 81 });
      expect(labels()).not.toContain("Continue line here");
    };

    layer.visible = false;
    absent();
    layer.visible = true;
    layer.locked = true;
    absent();
    layer.locked = false;
    layer.items[0].visible = false;
    absent();
    layer.items[0].visible = true;
    layer.items[0].locked = true;
    absent();
    layer.items[0].locked = false;
    store.setReadOnly(true);
    absent();
  });

  it("is absent for a measure layer, a non-polyline and a hidden item selection", () => {
    const project = store.project;
    const layer = project?.layers.find((entry) => entry.kind === "draw");
    if (!project || !layer) throw new Error("Expected a draw layer.");
    layer.kind = "measure";
    document.body.replaceChildren();
    showSelectionMenuAt(10, 10, menuActions(vi.fn()), { x: 50, y: 81 });
    expect(labels()).not.toContain("Continue line here");

    layer.kind = "draw";
    layer.items[0].kind = "line";
    document.body.replaceChildren();
    showSelectionMenuAt(10, 10, menuActions(vi.fn()), { x: 50, y: 81 });
    expect(labels()).not.toContain("Continue line here");
  });
});
