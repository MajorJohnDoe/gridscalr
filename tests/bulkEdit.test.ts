import { describe, expect, it } from "vitest";
import { applyMeasurementBulkEdit } from "../src/model/bulkEdit";
import {
  addItem,
  addLayer,
  createDefaultLayers,
  createProject,
  defaultDocument,
  layersForKind,
} from "../src/model/layers";
import type { Layer, MarkupItem, Project, SelectionRef } from "../src/model/types";

const NOW = "2026-01-01T00:00:00.000Z";

function makeProject(): Project {
  return createProject(defaultDocument("Plan.pdf", 2), createDefaultLayers());
}

function categoryId(project: Project, name: string): string {
  const category = project.categories.find((entry) => entry.name === name);
  if (!category) throw new Error(`Missing category ${name}`);
  return category.id;
}

function layer(project: Project, index = 0): Layer {
  return layersForKind(project, "measure")[index];
}

function add(
  project: Project,
  layerId: string,
  item: Partial<MarkupItem> & Pick<MarkupItem, "kind">,
): MarkupItem {
  const created: MarkupItem = {
    id: `item_${Math.random().toString(36).slice(2)}`,
    page: 1,
    points: [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
      { x: 110, y: 110 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: NOW,
    updatedAt: NOW,
    ...item,
  };
  addItem(project, layerId, created);
  return created;
}

function ref(item: MarkupItem, layerId: string): SelectionRef {
  return { layerId, itemId: item.id };
}

describe("measurement bulk edits", () => {
  it("changes category and room across layers and skips drawings", () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    const wall = categoryId(project, "Wall");
    const first = layer(project);
    const second = addLayer(project, "measure");
    const length = add(project, first.id, { kind: "length", categoryId: floor, room: "A" });
    const area = add(project, second.id, { kind: "area", categoryId: floor, room: "B" });
    const count = add(project, first.id, { kind: "count", categoryId: floor });
    const drawLayer = layersForKind(project, "draw")[0];
    const drawing = add(project, drawLayer.id, { kind: "rect" });

    const result = applyMeasurementBulkEdit(
      project,
      [
        ref(length, first.id),
        ref(area, second.id),
        ref(count, first.id),
        ref(drawing, drawLayer.id),
      ],
      { categoryId: wall, room: "Room 9" },
    );

    expect(result.updated).toBe(3);
    expect(result.skippedNonMeasurement).toBe(1);
    expect(result.skippedLocked).toBe(0);
    for (const item of [length, area, count]) {
      expect(item.categoryId).toBe(wall);
      expect(item.room).toBe("Room 9");
      expect(item.updatedAt).not.toBe(NOW);
    }
    expect(drawing.categoryId).toBeUndefined();
    expect(drawing.room).toBeUndefined();
  });

  it("clears rooms when the patch room is empty", () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    const first = layer(project);
    const item = add(project, first.id, { kind: "length", categoryId: floor, room: "A" });

    const result = applyMeasurementBulkEdit(project, [ref(item, first.id)], { room: "  " });
    expect(result.updated).toBe(1);
    expect(item.room).toBeUndefined();
  });

  it("applies area mode and count type only to matching kinds", () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    const first = layer(project);
    const area = add(project, first.id, { kind: "area", categoryId: floor, areaMode: "add" });
    const length = add(project, first.id, { kind: "length", categoryId: floor });
    const count = add(project, first.id, { kind: "count", categoryId: floor, countType: "door" });
    const refs = [ref(area, first.id), ref(length, first.id), ref(count, first.id)];

    const modeResult = applyMeasurementBulkEdit(project, refs, { areaMode: "subtract" });
    expect(modeResult.updated).toBe(1);
    expect(area.areaMode).toBe("subtract");
    expect(length.areaMode).toBeUndefined();
    expect(count.areaMode).toBeUndefined();

    const typeResult = applyMeasurementBulkEdit(project, refs, { countType: "window" });
    expect(typeResult.updated).toBe(1);
    expect(count.countType).toBe("window");
    expect(area.countType).toBeUndefined();
    expect(length.countType).toBeUndefined();
  });

  it("skips items on locked layers and locked items", () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    const wall = categoryId(project, "Wall");
    const first = layer(project);
    const lockedLayer = addLayer(project, "measure");
    lockedLayer.locked = true;
    const editable = add(project, first.id, { kind: "length", categoryId: floor });
    const lockedItem = add(project, first.id, { kind: "length", categoryId: floor });
    lockedItem.locked = true;
    const layered = add(project, lockedLayer.id, { kind: "length", categoryId: floor });

    const result = applyMeasurementBulkEdit(
      project,
      [ref(editable, first.id), ref(lockedItem, first.id), ref(layered, lockedLayer.id)],
      { categoryId: wall },
    );

    expect(result.updated).toBe(1);
    expect(result.skippedLocked).toBe(2);
    expect(editable.categoryId).toBe(wall);
    expect(lockedItem.categoryId).toBe(floor);
    expect(layered.categoryId).toBe(floor);
  });
});
