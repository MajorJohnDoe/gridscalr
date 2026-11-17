import { describe, expect, it } from "vitest";
import { canvasScheduleLayout, drawScheduleItem } from "../src/canvas/items/schedule";
import {
  computeSchedule,
  continuePlacement,
  createPlacement,
  defaultPlacementBox,
  deletePlacement,
  deletePlacementsForSchedule,
  deleteSchedule,
  findSchedule,
  layoutScheduleTable,
  placementBox,
  placementCount,
  placementLayer,
  scheduleTableFor,
  updatePlacement,
  type MeasureText,
  type ScheduleResult,
} from "../src/features/schedules";
import { pdfScheduleLayout } from "../src/pdf/export/items/schedule";
import { addItem, createProject, defaultDocument, layersForKind } from "../src/model/layers";
import { applyTransformState } from "../src/canvas/pointer/transform";
import { itemCenter, itemLocalBounds, midpoint } from "../src/model/geometry";
import { translateItems } from "../src/model/commands";
import { validateProject } from "../src/model/integrity";
import { hitTest } from "../src/model/hitTest";
import type { MarkupItem, Project, ScheduleDefinition } from "../src/model/types";
import { store } from "../src/state/store";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";
const SCALE = { pointsPerMeter: 100, sourceUnit: "m" as const };
const measure: MeasureText = (text, size) => text.length * size * 0.5;

function makeProject(pages = 2): Project {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", pages)));
}

function measureLayer(project: Project) {
  return layersForKind(project, "measure")[0];
}

function drawLayer(project: Project) {
  return layersForKind(project, "draw")[0];
}

function lengthItem(project: Project, index: number, page = 1): MarkupItem {
  const item: MarkupItem = {
    id: `item_${index}`,
    pageId: pageIdFor(page),
    kind: "length",
    points: [
      { x: 0, y: index * 4 },
      { x: 100, y: index * 4 },
    ],
    color: "#e30613",
    strokeWidth: 2,
    scale: { ...SCALE },
    createdAt: NOW,
    updatedAt: NOW,
    label: `Wall ${String.fromCharCode(65 + index)}`,
  };
  addItem(project, measureLayer(project).id, item);
  return item;
}

