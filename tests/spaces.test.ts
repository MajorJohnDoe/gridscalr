// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  canReparent,
  createRoomsFromText,
  createSpace,
  deleteSpace,
  duplicateNumberSpaceIds,
  emptySpaceDraft,
  linkMeasurements,
  linkableSelection,
  linkMeasurement,
  moveSpace,
  roomTextCandidates,
  spaceArea,
  spaceAreas,
  spaceDraftFor,
  spaceMeasurements,
  spaceSubtreeIds,
  spaceTree,
  unlinkMeasurement,
  updateSpace,
  validateSpaceDraft,
} from "../src/features/spaces";
import type { SpaceDraft } from "../src/features/spaces";
import { deletePage, duplicatePage } from "../src/features/pageModel";
import {
  addItem,
  addLayer,
  createProject,
  defaultDocument,
  layersForKind,
  setLayerVisibleOnPage,
} from "../src/model/layers";
import { validateProject } from "../src/model/integrity";
import type { MarkupItem, Project, Space } from "../src/model/types";
import { store } from "../src/state/store";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";
const SCALE = { pointsPerMeter: 100, sourceUnit: "m" as const };

function makeProject(pages = 2): Project {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", pages)));
}

function measureLayer(project: Project) {
  return layersForKind(project, "measure")[0];
}

function square(size = 100): MarkupItem["points"] {
  return [
    { x: 10, y: 10 },
    { x: 10 + size, y: 10 },
    { x: 10 + size, y: 10 + size },
    { x: 10, y: 10 + size },
  ];
}

function areaItem(
  project: Project,
  spaceId: string | undefined,
  options: {
    size?: number;
    subtract?: boolean;
    page?: number;
    scale?: { pointsPerMeter: number; sourceUnit: "m" } | null;
    locked?: boolean;
    layerId?: string;
    room?: string;
  } = {},
): MarkupItem {
  const item: MarkupItem = {
    id: `item_${Math.random().toString(36).slice(2)}`,
    pageId: pageIdFor(options.page ?? 1),
    kind: "area",
    points: square(options.size),
    color: "#4cc9f0",
    strokeWidth: 2,
    scale: options.scale === null ? null : (options.scale ?? { ...SCALE }),
    createdAt: NOW,
    updatedAt: NOW,
    ...(spaceId ? { spaceId } : {}),
    ...(options.subtract ? { areaMode: "subtract" as const } : {}),
    ...(options.locked ? { locked: true } : {}),
    ...(options.room ? { room: options.room } : {}),
  };
  addItem(project, options.layerId ?? measureLayer(project).id, item);
  return item;
}

function draft(overrides: Partial<SpaceDraft> = {}): SpaceDraft {
  return { ...emptySpaceDraft([]), name: "Kitchen", ...overrides };
}

function addSpace(project: Project, overrides: Partial<Space> = {}): Space {
  const result = createSpace(
    project,
    draft({ name: overrides.name ?? "Kitchen", kind: overrides.kind ?? "room" }),
  );
  expect(result.problems).toEqual([]);
  const space = result.space!;
  Object.assign(space, overrides);
  return space;
}

