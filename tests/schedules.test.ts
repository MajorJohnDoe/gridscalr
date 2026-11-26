// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  cachedSchedule,
  clearScheduleCache,
  computeSchedule,
  computeSummary,
  createSchedule,
  deleteSchedule,
  duplicateSchedule,
  emptyScheduleDraft,
  scheduleDraftProblems,
  setCategorySummaryRole,
  totalHasVisibleColumn,
  setCountTypeSummaryRole,
  updateSchedule,
  createKeyCache,
  SCHEDULE_ROW_HEIGHT,
  tableWindow,
} from "../src/features/schedules";
import type { ScheduleDraft } from "../src/features/schedules";
import { createSpace, emptySpaceDraft } from "../src/features/spaces";
import { deletePage } from "../src/features/pageModel";
import { removeCategory } from "../src/model/categories";
import { addCountType, removeCountType } from "../src/model/countTypes";
import {
  addItem,
  addLayer,
  createProject,
  defaultDocument,
  layersForKind,
  setLayerVisibleOnPage,
} from "../src/model/layers";
import type {
  MarkupItem,
  Project,
  ScheduleColumn,
  ScheduleDefinition,
  Space,
} from "../src/model/types";
import { store } from "../src/state/store";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";
const SCALE = { pointsPerMeter: 100, sourceUnit: "m" as const };

function makeProject(pages = 2): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", pages)));
  project.settings.lengthUnit = "m";
  project.settings.areaUnit = "m2";
  return project;
}

function measureLayer(project: Project) {
  return layersForKind(project, "measure")[0];
}

function column(id: string, field: string, extra: Partial<ScheduleColumn> = {}): ScheduleColumn {
  return { id, field, visible: true, ...extra };
}

