import { describe, expect, it } from "vitest";
import { createProject, defaultDocument } from "../src/model/layers";
import { itemSelectionBounds, symbolSelectionBounds } from "../src/model/geometry";
import { hitTest } from "../src/model/hitTest";
import { scaleSelection, selectionBounds } from "../src/model/transform";
import type { MarkupItem, Project } from "../src/model/types";

const now = "2026-11-05T00:00:00.000Z";

function item(overrides: Partial<MarkupItem>): MarkupItem {
  return {
    id: "item",
    page: 1,
    kind: "line",
    points: [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ],
    color: "#111111",
    strokeWidth: 2,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function withItems(items: MarkupItem[]): { project: Project; layerId: string } {
  const project = createProject(defaultDocument("Plan.pdf", 1));
  const draw = project.layers.find((layer) => layer.kind === "draw")!;
  draw.items.push(...items);
  return { project, layerId: draw.id };
}

describe("selection scaling", () => {
  it("scales geometry and text sizes without changing stroke width", () => {
    const symbol = item({
      id: "symbol",
      kind: "symbol",
      points: [{ x: 100, y: 100 }],
      symbolId: "schematic.expansion-vessel",
      symbolSize: 40,
      tag: "EK-01",
      tagOffset: { x: 20, y: -20 },
      fontSize: 12,
    });
    const line = item({ id: "line" });
    const { project, layerId } = withItems([symbol, line]);
    const count = scaleSelection(
      project,
      [
        { layerId, itemId: "symbol" },
        { layerId, itemId: "line" },
      ],
      2,
      { x: 0, y: 0 },
    );

    expect(count).toBe(2);
    expect(symbol.points[0]).toEqual({ x: 200, y: 200 });
    expect(symbol.symbolSize).toBe(80);
    expect(symbol.tagOffset).toEqual({ x: 40, y: -40 });
    expect(symbol.fontSize).toBe(24);
    expect(symbol.strokeWidth).toBe(2);
    expect(line.points[1]).toEqual({ x: 100, y: 0 });
    expect(line.strokeWidth).toBe(2);
  });

  it("skips locked items", () => {
    const locked = item({ id: "locked", locked: true });
    const free = item({ id: "free" });
    const { project, layerId } = withItems([locked, free]);
    const count = scaleSelection(
      project,
      [
        { layerId, itemId: "locked" },
        { layerId, itemId: "free" },
      ],
      0.5,
      { x: 0, y: 0 },
    );
    expect(count).toBe(1);
    expect(locked.points[1]).toEqual({ x: 50, y: 0 });
    expect(free.points[1]).toEqual({ x: 25, y: 0 });
  });

  it("hit-tests schematic symbols against their strokes, not their hollow interior", () => {
    const symbol = item({
      id: "symbol",
      kind: "symbol",
      points: [{ x: 100, y: 100 }],
      symbolId: "schematic.heat-exchanger",
      symbolSize: 40,
    });
    const { project } = withItems([symbol]);
    expect(hitTest(project, 1, { x: 100, y: 87.5 }, 2)).toBeNull();
    expect(hitTest(project, 1, { x: 100, y: 85 }, 2)?.item.id).toBe("symbol");
  });

  it("returns the union of the visible selection bounds", () => {
    const first = item({
      id: "first",
      kind: "symbol",
      points: [{ x: 100, y: 100 }],
      symbolId: "schematic.heat-exchanger",
      symbolSize: 40,
    });
    const second = item({
      id: "second",
      kind: "symbol",
      points: [{ x: 200, y: 100 }],
      symbolId: "schematic.heat-exchanger",
      symbolSize: 40,
    });
    const { project, layerId } = withItems([first, second]);
    const bounds = selectionBounds(project, [
      { layerId, itemId: "first" },
      { layerId, itemId: "second" },
    ]);
    expect(bounds).not.toBeNull();
    expect(bounds!.min.x).toBeCloseTo(symbolSelectionBounds(first).min.x, 5);
    expect(bounds!.max.x).toBeCloseTo(symbolSelectionBounds(second).max.x, 5);
    expect(itemSelectionBounds(first).max.x).toBeLessThan(first.points[0].x + 20);
  });
});
