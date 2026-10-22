import { describe, expect, it } from "vitest";
import {
  addItem,
  addLayer,
  createDefaultLayers,
  createProject,
  defaultDocument,
  layersForKind,
} from "../src/model/layers";
import { calculateQuantities } from "../src/model/quantity";
import type { MarkupItem, Project } from "../src/model/types";

const NOW = "2026-01-01T00:00:00.000Z";
const SCALE = { pointsPerMeter: 100, sourceUnit: "m" as const };

function makeProject(): Project {
  const project = createProject(defaultDocument("Plan.pdf", 2), createDefaultLayers());
  project.settings.lengthUnit = "m";
  return project;
}

function categoryId(project: Project, name: string): string {
  const category = project.categories.find((entry) => entry.name === name);
  if (!category) throw new Error(`Missing category ${name}`);
  return category.id;
}

function measureLayer(project: Project) {
  return layersForKind(project, "measure")[0];
}

function add(
  project: Project,
  item: Partial<MarkupItem> & Pick<MarkupItem, "kind">,
  layerId = measureLayer(project).id,
): MarkupItem {
  const created: MarkupItem = {
    id: `item_${Math.random().toString(36).slice(2)}`,
    page: 1,
    points: [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 110 }, { x: 10, y: 110 }],
    color: "#4cc9f0",
    strokeWidth: 2,
    scale: { ...SCALE },
    createdAt: NOW,
    updatedAt: NOW,
    ...item,
  };
  addItem(project, layerId, created);
  return created;
}

function lengthItem(
  project: Project,
  extra: Partial<MarkupItem> = {},
  layerId?: string,
): MarkupItem {
  return add(
    project,
    {
      kind: "length",
      points: [{ x: 10, y: 10 }, { x: 110, y: 10 }],
      ...extra,
    },
    layerId,
  );
}

function areaItem(
  project: Project,
  extra: Partial<MarkupItem> = {},
  layerId?: string,
): MarkupItem {
  return add(project, { kind: "area", ...extra }, layerId);
}

function countItem(
  project: Project,
  extra: Partial<MarkupItem> = {},
  layerId?: string,
): MarkupItem {
  return add(
    project,
    {
      kind: "count",
      points: [{ x: 40, y: 40 }],
      scale: null,
      ...extra,
    },
    layerId,
  );
}