describe("space area derivation", () => {
  it("sums visible linked area measurements, add minus subtract, in m²", () => {
    const project = makeProject();
    const room = addSpace(project);
    areaItem(project, room.id, { size: 100 });
    areaItem(project, room.id, { size: 50, subtract: true });

    const area = spaceArea(room, spaceMeasurements(project).get(room.id) ?? []);
    expect(area.source).toBe("measured");
    expect(area.areaM2).toBeCloseTo(0.75, 6);
    expect(area.measurementCount).toBe(2);
    expect(area.warning).toBeNull();
  });

  it("uses the manual value only while no measurement is linked", () => {
    const project = makeProject();
    const room = addSpace(project, { areaMode: "manual" });
    room.areaM2 = 12.5;

    const area = spaceArea(room, []);
    expect(area.source).toBe("manual");
    expect(area.areaM2).toBe(12.5);
    expect(area.manualUnused).toBe(false);
  });

  it("lets a linked measurement win over a manual value and flags it unused", () => {
    const project = makeProject();
    const room = addSpace(project, { areaMode: "manual" });
    room.areaM2 = 12.5;
    areaItem(project, room.id);

    const area = spaceArea(room, spaceMeasurements(project).get(room.id) ?? []);
    expect(area.source).toBe("measured");
    expect(area.areaM2).toBeCloseTo(1, 6);
    expect(area.manualUnused).toBe(true);
    expect(area.manualM2).toBe(12.5);
  });

  it("reports a missing area instead of falling back to manual", () => {
    const project = makeProject();
    const room = addSpace(project);
    const area = spaceArea(room, []);
    expect(area.areaM2).toBeNull();
    expect(area.source).toBe("missing");
    expect(area.warning).toBe("noMeasurement");
  });

  it("excludes hidden items and hidden layers, and includes locked items", () => {
    const project = makeProject();
    const room = addSpace(project);
    const hiddenItem = areaItem(project, room.id);
    hiddenItem.visible = false;
    const locked = areaItem(project, room.id, { locked: true });

    const visibleLayer = measureLayer(project);
    const hiddenLayer = addLayer(project, "measure", "Hidden");
    setLayerVisibleOnPage(hiddenLayer, pageIdFor(1), false);
    areaItem(project, room.id, { layerId: hiddenLayer.id });

    const links = spaceMeasurements(project).get(room.id) ?? [];
    expect(links).toHaveLength(3);
    const area = spaceArea(room, links);
    expect(area.measurementCount).toBe(1);
    expect(area.hiddenCount).toBe(2);
    expect(area.areaM2).toBeCloseTo(1, 6);
    expect(links.find((link) => link.itemId === locked.id)?.locked).toBe(true);
    expect(visibleLayer.id).toBe(measureLayer(project).id);
  });

  it("reports a hidden-only link set as missing", () => {
    const project = makeProject();
    const room = addSpace(project);
    const item = areaItem(project, room.id);
    item.visible = false;
    const area = spaceArea(room, spaceMeasurements(project).get(room.id) ?? []);
    expect(area.areaM2).toBeNull();
    expect(area.warning).toBe("hiddenOnly");
  });

  it("refuses a partial sum when a linked measurement has no scale", () => {
    const project = makeProject();
    const room = addSpace(project);
    areaItem(project, room.id);
    areaItem(project, room.id, { scale: null });
    const area = spaceArea(room, spaceMeasurements(project).get(room.id) ?? []);
    expect(area.areaM2).toBeNull();
    expect(area.warning).toBe("noScale");
    expect(area.uncalibratedCount).toBe(1);
  });

  it("clamps a deduction-only room to zero", () => {
    const project = makeProject();
    const room = addSpace(project);
    areaItem(project, room.id, { subtract: true });
    const area = spaceArea(room, spaceMeasurements(project).get(room.id) ?? []);
    expect(area.areaM2).toBe(0);
    expect(area.clamped).toBe(true);
  });

  it("ignores a non-area item that carries a space link", () => {
    const project = makeProject();
    const room = addSpace(project);
    const item: MarkupItem = {
      id: "item_length",
      pageId: pageIdFor(1),
      kind: "length",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      color: "#4cc9f0",
      strokeWidth: 2,
      scale: { ...SCALE },
      createdAt: NOW,
      updatedAt: NOW,
      spaceId: room.id,
    };
    addItem(project, measureLayer(project).id, item);
    const areas = spaceAreas(project);
    expect(areas.get(room.id)?.areaM2).toBeNull();
    expect(areas.get(room.id)?.measurementCount).toBe(0);
    expect(validateProject(project).some((issue) => issue.code === "invalidItemSpace")).toBe(true);
  });
});

