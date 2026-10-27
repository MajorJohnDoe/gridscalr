import { describe, expect, it } from "vitest";
import { SYMBOL_SIZE } from "../src/model/symbols";
import {
  clampPointToPage,
  constrainSquare,
  cursorForRole,
  dedupeLast,
  focusViewTransform,
  handleLocalPoint,
  hexAlpha,
  movePageRect,
  oppositeHandlePoint,
  pointInRect,
  rectFromPoints,
  resizePageRect,
  rotatedAabb,
  snapLabel,
} from "../src/canvas/geometry";

describe("canvas geometry", () => {
  it("clamps points to the page and tests crop rectangles", () => {
    expect(clampPointToPage({ x: -5, y: 700 }, { width: 600, height: 800 })).toEqual({
      x: 0,
      y: 700,
    });
    const rect = rectFromPoints({ x: 40, y: 50 }, { x: 10, y: 20 });
    expect(rect).toEqual({ x: 10, y: 20, width: 30, height: 30 });
    expect(pointInRect({ x: 20, y: 30 }, rect)).toBe(true);
    expect(pointInRect({ x: 0, y: 0 }, rect)).toBe(false);
  });

  it("moves and resizes a crop rectangle within the page", () => {
    const rect = { x: 10, y: 10, width: 100, height: 50 };
    expect(
      movePageRect(rect, { x: 0, y: 0 }, { x: -50, y: 500 }, { width: 200, height: 100 }),
    ).toEqual({
      x: 0,
      y: 50,
      width: 100,
      height: 50,
    });
    expect(resizePageRect(rect, "se", { x: 300, y: 300 }, { width: 200, height: 100 })).toEqual({
      x: 10,
      y: 10,
      width: 190,
      height: 90,
    });
    expect(resizePageRect(rect, "nw", { x: 0, y: 0 }, { width: 200, height: 100 })).toEqual({
      x: 0,
      y: 0,
      width: 110,
      height: 60,
    });
  });

  it("constrains quick areas to a square", () => {
    expect(constrainSquare({ x: 10, y: 10 }, { x: 40, y: 20 })).toEqual({ x: 40, y: 40 });
    expect(constrainSquare({ x: 10, y: 10 }, { x: -20, y: 10 })).toEqual({ x: -20, y: 40 });
  });

  it("maps selection handles to cursors and local points", () => {
    const bounds = { min: { x: 0, y: 0 }, max: { x: 100, y: 50 } };
    expect(handleLocalPoint(bounds, "nw")).toEqual({ x: 0, y: 0 });
    expect(handleLocalPoint(bounds, "e")).toEqual({ x: 100, y: 25 });
    expect(oppositeHandlePoint(bounds, "nw")).toEqual({ x: 100, y: 50 });
    expect(cursorForRole("se")).toBe("nwse-resize");
    expect(cursorForRole("ne")).toBe("nesw-resize");
    expect(cursorForRole("n")).toBe("ns-resize");
    expect(cursorForRole("w")).toBe("ew-resize");
  });

  it("computes rotated bounds and display labels", () => {
    expect(rotatedAabb(0, 0, 100, 50, 0)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 50,
    });
    expect(Math.round(rotatedAabb(0, 0, 100, 50, 90).maxY)).toBe(75);
    expect(snapLabel("endpoint")).toBe("Endpoint");
    expect(snapLabel("midpoint")).toBe("Midpoint");
    expect(snapLabel("intersection")).toBe("Intersection");
  });

  it("focuses small markups without zooming out past fit page", () => {
    const viewport = { width: 1000, height: 1000 };
    const page = { width: 1000, height: 1000 };
    const centered = focusViewTransform(
      { min: { x: 450, y: 450 }, max: { x: 550, y: 550 } },
      page,
      viewport,
    );
    expect(centered.zoom).toBeCloseTo(916 / 125, 5);
    expect(centered.panX).toBeCloseTo(500 - 500 * centered.zoom, 5);
    expect(centered.panY).toBeCloseTo(500 - 500 * centered.zoom, 5);

    const tiny = focusViewTransform(
      { min: { x: 499, y: 499 }, max: { x: 500, y: 500 } },
      page,
      viewport,
    );
    expect(tiny.zoom).toBe(8);

    const oversized = focusViewTransform(
      { min: { x: -500, y: -500 }, max: { x: 1500, y: 1500 } },
      page,
      viewport,
    );
    expect(oversized.zoom).toBeCloseTo(916 / 1000, 5);
    expect(oversized.panX).toBeCloseTo(42, 5);
    expect(oversized.panY).toBeCloseTo(42, 5);
  });

  it("handles colour alpha and duplicate draft points", () => {
    expect(hexAlpha("#35c2a1", 0.5)).toBe("rgba(53,194,161,0.5)");
    expect(hexAlpha("zzzzzz", 0.2)).toBe("rgba(255,255,255,0.2)");
    expect(
      dedupeLast([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toHaveLength(2);
  });
});

describe("selection handles", () => {
  it("returns vertex and rotation handles for lines", async () => {
    const { selectionHandles } = await import("../src/canvas/selectionHandles");
    const item = {
      id: "line",
      page: 1,
      kind: "line" as const,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      color: "#000",
      strokeWidth: 1,
      createdAt: "",
      updatedAt: "",
    };
    const handles = selectionHandles(item, (point) => point);
    expect(handles.map((handle) => handle.role)).toEqual(["vertex", "vertex", "rotate"]);
  });

  it("returns corners and a rotation handle for text", async () => {
    const { selectionHandles } = await import("../src/canvas/selectionHandles");
    const item = {
      id: "text",
      page: 1,
      kind: "text" as const,
      points: [{ x: 10, y: 20 }],
      text: "Note",
      color: "#000",
      strokeWidth: 1,
      fontSize: 12,
      createdAt: "",
      updatedAt: "",
    };
    const handles = selectionHandles(item, (point) => point);
    expect(handles.filter((handle) => handle.role !== "rotate")).toHaveLength(4);
    expect(handles.some((handle) => handle.role === "rotate")).toBe(true);
  });

  it("gives symbols a fixed paper-space box and a rotation handle", async () => {
    const [{ itemBounds }, { selectionHandles }] = await Promise.all([
      import("../src/model/geometry"),
      import("../src/canvas/selectionHandles"),
    ]);
    const item = {
      id: "symbol",
      page: 1,
      kind: "symbol" as const,
      symbolId: "fire.extinguisher",
      points: [{ x: 100, y: 100 }],
      color: "#e5484d",
      strokeWidth: 1,
      rotation: 45,
      createdAt: "",
      updatedAt: "",
    };
    const bounds = itemBounds({ ...item, rotation: 0 });
    const half = SYMBOL_SIZE / 2;
    expect(bounds.min.x).toBeCloseTo(100 - half);
    expect(bounds.min.y).toBeCloseTo(100 - half);
    expect(bounds.max.x).toBeCloseTo(100 + half);
    expect(bounds.max.y).toBeCloseTo(100 + half);
    expect(selectionHandles(item, (point) => point).map((handle) => handle.role)).toEqual([
      "rotate",
    ]);
  });

  it("does not expose handles for counts", async () => {
    const { selectionHandles } = await import("../src/canvas/selectionHandles");
    const item = {
      id: "count",
      page: 1,
      kind: "count" as const,
      points: [{ x: 10, y: 20 }],
      color: "#000",
      strokeWidth: 1,
      createdAt: "",
      updatedAt: "",
    };
    expect(selectionHandles(item, (point) => point)).toEqual([]);
  });
});