describe("quantity rows", () => {
  it("groups by category, room, and type and sorts like the project", () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    const wall = categoryId(project, "Wall");

    lengthItem(project, { categoryId: floor, room: "Room B" });
    lengthItem(project, {
      categoryId: floor,
      room: "Room A",
      points: [{ x: 10, y: 10 }, { x: 210, y: 10 }],
    });
    areaItem(project, { categoryId: floor, room: "Room A" });
    countItem(project, { categoryId: floor, room: "Room B", countType: "door" });
    countItem(project, { categoryId: floor, room: "Room B", countType: "window" });
    lengthItem(project, { categoryId: wall, room: "Room A" });

    const summary = calculateQuantities(project, { page: "all" });
    expect(summary.rows.map((row) => [row.categoryName, row.room, row.type])).toEqual([
      ["Floor", "Room A", "length"],
      ["Floor", "Room A", "area"],
      ["Floor", "Room B", "length"],
      ["Floor", "Room B", "count"],
      ["Wall", "Room A", "length"],
    ]);

    const roomA = summary.categories[0].rooms[0];
    expect(roomA.rows.map((row) => row.net)).toEqual([2, 1]);
    expect(summary.categories[0].rooms[1].rows[1].gross).toBe(2);

    const floorTotals = summary.categories[0].totals;
    expect(floorTotals.map((total) => total.type)).toEqual(["length", "area", "count"]);
    expect(floorTotals[0].net).toBeCloseTo(3);
    expect(floorTotals[1].net).toBeCloseTo(1);
    expect(floorTotals[2].net).toBe(2);
    expect(floorTotals[2].unit).toBe("pcs");
    expect(summary.totals.find((total) => total.type === "length")?.net).toBeCloseTo(4);
  });

  it("nets deductions only inside the same category and room", () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    const wall = categoryId(project, "Wall");

    areaItem(project, { categoryId: floor, room: "Room 101" });
    areaItem(project, {
      categoryId: floor,
      room: "Room 101",
      points: [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 60 }, { x: 10, y: 60 }],
      areaMode: "subtract",
    });
    areaItem(project, {
      categoryId: floor,
      room: "Room 102",
      points: [{ x: 10, y: 10 }, { x: 73, y: 10 }, { x: 73, y: 73 }, { x: 10, y: 73 }],
    });
    areaItem(project, {
      categoryId: floor,
      room: "Room 102",
      areaMode: "subtract",
    });
    areaItem(project, { categoryId: floor, room: "Room 103" });
    areaItem(project, { categoryId: wall, room: "Room 101" });
    areaItem(project, {
      categoryId: wall,
      room: "Room 101",
      points: [{ x: 10, y: 10 }, { x: 210, y: 10 }, { x: 210, y: 210 }, { x: 10, y: 210 }],
      areaMode: "subtract",
    });
    lengthItem(project, { categoryId: floor, room: "Room 101", areaMode: "subtract" });

    const summary = calculateQuantities(project, { page: "all" });
    const floorRooms = summary.categories[0].rooms;
    const room101 = floorRooms.find((room) => room.room === "Room 101");
    const room102 = floorRooms.find((room) => room.room === "Room 102");
    const room103 = floorRooms.find((room) => room.room === "Room 103");
    const wallRoom = summary.categories[1].rooms[0];

    const room101Area = room101?.rows.find((row) => row.type === "area");
    const room101Length = room101?.rows.find((row) => row.type === "length");
    expect(summary.categories[0].categoryName).toBe("Floor");
    expect(room101Area?.gross).toBeCloseTo(1);
    expect(room101Area?.deduction).toBeCloseTo(0.25);
    expect(room101Area?.net).toBeCloseTo(0.75);
    expect(room101Area?.clamped).toBe(false);
    expect(room101Length?.deduction).toBe(0);

    expect(room102?.rows[0].gross).toBeCloseTo(0.3969);
    expect(room102?.rows[0].net).toBe(0);
    expect(room102?.rows[0].clamped).toBe(true);
    expect(room103?.rows[0].net).toBeCloseTo(1);

    expect(wallRoom?.rows[0].net).toBe(0);
    expect(wallRoom?.rows[0].clamped).toBe(true);

    const floorArea = summary.categories[0].totals.find((total) => total.type === "area");
    expect(floorArea?.gross).toBeCloseTo(2.3969);
    expect(floorArea?.deduction).toBeCloseTo(1.25);
    expect(floorArea?.net).toBeCloseTo(1.75);
    expect(floorArea?.clamped).toBe(true);
  });

  it("excludes hidden measurements and layers but includes locked ones", () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    const visible = measureLayer(project);
    visible.locked = true;
    lengthItem(project, { categoryId: floor, room: "A" });
    lengthItem(project, { categoryId: floor, room: "A", visible: false });

    const hiddenLayer = addLayer(project, "measure");
    hiddenLayer.visible = false;
    lengthItem(project, { categoryId: floor, room: "A" }, hiddenLayer.id);

    const off = calculateQuantities(project, { page: "all" });
    expect(off.rows).toHaveLength(1);
    expect(off.rows[0].items).toBe(1);
    expect(off.hiddenExcluded).toBe(2);

    const on = calculateQuantities(project, { page: "all", includeHidden: true });
    expect(on.rows[0].items).toBe(3);
    expect(on.hiddenExcluded).toBe(0);
  });

  it("applies page, layer, category, and room filters without changing the project", () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    const wall = categoryId(project, "Wall");
    const first = measureLayer(project);
    const second = addLayer(project, "measure");

    lengthItem(project, { categoryId: floor, room: "Room A", page: 1 }, first.id);
    lengthItem(project, { categoryId: floor, room: "Room B", page: 1 }, second.id);
    lengthItem(project, { categoryId: wall, room: "Room A", page: 2 }, first.id);
    const before = JSON.stringify(project);

    expect(calculateQuantities(project, { page: 1 }).rows).toHaveLength(2);
    expect(calculateQuantities(project, { page: 2 }).rows[0].categoryName).toBe("Wall");
    expect(
      calculateQuantities(project, { page: "all", categoryId: floor }).rows,
    ).toHaveLength(2);
    expect(
      calculateQuantities(project, { page: "all", layerIds: [second.id] }).rows,
    ).toHaveLength(1);
    expect(
      calculateQuantities(project, { page: "all", layerIds: [] }).rows,
    ).toHaveLength(0);
    expect(
      calculateQuantities(project, { page: "all", room: "room a" }).rows,
    ).toHaveLength(2);
    expect(JSON.stringify(project)).toBe(before);
  });

  it("sorts an empty room after named rooms", () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    lengthItem(project, { categoryId: floor, room: undefined });
    lengthItem(project, { categoryId: floor, room: "Room A" });

    const summary = calculateQuantities(project, { page: "all" });
    expect(summary.rows.map((row) => row.room)).toEqual(["Room A", ""]);
  });

  it("groups rooms case-insensitively and keeps the first spelling", () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    lengthItem(project, { categoryId: floor, room: "Room A" });
    lengthItem(project, { categoryId: floor, room: "room a" });

    const summary = calculateQuantities(project, { page: "all" });
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].room).toBe("Room A");
    expect(summary.rows[0].items).toBe(2);
    expect(summary.rows[0].net).toBeCloseTo(2);
  });

  it("uses yd² for area quantities and keeps counts in pcs", () => {
    const project = makeProject();
    project.settings.areaUnit = "yd2";
    const floor = categoryId(project, "Floor");
    areaItem(project, { categoryId: floor, room: "A" });
    countItem(project, { categoryId: floor, room: "A", countType: "fixture" });

    const summary = calculateQuantities(project, { page: "all" });
    const area = summary.rows.find((row) => row.type === "area");
    const count = summary.rows.find((row) => row.type === "count");
    expect(area?.unit).toBe("yd²");
    expect(area?.net).toBeCloseTo(1.1959900463);
    expect(count?.unit).toBe("pcs");
    expect(count?.net).toBe(1);
  });

  it("excludes uncalibrated length and area and reports how many", () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    lengthItem(project, { categoryId: floor, room: "A", scale: null });
    areaItem(project, { categoryId: floor, room: "A", scale: null });
    countItem(project, { categoryId: floor, room: "A" });

    const summary = calculateQuantities(project, { page: "all" });
    expect(summary.rows.map((row) => row.type)).toEqual(["count"]);
    expect(summary.uncalibratedExcluded).toBe(2);
  });
});