describe("space tree", () => {
  it("walks building → floor → room in array sibling order", () => {
    const project = makeProject();
    const building = addSpace(project, { kind: "building", name: "House" });
    const floor = addSpace(project, { kind: "floor", name: "Ground", parentId: building.id });
    const room = addSpace(project, { kind: "room", name: "Kitchen", parentId: floor.id });
    addSpace(project, { kind: "zone", name: "Roof", parentId: building.id });

    const nodes = spaceTree(project.spaces);
    expect(nodes.map((node) => [node.space.id, node.depth])).toEqual([
      [building.id, 0],
      [floor.id, 1],
      [room.id, 2],
      [project.spaces[3].id, 1],
    ]);
  });

  it("reports a stored parent cycle instead of looping", () => {
    const project = makeProject();
    const first = addSpace(project, { name: "A" });
    const second = addSpace(project, { name: "B", parentId: first.id });
    first.parentId = second.id;
    const nodes = spaceTree(project.spaces);
    expect(nodes).toHaveLength(2);
    expect(nodes.every((node) => node.depth === 0)).toBe(true);
    expect(validateProject(project).some((issue) => issue.code === "spaceParentCycle")).toBe(true);
  });

  it("rejects a parent that is the space itself or one of its descendants", () => {
    const project = makeProject();
    const parent = addSpace(project, { name: "Floor", kind: "floor" });
    const child = addSpace(project, { name: "Room", parentId: parent.id });
    const grandchild = addSpace(project, { name: "Store", parentId: child.id });

    expect(canReparent(project.spaces, parent.id, parent.id)).toBe(false);
    expect(canReparent(project.spaces, parent.id, grandchild.id)).toBe(false);
    expect(spaceSubtreeIds(project.spaces, parent.id)).toEqual(
      new Set([parent.id, child.id, grandchild.id]),
    );
    expect(
      validateSpaceDraft(project, { ...spaceDraftFor(parent), parentId: grandchild.id }),
    ).toEqual([{ code: "spaceParentCycle", property: "parentId" }]);
    const before = JSON.stringify(project.spaces);
    const result = updateSpace(project, { ...spaceDraftFor(parent), parentId: grandchild.id });
    expect(result.problems).toEqual([{ code: "spaceParentCycle", property: "parentId" }]);
    expect(JSON.stringify(project.spaces)).toBe(before);
  });

  it("requires a name and a valid parent", () => {
    const project = makeProject();
    expect(validateSpaceDraft(project, draft({ name: "  " }))).toEqual([
      { code: "missingSpaceName", property: "name" },
    ]);
    expect(validateSpaceDraft(project, draft({ parentId: "space_missing" }))).toEqual([
      { code: "missingSpaceParent", property: "parentId" },
    ]);
  });

  it("does not block a duplicate room number", () => {
    const project = makeProject();
    const floor = addSpace(project, { kind: "floor", name: "Ground" });
    addSpace(project, { name: "Kitchen", number: "101", parentId: floor.id });
    addSpace(project, { name: "Store", number: "101", parentId: floor.id });
    expect(validateSpaceDraft(project, draft({ number: "101", parentId: floor.id }))).toEqual([]);
    const duplicates = duplicateNumberSpaceIds(project.spaces);
    expect(duplicates.size).toBe(2);
    expect(validateProject(project).some((issue) => issue.code === "duplicateSpaceNumber")).toBe(
      true,
    );
  });

  it("does not treat the same number under another parent as a duplicate", () => {
    const project = makeProject();
    const floor = addSpace(project, { kind: "floor", name: "Ground" });
    const other = addSpace(project, { kind: "floor", name: "Upper" });
    addSpace(project, { name: "Kitchen", number: "101", parentId: floor.id });
    addSpace(project, { name: "Kitchen", number: "101", parentId: other.id });
    expect(duplicateNumberSpaceIds(project.spaces).size).toBe(0);
  });

  it("moves a space among its own siblings only", () => {
    const project = makeProject();
    const floor = addSpace(project, { kind: "floor", name: "Ground" });
    const first = addSpace(project, { name: "A", parentId: floor.id });
    const second = addSpace(project, { name: "B", parentId: floor.id });
    expect(moveSpace(project.spaces, second.id, -1)).toBe(true);
    const siblings = spaceTree(project.spaces)
      .filter((node) => node.depth === 1)
      .map((node) => node.space.id);
    expect(siblings).toEqual([second.id, first.id]);
    expect(moveSpace(project.spaces, second.id, -1)).toBe(false);
  });
});