function schedule(
  project: Project,
  overrides: Partial<ScheduleDefinition> = {},
): ScheduleDefinition {
  const entry: ScheduleDefinition = {
    id: "sched_place",
    name: "Walls",
    source: "measurements",
    rowMode: "items",
    columns: [
      { id: "c1", field: "label", visible: true, width: 22 },
      { id: "c2", field: "value", visible: true, width: 14, format: "unit" },
      { id: "c3", field: "unit", visible: true, width: 8 },
    ],
    filters: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
  project.schedules.push(entry);
  return entry;
}

function placementItem(project: Project, overrides: Partial<MarkupItem> = {}): MarkupItem {
  const result = createPlacement(project, {
    scheduleId: "sched_place",
    pageId: pageIdFor(1),
    width: 400,
    height: 160,
    position: { x: 20, y: 20 },
    layerName: "Schedules",
  });
  expect(result).not.toBeNull();
  Object.assign(result!.item, overrides);
  return result!.item;
}

function resultFor(project: Project): ScheduleResult {
  return computeSchedule(project, findSchedule(project, "sched_place")!);
}

describe("schedule table layout", () => {
  it("lays out the header, rows and range overflow with an injected measure", () => {
    const project = makeProject();
    for (let index = 0; index < 30; index += 1) lengthItem(project, index);
    schedule(project);
    const layout = layoutScheduleTable({
      result: resultFor(project),
      width: 400,
      height: 200,
      rowLimit: 10,
      showHeader: true,
      measure,
    });
    expect(layout.header.map((cell) => cell.text)).toEqual(["Label", "Value", "Unit"]);
    expect(layout.visibleRows).toBe(10);
    expect(layout.totalRows).toBe(30);
    expect(layout.overflow).toBe(true);
    expect(layout.overflowReason).toBe("range");
    expect(layout.continuationRowStart).toBe(10);
    expect(layout.lines.length).toBeGreaterThan(4);
    expect(layout.cells.filter((cell) => cell.role === "row")).toHaveLength(30);
  });

  it("truncates rows at the minimum font size and flags a box overflow", () => {
    const project = makeProject();
    for (let index = 0; index < 30; index += 1) lengthItem(project, index);
    schedule(project);
    const layout = layoutScheduleTable({
      result: resultFor(project),
      width: 400,
      height: 45,
      measure,
      fontSize: 7,
    });
    expect(layout.fontSize).toBeGreaterThanOrEqual(4.5);
    expect(layout.visibleRows).toBeLessThan(30);
    expect(layout.overflow).toBe(true);
    expect(layout.overflowReason).toBe("box");
    expect(layout.continuationRowStart).not.toBeNull();
  });

  it("ellipsizes long cell text instead of overflowing the column", () => {
    const project = makeProject();
    lengthItem(project, 0).label = "A very long wall label that cannot fit in one column";
    schedule(project);
    const layout = layoutScheduleTable({
      result: resultFor(project),
      width: 120,
      height: 120,
      measure,
      showHeader: false,
    });
    const first = layout.cells[0];
    expect(first.text.endsWith("...")).toBe(true);
    expect(measure(first.text, layout.fontSize, false)).toBeLessThanOrEqual(
      layout.columns[0].width,
    );
  });

  it("renders subtotals and the grand total", () => {
    const project = makeProject();
    lengthItem(project, 0);
    lengthItem(project, 1);
    schedule(project, {
      groupBy: "category",
      totals: [{ field: "value", op: "sum" }],
    });
    const layout = layoutScheduleTable({
      result: resultFor(project),
      width: 400,
      height: 300,
      measure,
      showTotals: true,
    });
    const text = layout.cells.map((cell) => cell.text);
    expect(text).toContain("Subtotal");
    expect(text).toContain("Total");
    expect(layout.cells.some((cell) => cell.role === "subtotal")).toBe(true);
    expect(layout.cells.some((cell) => cell.role === "total")).toBe(true);
  });

  it("reports no rows for an empty schedule", () => {
    const project = makeProject();
    schedule(project);
    const layout = layoutScheduleTable({
      result: resultFor(project),
      width: 300,
      height: 120,
      measure,
    });
    expect(layout.empty).toBe(true);
    expect(layout.cells[0].text).toBe("No rows match the current filters.");
  });
});

describe("schedule placement lifecycle", () => {
  it("creates a draw layer when the active layer is a measurement layer", () => {
    const project = makeProject();
    lengthItem(project, 0);
    schedule(project);
    project.layers = project.layers.filter((layer) => layer.kind !== "draw");
    project.activeLayerId = measureLayer(project).id;
    const created = createPlacement(project, {
      scheduleId: "sched_place",
      pageId: pageIdFor(1),
      layerName: "Schedules",
    });
    expect(created).not.toBeNull();
    const layer = project.layers.find((entry) => entry.id === created!.layerId)!;
    expect(layer.kind).toBe("draw");
    expect(layer.name).toBe("Schedules");
    expect(project.activeLayerId).toBe(layer.id);
    expect(created!.item.kind).toBe("schedule");
    expect(created!.item.scheduleId).toBe("sched_place");
    expect(created!.item.showHeader).toBe(true);
  });

  it("selects an existing draw layer instead of creating another one", () => {
    const project = makeProject();
    schedule(project);
    const existing = drawLayer(project);
    project.activeLayerId = measureLayer(project).id;
    const layer = placementLayer(project, pageIdFor(1), { layerName: "Schedules" });
    expect(layer.id).toBe(existing.id);
    expect(project.layers.filter((entry) => entry.kind === "draw")).toHaveLength(1);
  });

  it("updates the row range and deletes a placement", () => {
    const project = makeProject();
    schedule(project);
    const item = placementItem(project);
    expect(updatePlacement(project, item.id, { rowStart: 5, rowLimit: 10 })).toBe(true);
    expect(item.rowStart).toBe(5);
    expect(item.rowLimit).toBe(10);
    updatePlacement(project, item.id, { rowLimit: null, showTotals: true });
    expect(item.rowLimit).toBeUndefined();
    expect(item.showTotals).toBe(true);
    expect(placementCount(project, "sched_place")).toBe(1);
    expect(deletePlacement(project, item.id)).toBe(true);
    expect(placementCount(project, "sched_place")).toBe(0);
  });

  it("defaults the box to a sensible position on the page", () => {
    const project = makeProject();
    const box = defaultPlacementBox(project, {
      pageId: pageIdFor(1),
      pageSize: { width: 842, height: 595 },
    });
    expect(box.origin).toEqual({ x: 24, y: 24 });
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeGreaterThan(40);
  });

  it("continues a range on a new table below the source", () => {
    const project = makeProject();
    schedule(project);
    const item = placementItem(project);
    const source = placementBox(item);
    const next = continuePlacement(project, item.id, 12, { layerName: "Schedules" });
    expect(next).not.toBeNull();
    expect(next!.item.scheduleId).toBe(item.scheduleId);
    expect(next!.item.rowStart).toBe(12);
    expect(placementBox(next!.item).origin.y).toBeGreaterThan(source.origin.y + source.height);
  });

  it("cascades placements when a schedule is deleted, in one undo step", () => {
    const project = makeProject();
    schedule(project);
    placementItem(project);
    placementItem(project);
    store.setProject(project, null);
    expect(placementCount(store.project!, "sched_place")).toBe(2);
    store.mutate((current) => {
      deletePlacementsForSchedule(current, "sched_place");
      deleteSchedule(current, "sched_place");
    }, "change");
    expect(store.project!.schedules).toHaveLength(0);
    expect(placementCount(store.project!, "sched_place")).toBe(0);
    store.undo();
    expect(store.project!.schedules).toHaveLength(1);
    expect(placementCount(store.project!, "sched_place")).toBe(2);
  });
});

function renderContext(project: Project) {
  const texts: Array<{ text: string; x: number; y: number }> = [];
  let strokes = 0;
  const ctx = {
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    textAlign: "left",
    textBaseline: "alphabetic",
    globalAlpha: 1,
    save() {},
    restore() {},
    setLineDash() {},
    beginPath() {},
    rect() {},
    clip() {},
    moveTo() {},
    lineTo() {},
    stroke() {
      strokes += 1;
    },
    strokeRect() {
      strokes += 1;
    },
    fillRect() {},
    measureText: (text: string) => ({ width: text.length * 4 }),
    fillText: (text: string, x: number, y: number) => texts.push({ text, x, y }),
  } as unknown as CanvasRenderingContext2D;
  const state = {
    context: {
      zoom: 1,
      project,
      toScreen: (point: { x: number; y: number }) => point,
      imageElement: () => null,
      screenLabelBox: (box: unknown) => box,
      editors: { editingItemId: null, editingLabelId: null, textSession: null },
    },
    zoom: 1,
    points: [],
    lineWidth: 1,
    color: "#1a2024",
    drawPanel: () => undefined,
  } as unknown as Parameters<typeof drawScheduleItem>[2];
  return { ctx, state, texts, strokes: () => strokes };
}

describe("canvas renderer", () => {
  it("draws the table header, rows and grid lines", () => {
    const project = makeProject();
    lengthItem(project, 0);
    schedule(project);
    store.setProject(project, null);
    const item = placementItem(project);
    const { ctx, state, texts, strokes } = renderContext(project);
    state.points = item.points;
    drawScheduleItem(ctx, item, state);
    expect(texts.some((cell) => cell.text === "Label")).toBe(true);
    expect(texts.some((cell) => cell.text === "Wall A")).toBe(true);
    expect(strokes()).toBeGreaterThan(6);
  });

  it("draws a placeholder for a missing takeoff table", () => {
    const project = makeProject();
    schedule(project);
    store.setProject(project, null);
    const item = placementItem(project, { scheduleId: "sched_missing" });
    const { ctx, state, texts } = renderContext(project);
    state.points = item.points;
    drawScheduleItem(ctx, item, state);
    expect(texts.some((cell) => cell.text.includes("missing takeoff table"))).toBe(true);
  });
});

describe("canvas move, resize and rotation", () => {
  it("moves a placement like any drawing item", () => {
    const project = makeProject();
    schedule(project);
    const item = placementItem(project);
    const before = item.points[0];
    const result = translateItems(
      project,
      [{ layerId: drawLayer(project).id, itemId: item.id }],
      15,
      25,
    );
    expect(result.changed).toBe(1);
    expect(item.points[0]).toEqual({ x: before.x + 15, y: before.y + 25 });
  });

  it("corner-resizes a placement and keeps its rotation", () => {
    const project = makeProject();
    schedule(project);
    const item = placementItem(project);
    item.rotation = 30;
    store.setProject(project, null);
    const bounds = itemLocalBounds(item);
    const center = midpoint(bounds.min, bounds.max);
    const startPoints = item.points.map((point) => ({ ...point }));
    applyTransformState(
      {
        mode: "resize",
        itemId: item.id,
        layerId: drawLayer(project).id,
        vertexIndex: -1,
        last: { x: 0, y: 0 },
        moved: false,
        handle: "se",
        startPage: { x: 0, y: 0 },
        startPoints,
        startFontSize: 12,
        startRotation: 30,
        startBounds: { min: { ...bounds.min }, max: { ...bounds.max } },
        center,
      },
      { x: bounds.max.x + 40, y: bounds.max.y + 20 },
      false,
    );
    const resized = itemLocalBounds(store.project!.layers.flatMap((layer) => layer.items)[0]);
    expect(resized.max.x - resized.min.x).toBeGreaterThan(bounds.max.x - bounds.min.x);
    expect(item.rotation).toBe(30);
    // The corner resize keeps the table as a two-point box.
    expect(item.points).toHaveLength(2);
  });

  it("rotates a placement in place and refuses a locked one", () => {
    const project = makeProject();
    schedule(project);
    const item = placementItem(project);
    store.setProject(project, null);
    const center = itemCenter(item);
    applyTransformState(
      {
        mode: "rotate",
        itemId: item.id,
        layerId: drawLayer(project).id,
        vertexIndex: -1,
        last: center,
        moved: false,
        startPoints: item.points.map((point) => ({ ...point })),
        startRotation: 0,
        center,
        startAngle: 0,
      },
      { x: center.x, y: center.y + 10 },
      false,
    );
    expect(item.rotation).toBe(90);

    item.locked = true;
    const points = item.points.map((point) => ({ ...point }));
    const outcome = applyTransformState(
      {
        mode: "rotate",
        itemId: item.id,
        layerId: drawLayer(project).id,
        vertexIndex: -1,
        last: center,
        moved: false,
        startPoints: points,
        startRotation: 90,
        center,
        startAngle: 0,
      },
      { x: center.x, y: center.y + 10 },
      false,
    );
    expect(outcome).toBe("end");
    expect(item.points).toEqual(points);
  });
});

describe("page lifecycle and schedule placements", () => {
  it("removes placements with their page", () => {
    const project = makeProject(2);
    schedule(project);
    const item = placementItem(project);
    store.setProject(project, null);
    const summary = store.deletePage(pageIdFor(1));
    expect(summary?.removedItems).toBe(1);
    const remaining = store.project!.layers.flatMap((layer) => layer.items);
    expect(remaining.some((entry) => entry.id === item.id)).toBe(false);
  });

  it("duplicates a placement with the same schedule id", () => {
    const project = makeProject(2);
    schedule(project);
    const item = placementItem(project);
    store.setProject(project, null);
    store.duplicatePage(pageIdFor(1), {
      copyMarkups: true,
      copyScale: true,
      copyName: false,
      name: "",
    });
    const copies = store
      .project!.layers.flatMap((layer) => layer.items)
      .filter((entry) => entry.kind === "schedule");
    expect(copies).toHaveLength(2);
    expect(copies.some((entry) => entry.id !== item.id && entry.scheduleId === "sched_place")).toBe(
      true,
    );
  });
});

describe("visibility, locking and missing takeoff tables", () => {
  it("hit-tests a table inside its box and ignores hidden and locked items", () => {
    const project = makeProject();
    schedule(project);
    const item = placementItem(project);
    const inside = { x: 40, y: 40 };
    expect(hitTest(project, pageIdFor(1), inside, 4)?.item.id).toBe(item.id);
    item.visible = false;
    expect(hitTest(project, pageIdFor(1), inside, 4)).toBeNull();
    item.visible = true;
    item.locked = true;
    expect(hitTest(project, pageIdFor(1), inside, 4)).toBeNull();
    expect(hitTest(project, pageIdFor(1), inside, 4, { includeLocked: true })?.item.id).toBe(
      item.id,
    );
    item.locked = false;
    drawLayer(project).locked = true;
    expect(hitTest(project, pageIdFor(1), inside, 4)).toBeNull();
    expect(hitTest(project, pageIdFor(1), inside, 4, { includeLocked: true })?.item.id).toBe(
      item.id,
    );
  });

  it("renders a missing takeoff table as a placeholder and reports it to the doctor", () => {
    const project = makeProject();
    schedule(project);
    const item = placementItem(project);
    item.scheduleId = "sched_missing";
    expect(scheduleTableFor(project, item, measure)).toBeNull();
    const issues = validateProject(project);
    expect(
      issues.some(
        (issue) => issue.code === "missingSchedulePlacement" && issue.entity?.id === item.id,
      ),
    ).toBe(true);
  });
});

describe("canvas and PDF parity", () => {
  it("consumes the same layout for the same input", () => {
    const project = makeProject();
    for (let index = 0; index < 8; index += 1) lengthItem(project, index);
    schedule(project, { totals: [{ field: "value", op: "sum" }] });
    const item = placementItem(project);
    const result = resultFor(project);
    const canvas = canvasScheduleLayout(result, item, measure);
    const pdf = pdfScheduleLayout(result, item, measure);
    expect(canvas).toEqual(pdf);
    expect(canvas.header.length).toBeGreaterThan(0);
    expect(canvas.cells.length).toBeGreaterThan(0);
  });
});
