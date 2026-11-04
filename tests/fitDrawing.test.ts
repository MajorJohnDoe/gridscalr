import { describe, expect, it } from "vitest";
import { createDefaultLayers, createProject } from "../src/model/layers";
import { createTemplateDocument } from "../src/features/schematics/model/sheetDocument";
import {
  drawingAreaForPage,
  drawingOverflowsArea,
  fitDrawingToArea,
} from "../src/features/schematics/model/fitDrawing";
import { itemBounds } from "../src/model/geometry";
import type { MarkupItem } from "../src/model/types";

const now = "2026-11-04T00:00:00.000Z";

function lineItem(id: string, points: { x: number; y: number }[]): MarkupItem {
  return {
    id,
    page: 1,
    kind: "polyline",
    points,
    color: "#e30613",
    strokeWidth: 2,
    createdAt: now,
    updatedAt: now,
  };
}

function sampleProject() {
  const documentRef = createTemplateDocument("gridscalr.operation-card.frame", "A3", "Sheet");
  return createProject(documentRef, createDefaultLayers());
}

describe("drawing area fitting", () => {
  it("reports a drawing area for template sheets and nothing for plain pages", () => {
    const project = sampleProject();
    expect(drawingAreaForPage(project, 1)).not.toBeNull();
    const plain = createProject(
      {
        id: "doc_plain",
        kind: "pdf",
        name: "Plan.pdf",
        path: "/tmp/Plan.pdf",
        relativePath: null,
        sha256: "",
        pageCount: 1,
        sizeBytes: 0,
      },
      createDefaultLayers(),
    );
    expect(drawingAreaForPage(plain, 1)).toBeNull();
  });

  it("scales and centres overflowing visible items as one change", () => {
    const project = sampleProject();
    const area = drawingAreaForPage(project, 1)!;
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    const item = lineItem("item_outside", [
      { x: -200, y: -120 },
      { x: area.width + 500, y: area.height + 400 },
    ]);
    draw.items.push(item);

    expect(drawingOverflowsArea(project, 1)).toBe(true);
    expect(fitDrawingToArea(project, 1)).toBe(true);
    const bounds = itemBounds(item);
    expect(bounds.min.x).toBeGreaterThanOrEqual(area.x - 0.6);
    expect(bounds.min.y).toBeGreaterThanOrEqual(area.y - 0.6);
    expect(bounds.max.x).toBeLessThanOrEqual(area.x + area.width + 0.6);
    expect(bounds.max.y).toBeLessThanOrEqual(area.y + area.height + 0.6);
    expect(drawingOverflowsArea(project, 1)).toBe(false);
  });

  it("does not move items on a locked layer", () => {
    const project = sampleProject();
    const area = drawingAreaForPage(project, 1)!;
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    const locked = lineItem("item_locked", [
      { x: -100, y: -100 },
      { x: area.width + 300, y: area.height + 300 },
    ]);
    const free = lineItem("item_free", [
      { x: area.x + 20, y: area.y + 20 },
      { x: area.x + area.width + 200, y: area.y + area.height + 100 },
    ]);
    draw.items.push(locked, free);
    draw.locked = true;

    expect(fitDrawingToArea(project, 1)).toBe(false);
    expect(locked.points[0]).toEqual({ x: -100, y: -100 });
    expect(free.points[0]).toEqual({ x: area.x + 20, y: area.y + 20 });
  });

  it("leaves a drawing that already fits untouched", () => {
    const project = sampleProject();
    const area = drawingAreaForPage(project, 1)!;
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    const item = lineItem("item_inside", [
      { x: area.x + 10, y: area.y + 10 },
      { x: area.x + 60, y: area.y + 60 },
    ]);
    draw.items.push(item);
    expect(drawingOverflowsArea(project, 1)).toBe(false);
    expect(fitDrawingToArea(project, 1)).toBe(false);
    expect(item.points[0]).toEqual({ x: area.x + 10, y: area.y + 10 });
  });

  it("scales symbol and font sizes with the geometry", () => {
    const project = sampleProject();
    const area = drawingAreaForPage(project, 1)!;
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    const symbol: MarkupItem = {
      id: "item_symbol",
      page: 1,
      kind: "symbol",
      points: [{ x: -200, y: -200 }],
      color: "#2d7dd2",
      strokeWidth: 1,
      symbolId: "schematic.fan",
      symbolSize: 40,
      createdAt: now,
      updatedAt: now,
    };
    const text: MarkupItem = {
      id: "item_text",
      page: 1,
      kind: "text",
      points: [{ x: area.width + 400, y: area.height + 300 }],
      color: "#1a2024",
      strokeWidth: 1,
      text: "Note",
      fontSize: 12,
      createdAt: now,
      updatedAt: now,
    };
    draw.items.push(symbol, text);
    expect(fitDrawingToArea(project, 1)).toBe(true);
    expect(symbol.symbolSize).toBeLessThan(40);
    expect(text.fontSize).toBeLessThan(12);
  });
});