describe("room text", () => {
  it("lists unique room text with a count and marks existing rooms", () => {
    const project = makeProject();
    areaItem(project, undefined, { room: "Kitchen" });
    areaItem(project, undefined, { room: " Kitchen " });
    areaItem(project, undefined, { room: "Hall" });
    addSpace(project, { name: "Hall" });

    const candidates = roomTextCandidates(project);
    expect(candidates).toEqual([
      { room: "Hall", count: 1, existing: true },
      { room: "Kitchen", count: 2, existing: false },
    ]);
  });

  it("creates one room per unique name, never links a measurement, and dedupes", () => {
    const project = makeProject();
    const kitchen = areaItem(project, undefined, { room: "Kitchen" });
    const hall = areaItem(project, undefined, { room: "Hall" });

    const first = createRoomsFromText(project, ["Kitchen", "Kitchen", "Hall"], { now: NOW });
    expect(first.created.map((space) => space.name)).toEqual(["Kitchen", "Hall"]);
    expect(first.skipped).toEqual(["Kitchen"]);
    expect(kitchen.spaceId).toBeUndefined();
    expect(hall.spaceId).toBeUndefined();
    for (const space of first.created) {
      expect(space.kind).toBe("room");
      expect(space.areaMode).toBe("measured");
      expect(space.parentId).toBeUndefined();
      expect(space.createdAt).toBe(NOW);
    }

    const second = createRoomsFromText(project, ["Kitchen", "Hall"]);
    expect(second.created).toEqual([]);
    expect(second.skipped).toEqual(["Kitchen", "Hall"]);
    expect(project.spaces).toHaveLength(2);
  });

  it("creates rooms under an explicit parent", () => {
    const project = makeProject();
    const floor = addSpace(project, { kind: "floor", name: "Ground" });
    const result = createRoomsFromText(project, ["Kitchen"], { parentId: floor.id });
    expect(result.created[0].parentId).toBe(floor.id);
  });
});

describe("page operations", () => {
  it("keeps a space and clears its page link when the page is deleted", () => {
    const project = makeProject();
    const room = addSpace(project);
    room.pageId = pageIdFor(1);
    areaItem(project, room.id);

    const result = deletePage(project, pageIdFor(1));
    expect(result?.clearedSpaces).toBe(1);
    expect(project.spaces).toHaveLength(1);
    expect(project.spaces[0].pageId).toBeUndefined();
    // The linked measurement lived on the deleted page and is gone with it.
    expect(spaceMeasurements(project).get(room.id)).toBeUndefined();
  });

  it("leaves spaces untouched when a page is duplicated", () => {
    const project = makeProject();
    const room = addSpace(project);
    room.pageId = pageIdFor(1);
    const item = areaItem(project, room.id);
    const before = JSON.stringify(project.spaces);

    const result = duplicatePage(project, pageIdFor(1), {
      copyMarkups: true,
      copyScale: true,
      copyName: true,
      name: "Copy",
    });
    expect(result).not.toBeNull();
    expect(JSON.stringify(project.spaces)).toBe(before);
    expect(item.spaceId).toBe(room.id);
    expect(
      project.layers.flatMap((layer) => layer.items).filter((entry) => entry.spaceId === room.id),
    ).toHaveLength(2);
  });
});