function definition(overrides: Partial<ScheduleDefinition> = {}): ScheduleDefinition {
  return {
    id: "sched_test",
    name: "Test",
    source: "measurements",
    rowMode: "items",
    columns: [column("c1", "label"), column("c2", "category"), column("c3", "value")],
    filters: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function lengthItem(
  project: Project,
  options: {
    meters?: number;
    page?: number;
    categoryId?: string;
    room?: string;
    visible?: boolean;
    locked?: boolean;
    scale?: typeof SCALE | null;
    layerId?: string;
    spaceId?: string;
    custom?: Record<string, string | number | boolean | string[] | null>;
    label?: string;
  } = {},
): MarkupItem {
  const meters = options.meters ?? 1;
  const item: MarkupItem = {
    id: `item_len_${Math.random().toString(36).slice(2)}`,
    pageId: pageIdFor(options.page ?? 1),
    kind: "length",
    points: [
      { x: 0, y: 0 },
      { x: meters * 100, y: 0 },
    ],
    color: "#e30613",
    strokeWidth: 2,
    scale: options.scale === null ? null : (options.scale ?? { ...SCALE }),
    createdAt: NOW,
    updatedAt: NOW,
    ...(options.categoryId ? { categoryId: options.categoryId } : {}),
    ...(options.room ? { room: options.room } : {}),
    ...(options.visible === false ? { visible: false } : {}),
    ...(options.locked ? { locked: true } : {}),
    ...(options.spaceId ? { spaceId: options.spaceId } : {}),
    ...(options.custom ? { custom: options.custom } : {}),
    ...(options.label ? { label: options.label } : {}),
  };
  addItem(project, options.layerId ?? measureLayer(project).id, item);
  return item;
}

function areaItem(project: Project, size = 100, options: { spaceId?: string } = {}): MarkupItem {
  const item: MarkupItem = {
    id: `item_area_${Math.random().toString(36).slice(2)}`,
    pageId: pageIdFor(1),
    kind: "area",
    points: [
      { x: 0, y: 0 },
      { x: size, y: 0 },
      { x: size, y: size },
      { x: 0, y: size },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    scale: { ...SCALE },
    createdAt: NOW,
    updatedAt: NOW,
    ...(options.spaceId ? { spaceId: options.spaceId } : {}),
  };
  addItem(project, measureLayer(project).id, item);
  return item;
}

function countItem(project: Project, countType: string, quantity = 1): MarkupItem {
  const item: MarkupItem = {
    id: `item_count_${Math.random().toString(36).slice(2)}`,
    pageId: pageIdFor(1),
    kind: "count",
    points: [{ x: 10, y: 10 }],
    color: "#e30613",
    strokeWidth: 2,
    countType: countType as MarkupItem["countType"],
    countQuantity: quantity,
    createdAt: NOW,
    updatedAt: NOW,
  };
  addItem(project, measureLayer(project).id, item);
  return item;
}

function addSpace(project: Project, overrides: Partial<Space> = {}): Space {
  const result = createSpace(project, {
    ...emptySpaceDraft(project.spaces),
    name: overrides.name ?? "Kitchen",
    kind: overrides.kind ?? "room",
  });
  expect(result.problems).toEqual([]);
  const space = result.space!;
  Object.assign(space, overrides);
  return space;
}

function wallCategory(project: Project): string {
  return project.categories.find((category) => category.name === "Wall")!.id;
}

beforeEach(() => {
  clearScheduleCache();
});

describe("measurement schedule computation", () => {
  it("maps visible items to rows with stable ids and cell values", () => {
    const project = makeProject();
    const categoryId = wallCategory(project);
    const item = lengthItem(project, { meters: 2, categoryId, label: "External wall" });

    const result = computeSchedule(project, definition());
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].rowId).toBe(`measurement:${item.id}`);
    expect(result.rows[0].entityId).toBe(item.id);
    expect(result.columns.map((entry) => entry.label)).toEqual(["Label", "Category", "Value"]);
    expect(result.rows[0].values.value.value).toBeCloseTo(2, 6);
    expect(result.rows[0].cells[0].text).toBe("External wall");
    expect(result.rows[0].cells[1].text).toBe("Wall");
  });

  it("excludes hidden items and hidden layers and keeps locked items", () => {
    const project = makeProject();
    lengthItem(project, { visible: false, label: "Hidden item" });
    const hiddenLayer = addLayer(project, "measure", "Hidden layer");
    setLayerVisibleOnPage(hiddenLayer, pageIdFor(1), false);
    lengthItem(project, { layerId: hiddenLayer.id, label: "Hidden layer item" });
    lengthItem(project, { locked: true, label: "Locked item" });

    const result = computeSchedule(
      project,
      definition({ columns: [column("c1", "label"), column("c2", "locked")] }),
    );
    expect(result.rows.map((row) => row.cells[0].text)).toEqual(["Locked item"]);
    expect(result.rows[0].cells[1].text).toBe("Yes");
  });

  it("filters by page, category, space and item kind", () => {
    const project = makeProject();
    const wall = wallCategory(project);
    const floor = project.categories.find((category) => category.name === "Floor")!.id;
    const room = addSpace(project);
    lengthItem(project, { page: 1, categoryId: wall, spaceId: room.id });
    lengthItem(project, { page: 2, categoryId: floor });
    areaItem(project, 100, { spaceId: room.id });

    const byPage = computeSchedule(project, definition({ filters: { pageIds: [pageIdFor(2)] } }));
    expect(byPage.rowCount).toBe(1);
    const byCategory = computeSchedule(project, definition({ filters: { categoryIds: [wall] } }));
    expect(byCategory.rowCount).toBe(1);
    const bySpace = computeSchedule(project, definition({ filters: { spaceIds: [room.id] } }));
    expect(bySpace.rowCount).toBe(2);
    const byKind = computeSchedule(project, definition({ filters: { itemKinds: ["area"] } }));
    expect(byKind.rowCount).toBe(1);
  });

  it("filters by a custom field with eq, contains, empty and notEmpty", () => {
    const project = makeProject();
    project.fieldDefinitions.push({
      id: "field_fire",
      key: "fireClass",
      label: "Fire class",
      type: "text",
      scope: "measurement",
      order: 0,
    });
    lengthItem(project, { custom: { field_fire: "EI30" }, label: "Fire door wall" });
    lengthItem(project, { label: "Plain wall" });

    const eq = computeSchedule(
      project,
      definition({ filters: { custom: [{ fieldId: "field_fire", op: "eq", value: "EI30" }] } }),
    );
    expect(eq.rows.map((row) => row.cells[0].text)).toEqual(["Fire door wall"]);
    const contains = computeSchedule(
      project,
      definition({
        filters: { custom: [{ fieldId: "field_fire", op: "contains", value: "ei3" }] },
      }),
    );
    expect(contains.rowCount).toBe(1);
    const empty = computeSchedule(
      project,
      definition({ filters: { custom: [{ fieldId: "field_fire", op: "empty" }] } }),
    );
    expect(empty.rows.map((row) => row.cells[0].text)).toEqual(["Plain wall"]);
    const notEmpty = computeSchedule(
      project,
      definition({ filters: { custom: [{ fieldId: "field_fire", op: "notEmpty" }] } }),
    );
    expect(notEmpty.rowCount).toBe(1);
  });

  it("renders custom columns with typed text and totals", () => {
    const project = makeProject();
    project.fieldDefinitions.push(
      {
        id: "field_fire",
        key: "fireClass",
        label: "Fire class",
        type: "enum",
        scope: "measurement",
        order: 0,
        options: [
          { id: "ei30", label: "EI 30" },
          { id: "ei60", label: "EI 60" },
        ],
      },
      {
        id: "field_risk",
        key: "risk",
        label: "Risk",
        type: "number",
        scope: "measurement",
        order: 1,
      },
    );
    lengthItem(project, { custom: { field_fire: "ei60", field_risk: 4 } });
    lengthItem(project, { custom: { field_fire: "ei30", field_risk: 6 } });

    const result = computeSchedule(
      project,
      definition({
        columns: [
          column("c1", "label"),
          column("c2", "custom:field_fire"),
          column("c3", "custom:field_risk"),
        ],
        totals: [{ field: "custom:field_risk", op: "sum" }],
      }),
    );
    expect(result.columns[1].label).toBe("Fire class");
    expect(result.rows.map((row) => row.cells[1].text)).toEqual(["EI 60", "EI 30"]);
    expect(result.rows.map((row) => row.cells[2].value)).toEqual([4, 6]);
    expect(result.totals[0].value).toBe(10);
  });

  it("sorts stably and keeps ties in source order", () => {
    const project = makeProject();
    lengthItem(project, { meters: 2, label: "B" });
    lengthItem(project, { meters: 1, label: "A" });
    lengthItem(project, { meters: 2, label: "C" });

    const sorted = computeSchedule(
      project,
      definition({ sort: [{ field: "value", direction: "asc" }] }),
    );
    expect(sorted.rows.map((row) => row.cells[0].text)).toEqual(["A", "B", "C"]);
    const desc = computeSchedule(
      project,
      definition({ sort: [{ field: "value", direction: "desc" }] }),
    );
    expect(desc.rows.map((row) => row.cells[0].text)).toEqual(["B", "C", "A"]);
  });

  it("groups rows and computes subtotals from the rows", () => {
    const project = makeProject();
    const wall = wallCategory(project);
    const floor = project.categories.find((category) => category.name === "Floor")!.id;
    lengthItem(project, { meters: 2, categoryId: wall });
    lengthItem(project, { meters: 3, categoryId: wall });
    lengthItem(project, { meters: 4, categoryId: floor });

    const result = computeSchedule(
      project,
      definition({
        groupBy: "category",
        totals: [{ field: "value", op: "sum" }],
      }),
    );
    expect(result.groups.map((group) => group.label)).toEqual(["Wall", "Floor"]);
    expect(result.groups[0].rows).toHaveLength(2);
    expect(result.groups[0].subtotals[0].value).toBeCloseTo(5, 6);
    expect(result.groups[1].subtotals[0].value).toBeCloseTo(4, 6);
    expect(result.totals[0].value).toBeCloseTo(9, 6);
    expect(result.rows[0].groupPath).toEqual(["Wall"]);
  });

  it("computes count, sum, average, min and max and reports mixed units", () => {
    const project = makeProject();
    lengthItem(project, { meters: 2 });
    lengthItem(project, { meters: 4 });
    countItem(project, "door", 2);

    const totals = computeSchedule(
      project,
      definition({
        columns: [column("c1", "label"), column("c2", "value"), column("c3", "unit")],
        totals: [
          { field: "value", op: "sum" },
          { field: "value", op: "avg" },
          { field: "value", op: "min" },
          { field: "value", op: "max" },
          { field: "label", op: "count" },
        ],
      }),
    );
    expect(totals.totals.map((entry) => entry.value)).toEqual([8, 8 / 3, 2, 4, 3]);
    expect(totals.totals[0].mixedUnits).toBe(true);
    expect(totals.totals[4].mixedUnits).toBe(false);
  });
});

describe("space schedule source", () => {
  it("reads derived areas instead of a second formula", () => {
    const project = makeProject();
    const measured = addSpace(project, { name: "Measured" });
    areaItem(project, 100, { spaceId: measured.id });
    const manual = addSpace(project, { name: "Manual", areaMode: "manual" });
    manual.areaM2 = 12.5;
    const missing = addSpace(project, { name: "Missing" });

    const result = computeSchedule(
      project,
      definition({
        source: "spaces",
        columns: [column("c1", "name"), column("c2", "area"), column("c3", "areaSource")],
        totals: [{ field: "area", op: "sum" }],
      }),
    );
    expect(result.columns[1].label).toBe("Area (m²)");
    const byName = new Map(result.rows.map((row) => [row.cells[0].text, row]));
    expect(byName.get("Measured")?.cells[1].value).toBeCloseTo(1, 6);
    expect(byName.get("Measured")?.cells[2].text).toBe("Measured");
    expect(byName.get("Manual")?.cells[1].value).toBe(12.5);
    expect(byName.get("Missing")?.cells[1].text).toBe("");
    expect(result.totals[0].value).toBeCloseTo(13.5, 6);
    expect(missing.id).toBeTruthy();
  });

  it("filters spaces by id and ignores hidden items in the area", () => {
    const project = makeProject();
    const room = addSpace(project, { name: "Room" });
    const other = addSpace(project, { name: "Other" });
    const area = areaItem(project, 100, { spaceId: room.id });
    area.visible = false;

    const filtered = computeSchedule(
      project,
      definition({
        source: "spaces",
        columns: [column("c1", "name"), column("c2", "area")],
        filters: { spaceIds: [room.id] },
      }),
    );
    expect(filtered.rowCount).toBe(1);
    expect(filtered.rows[0].cells[1].text).toBe("");
    expect(other.id).toBeTruthy();
  });
});

describe("summary cards and table", () => {
  it("reports zero with a missing role, then reads the role", () => {
    const project = makeProject();
    const wall = wallCategory(project);
    lengthItem(project, { meters: 3, categoryId: wall });
    countItem(project, "door", 2);

    const before = computeSummary(project);
    const wallBefore = before.cards.find((card) => card.id === "wallLength")!;
    const doorsBefore = before.cards.find((card) => card.id === "doors")!;
    expect(wallBefore.value).toBe(0);
    expect(wallBefore.roleMissing).toBe(true);
    expect(doorsBefore.value).toBe(0);
    expect(doorsBefore.roleMissing).toBe(true);

    expect(setCategorySummaryRole(project, wall, "wall")).toBe(true);
    const doorType = project.countTypes.find((type) => type.id === "door")!;
    expect(setCountTypeSummaryRole(project, doorType.id, "door")).toBe(true);

    const after = computeSummary(project);
    expect(after.cards.find((card) => card.id === "wallLength")!.value).toBeCloseTo(3, 6);
    expect(after.cards.find((card) => card.id === "wallLength")!.roleMissing).toBe(false);
    expect(after.cards.find((card) => card.id === "doors")!.value).toBe(2);
  });

  it("sums room areas and reports rooms without an area", () => {
    const project = makeProject();
    const measured = addSpace(project, { name: "Measured" });
    addSpace(project, { name: "Missing" });
    areaItem(project, 100, { spaceId: measured.id });

    const summary = computeSummary(project);
    const area = summary.cards.find((card) => card.id === "area")!;
    expect(summary.roomCount).toBe(2);
    expect(area.value).toBeCloseTo(1, 6);
    expect(area.missingCount).toBe(1);
    expect(summary.cards.find((card) => card.id === "rooms")!.value).toBe(2);
  });

  it("excludes hidden items and layers from walls and the table", () => {
    const project = makeProject();
    const wall = wallCategory(project);
    setCategorySummaryRole(project, wall, "wall");
    lengthItem(project, { meters: 1, categoryId: wall });
    lengthItem(project, { meters: 100, categoryId: wall, visible: false });
    const hiddenLayer = addLayer(project, "measure", "Hidden");
    setLayerVisibleOnPage(hiddenLayer, pageIdFor(1), false);
    lengthItem(project, { meters: 100, categoryId: wall, layerId: hiddenLayer.id });

    const summary = computeSummary(project);
    expect(summary.cards.find((card) => card.id === "wallLength")!.value).toBeCloseTo(1, 6);
  });

  it("honours settings.summary card visibility", () => {
    const project = makeProject();
    project.settings.summary.cards = project.settings.summary.cards.map((card) =>
      card.id === "doors" ? { ...card, visible: false } : card,
    );
    const summary = computeSummary(project);
    const doors = summary.cards.find((card) => card.id === "doors")!;
    expect(doors.visible).toBe(false);
    expect(summary.cards.filter((card) => card.visible)).toHaveLength(3);
  });

  it("builds the built-in table by category with totals", () => {
    const project = makeProject();
    const wall = wallCategory(project);
    lengthItem(project, { meters: 2, categoryId: wall });
    lengthItem(project, { meters: 3, categoryId: wall });
    areaItem(project, 100);

    const table = computeSummary(project).table;
    expect(table.rows[0].label).toBe("Wall");
    expect(table.rows[0].length).toBeCloseTo(5, 6);
    expect(table.rows[0].unit).toContain("m");
    expect(table.totals.length).toBeCloseTo(5, 6);
    expect(table.totals.area).toBeCloseTo(1, 6);
  });
});

describe("definition rules", () => {
  it("creates, updates, duplicates and deletes in caller-owned mutations", () => {
    const project = makeProject();
    store.setProject(project, null);
    const draft: ScheduleDraft = emptyScheduleDraft(project);
    draft.name = "Doors";
    let createdId = "";
    store.mutate((current) => {
      const result = createSchedule(current, draft);
      createdId = result.schedule!.id;
    }, "change");
    expect(store.project!.schedules).toHaveLength(1);
    store.undo();
    expect(store.project!.schedules).toHaveLength(0);

    const copy = duplicateSchedule(project, createdId);
    expect(copy?.id).not.toBe(createdId);
    expect(copy?.name).toContain("Doors");
    const updated = updateSchedule(project, {
      ...scheduleDraftFor(project, createdId),
      name: "Walls",
    });
    expect(updated.schedule?.name).toBe("Walls");
    expect(deleteSchedule(project, createdId).removed).toBe(true);
  });

  it("removes a deleted page from every schedule filter", () => {
    const project = makeProject();
    project.schedules.push(definition({ filters: { pageIds: [pageIdFor(1), pageIdFor(2)] } }));
    const summary = deletePage(project, pageIdFor(1));
    expect(summary?.clearedScheduleFilters).toBe(1);
    expect(project.schedules[0].filters.pageIds).toEqual([pageIdFor(2)]);
    const last = deletePage(project, pageIdFor(2));
    expect(last?.clearedScheduleFilters).toBe(1);
    expect(project.schedules[0].filters.pageIds).toBeUndefined();
  });

  it("cleans a removed category or count type from schedule filters", () => {
    const project = makeProject();
    const wall = wallCategory(project);
    const floor = project.categories.find((category) => category.name === "Floor")!;
    const custom = addCountType(project, "Server rack", "other")!;
    project.schedules.push(
      definition({
        filters: { categoryIds: [wall, floor.id], countTypes: ["door", custom.id] },
      }),
    );
    const removed = removeCategory(project, wall, floor.id);
    expect(removed.removed).toBe(true);
    expect(project.schedules[0].filters.categoryIds).toEqual([floor.id]);
    const removedType = removeCountType(project, custom.id);
    expect(removedType.removed).toBe(true);
    expect(project.schedules[0].filters.countTypes).toEqual(["door"]);
  });

  it("refuses to delete a schedule a placed table references", () => {
    const project = makeProject();
    const draft = emptyScheduleDraft(project);
    const created = createSchedule(project, draft).schedule!;
    const drawLayer = addLayer(project, "draw", "Scheman");
    addItem(project, drawLayer.id, {
      id: "item_schedule",
      pageId: pageIdFor(1),
      kind: "schedule",
      points: [],
      color: "#000000",
      strokeWidth: 1,
      scheduleId: created.id,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const result = deleteSchedule(project, created.id);
    expect(result.removed).toBe(false);
    expect(result.problems[0].code).toBe("inUse");
  });

  it("reports invalid fields and filters without crashing", () => {
    const project = makeProject();
    const invalid = definition({
      columns: [column("c1", "nope"), column("c2", "value")],
      filters: { pageIds: ["page_missing"], spaceIds: ["space_gone"] },
    });
    const result = computeSchedule(project, invalid);
    expect(result.invalidFields).toEqual(["nope"]);
    expect(result.columns[0].invalid).toBe(true);
    expect(result.problems.some((problem) => problem.code === "invalidField")).toBe(true);
    expect(result.problems.filter((problem) => problem.code === "invalidFilter")).toHaveLength(2);
    expect(result.rowCount).toBe(0);

    const problems = scheduleDraftProblems(project, {
      name: "",
      source: "measurements",
      rowMode: "items",
      columns: [],
      filters: {},
      sort: [],
      totals: [],
    });
    expect(problems.map((problem) => problem.code)).toContain("missingName");
  });

  it("detects a total that has no visible column", () => {
    expect(
      totalHasVisibleColumn({ columns: [column("c1", "label"), column("c2", "value")] }, "value"),
    ).toBe(true);
    expect(
      totalHasVisibleColumn({ columns: [column("c2", "value", { visible: false })] }, "value"),
    ).toBe(false);
    expect(totalHasVisibleColumn({ columns: [column("c1", "label")] }, "value")).toBe(false);
  });

  it("flags filters that do not apply to the space source", () => {
    const project = makeProject();
    const problems = scheduleDraftProblems(project, {
      name: "Spaces",
      source: "spaces",
      rowMode: "grouped",
      columns: [column("c1", "name")],
      filters: { categoryIds: [project.categories[0].id] },
      sort: [],
      totals: [],
    });
    expect(problems.map((problem) => problem.code)).toContain("inapplicableFilter");
  });
});

describe("revision cache", () => {
  it("reuses one result per revision and recomputes after a store change", () => {
    const project = makeProject();
    const def = definition();
    const first = cachedSchedule(7, project, def);
    const second = cachedSchedule(7, project, def);
    expect(second).toBe(first);
    lengthItem(project, { meters: 5 });
    const next = cachedSchedule(8, project, def);
    expect(next).not.toBe(first);
    expect(next.rowCount).toBe(1);
  });

  it("is bounded and clears explicitly", () => {
    const cache = createKeyCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    clearScheduleCache();
  });
});

describe("large schedules", () => {
  it("computes 1 000 rows quickly and virtualises the table window", () => {
    const project = makeProject();
    const wall = wallCategory(project);
    for (let index = 0; index < 1000; index += 1) {
      lengthItem(project, {
        meters: 1 + (index % 10),
        categoryId: wall,
        label: `Row ${index}`,
      });
    }
    const started = performance.now();
    const result = computeSchedule(
      project,
      definition({
        groupBy: "category",
        sort: [{ field: "value", direction: "asc" }],
        totals: [{ field: "value", op: "sum" }],
      }),
    );
    const elapsed = performance.now() - started;
    expect(result.rowCount).toBe(1000);
    expect(result.groups[0].rows).toHaveLength(1000);
    expect(elapsed).toBeLessThan(2000);

    const firstWindow = tableWindow(1000, 0, 280);
    expect(firstWindow.start).toBe(0);
    expect(firstWindow.end).toBeLessThanOrEqual(30);
    const scrolled = tableWindow(1000, 280 * 500, 280);
    expect(scrolled.start).toBeGreaterThan(400);
    expect(scrolled.end - scrolled.start).toBeLessThanOrEqual(26);
    expect(SCHEDULE_ROW_HEIGHT).toBe(28);
  });
});

function scheduleDraftFor(project: Project, id: string): ScheduleDraft {
  const stored = project.schedules.find((entry) => entry.id === id)!;
  return {
    id: stored.id,
    name: stored.name,
    source: stored.source,
    rowMode: stored.rowMode,
    columns: stored.columns.map((entry) => ({ ...entry })),
    filters: { ...stored.filters },
    sort: [],
    totals: [],
  };
}