describe("link, unlink and delete", () => {
  it("refuses a non-area and a locked measurement", () => {
    const project = makeProject();
    const room = addSpace(project);
    const locked = areaItem(project, undefined, { locked: true });
    const length: MarkupItem = {
      id: "item_length",
      pageId: pageIdFor(1),
      kind: "length",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      color: "#4cc9f0",
      strokeWidth: 2,
      createdAt: NOW,
      updatedAt: NOW,
    };
    addItem(project, measureLayer(project).id, length);

    expect(
      linkMeasurement(project, room.id, { layerId: measureLayer(project).id, itemId: locked.id }),
    ).toEqual({
      linked: false,
      problem: "measurementLocked",
    });
    expect(
      linkMeasurement(project, room.id, { layerId: measureLayer(project).id, itemId: length.id }),
    ).toEqual({
      linked: false,
      problem: "measurementNotArea",
    });
    expect(
      linkableSelection(project, [{ layerId: measureLayer(project).id, itemId: length.id }]),
    ).toEqual([]);
    const result = linkMeasurements(project, room.id, [
      { layerId: measureLayer(project).id, itemId: locked.id },
    ]);
    expect(result).toEqual({ linked: 0, problems: ["measurementLocked"] });
  });

  it("links and unlinks in one undo step each", () => {
    const project = makeProject();
    const room = addSpace(project);
    const item = areaItem(project, undefined);
    const ref = { layerId: measureLayer(project).id, itemId: item.id };
    store.setProject(project, null);

    const linkedItem = () =>
      store.project?.layers.flatMap((layer) => layer.items).find((entry) => entry.id === item.id);

    store.mutate((current) => {
      linkMeasurement(current, room.id, ref);
    }, "change");
    expect(linkedItem()?.spaceId).toBe(room.id);
    expect(store.canUndo).toBe(true);
    store.undo();
    expect(linkedItem()?.spaceId).toBeUndefined();

    store.redo();
    expect(linkedItem()?.spaceId).toBe(room.id);

    store.mutate((current) => {
      unlinkMeasurement(current, ref);
    }, "change");
    expect(linkedItem()?.spaceId).toBeUndefined();
  });

  it("deletes a space in one undo step, clears links and keeps the measurements", () => {
    const project = makeProject();
    const room = addSpace(project);
    const first = areaItem(project, room.id);
    const second = areaItem(project, room.id);
    store.setProject(project, null);

    let cleared = 0;
    store.mutate((current) => {
      const result = deleteSpace(current, room.id);
      expect(result.removed).toBe(true);
      cleared = result.clearedMeasurements;
    }, "change");
    expect(cleared).toBe(2);
    expect(store.project?.spaces).toEqual([]);
    const items = store.project?.layers.flatMap((layer) => layer.items) ?? [];
    expect(items.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(items.every((item) => item.spaceId === undefined)).toBe(true);
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(store.project?.spaces).toHaveLength(1);
    expect(
      store.project?.layers
        .flatMap((layer) => layer.items)
        .every((item) => item.spaceId === room.id),
    ).toBe(true);
  });

  it("refuses to delete a space that still has children", () => {
    const project = makeProject();
    const floor = addSpace(project, { kind: "floor", name: "Ground" });
    addSpace(project, { name: "Kitchen", parentId: floor.id });
    const result = deleteSpace(project, floor.id);
    expect(result).toMatchObject({ removed: false, childCount: 1, clearedMeasurements: 0 });
    expect(project.spaces).toHaveLength(2);
  });

  it("cleans a schedule filter that pointed at the deleted space", () => {
    const project = makeProject();
    const room = addSpace(project);
    otherRoom(project);
    project.schedules.push({
      id: "sched_1",
      name: "Areas",
      source: "spaces",
      rowMode: "items",
      columns: [],
      filters: { spaceIds: [room.id, "space_other"] },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = deleteSpace(project, room.id);
    expect(result.clearedScheduleFilters).toBe(1);
    expect(project.schedules[0].filters.spaceIds).toEqual(["space_other"]);
  });
});

function otherRoom(project: Project): Space {
  const result = createSpace(project, draft({ name: "Store" }));
  return result.space!;
}
