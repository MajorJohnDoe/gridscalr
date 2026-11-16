import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deletePage } from "../src/features/pageModel";
import { planRepair } from "../src/features/projectIntegrity/repairPlan";
import { parseProjectWithReport, serializeProject } from "../src/io/projectFile";
import { compareProjectShape, projectShape, validateProject } from "../src/model/integrity";
import type { Project } from "../src/model/types";

const SCHEMA_27 = readFileSync(
  new URL("../fixtures/legacy/schema-27.gridscalr", import.meta.url),
  "utf8",
);
const SCHEMA_28 = readFileSync(
  new URL("../fixtures/legacy/schema-28.gridscalr", import.meta.url),
  "utf8",
);

function rawFixture(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

function stableJson(project: Project): string {
  return JSON.stringify({ ...project, updatedAt: "fixed" });
}

function codes(project: Project): string[] {
  return validateProject(project).map((issue) => issue.code);
}

function findItem(project: Project, id: string) {
  for (const layer of project.layers) {
    const item = layer.items.find((entry) => entry.id === id);
    if (item) return item;
  }
  return undefined;
}

function measureLayer(raw: Record<string, unknown>): Record<string, unknown> {
  return (raw.layers as Array<Record<string, unknown>>).find(
    (layer) => layer.kind === "measure" && layer.id === "layer_measure",
  )!;
}

function findRawItem(raw: Record<string, unknown>, id: string): Record<string, unknown> {
  for (const layer of raw.layers as Array<Record<string, unknown>>) {
    const item = (layer.items as Array<Record<string, unknown>>).find((entry) => entry.id === id);
    if (item) return item;
  }
  throw new Error(`missing fixture item ${id}`);
}

describe("schema 27 → 28 migration", () => {
  it("adds empty arrays and default summary cards without inventing data", () => {
    const { project, report } = parseProjectWithReport(SCHEMA_27);
    expect(report.migratedFrom).toBe(27);
    expect(project.schemaVersion).toBe(28);
    expect(project.fieldDefinitions).toEqual([]);
    expect(project.fieldSets).toEqual([]);
    expect(project.spaces).toEqual([]);
    expect(project.schedules).toEqual([]);
    expect(project.settings.summary.cards).toEqual([
      { id: "rooms", visible: true },
      { id: "area", visible: true },
      { id: "wallLength", visible: true },
      { id: "doors", visible: true },
    ]);
    expect(project.categories.every((category) => category.summaryRole === undefined)).toBe(true);
    expect(project.countTypes.every((countType) => countType.summaryRole === undefined)).toBe(true);
    expect(
      project.layers
        .flatMap((layer) => layer.items)
        .every(
          (item) =>
            item.spaceId === undefined &&
            item.custom === undefined &&
            item.scheduleId === undefined,
        ),
    ).toBe(true);
    expect(codes(project)).toEqual([]);
  });

  it("ignores schema 28 fields in a pre-28 file and reports the placement", () => {
    const raw = rawFixture(SCHEMA_27);
    raw.fieldDefinitions = [
      { id: "field_old", key: "old", label: "Old", type: "text", scope: "measurement", order: 0 },
    ];
    raw.fieldSets = [
      { id: "fset_old", name: "Old", scope: "measurement", fieldIds: ["field_old"] },
    ];
    raw.spaces = [
      {
        id: "space_old",
        kind: "room",
        name: "Old room",
        areaMode: "measured",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    raw.schedules = [
      {
        id: "sched_old",
        name: "Old schedule",
        source: "spaces",
        rowMode: "items",
        columns: [],
        filters: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    (raw.settings as Record<string, unknown>).summary = {
      cards: [{ id: "rooms", visible: false }],
    };
    (raw.categories as Array<Record<string, unknown>>)[0].summaryRole = "floor";
    (raw.countTypes as Array<Record<string, unknown>>)[0].summaryRole = "door";
    const measure = measureLayer(raw);
    (measure.items as Array<Record<string, unknown>>).push({
      id: "item_schedule_old",
      pageId: "page_27_1",
      kind: "schedule",
      points: [
        { x: 300, y: 600 },
        { x: 500, y: 700 },
      ],
      color: "#e30613",
      strokeWidth: 2,
      scheduleId: "sched_old",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    findRawItem(raw, "item_measure").custom = { field_old: "x" };
    findRawItem(raw, "item_area").spaceId = "space_old";

    const { project, report } = parseProjectWithReport(JSON.stringify(raw));
    expect(project.fieldDefinitions).toEqual([]);
    expect(project.fieldSets).toEqual([]);
    expect(project.spaces).toEqual([]);
    expect(project.schedules).toEqual([]);
    expect(project.settings.summary.cards.every((card) => card.visible)).toBe(true);
    expect(project.categories[0].summaryRole).toBeUndefined();
    expect(project.countTypes[0].summaryRole).toBeUndefined();
    expect(findItem(project, "item_measure")?.custom).toBeUndefined();
    expect(findItem(project, "item_area")?.spaceId).toBeUndefined();
    expect(findItem(project, "item_schedule_old")).toBeUndefined();
    expect(report.dropped).toContainEqual({ code: "droppedSchedulePlacement", count: 1 });
  });
});

describe("schema 28 round trip and determinism", () => {
  it("round-trips every new entity, custom value and placement", () => {
    const first = parseProjectWithReport(SCHEMA_28).project;
    const roundTrip = parseProjectWithReport(serializeProject(first)).project;
    expect(roundTrip.fieldDefinitions).toEqual(first.fieldDefinitions);
    expect(roundTrip.fieldSets).toEqual(first.fieldSets);
    expect(roundTrip.spaces).toEqual(first.spaces);
    expect(roundTrip.schedules).toEqual(first.schedules);
    expect(roundTrip.settings.summary).toEqual(first.settings.summary);
    expect(findItem(roundTrip, "item_area")?.custom).toEqual({ field_fire: "EI30" });
    expect(findItem(roundTrip, "item_area")?.spaceId).toBe("space_room");
    expect(findItem(roundTrip, "item_schedule")?.scheduleId).toBe("sched_rooms");
    expect(compareProjectShape(first, roundTrip)).toEqual([]);
    expect(projectShape(first)).toMatchObject({
      fieldDefinitions: 2,
      fieldSets: 1,
      spaces: 1,
      schedules: 1,
      customValues: 2,
    });
    expect(stableJson(roundTrip)).toBe(stableJson(first));
  });

  it("migrates the schema 28 fixture deterministically", () => {
    const first = parseProjectWithReport(SCHEMA_28).project;
    const second = parseProjectWithReport(SCHEMA_28).project;
    expect(stableJson(second)).toBe(stableJson(first));
    expect(second.spaces).toEqual(first.spaces);
    expect(second.schedules).toEqual(first.schedules);
    expect(second.fieldDefinitions).toEqual(first.fieldDefinitions);
  });

  it("keeps dangling space, placement and custom references for the doctor", () => {
    const raw = rawFixture(SCHEMA_28);
    const space = (raw.spaces as Array<Record<string, unknown>>)[0];
    space.parentId = "space_missing";
    space.pageId = "page_missing";
    findRawItem(raw, "item_area").spaceId = "space_missing";
    findRawItem(raw, "item_schedule").scheduleId = "sched_missing";
    findRawItem(raw, "item_area").custom = {
      field_fire: "EI99",
      field_missing: "x",
    };

    const { project, report } = parseProjectWithReport(JSON.stringify(raw));
    expect(project.spaces[0].parentId).toBe("space_missing");
    expect(project.spaces[0].pageId).toBeUndefined();
    expect(report.repaired).toContainEqual({ code: "repairedSpacePage", count: 1 });
    expect(report.dropped).toContainEqual({ code: "droppedCustomValue", count: 2 });
    expect(findItem(project, "item_area")?.spaceId).toBe("space_missing");
    expect(findItem(project, "item_area")?.custom).toBeUndefined();
    expect(findItem(project, "item_schedule")?.scheduleId).toBe("sched_missing");
    expect(codes(project)).toEqual(
      expect.arrayContaining([
        "missingSpaceParent",
        "missingItemSpace",
        "missingSchedulePlacement",
      ]),
    );
  });

  it("repairs a repeated multi-enum value and reports it", () => {
    const raw = rawFixture(SCHEMA_28);
    (raw.fieldDefinitions as Array<Record<string, unknown>>).push({
      id: "field_grade",
      key: "grade",
      label: "Grade",
      type: "multiEnum",
      scope: "measurement",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      order: 1,
    });
    const area = findRawItem(raw, "item_area");
    area.custom = { field_fire: "EI30", field_grade: ["a", "a", "b"] };
    const { project, report } = parseProjectWithReport(JSON.stringify(raw));
    expect(findItem(project, "item_area")?.custom).toEqual({
      field_fire: "EI30",
      field_grade: ["a", "b"],
    });
    expect(report.repaired).toContainEqual({ code: "repairedCustomValue", count: 1 });
  });

  it("drops structurally invalid definitions, spaces, schedules and placements", () => {
    const raw = rawFixture(SCHEMA_28);
    (raw.fieldDefinitions as Array<Record<string, unknown>>).push(
      {
        id: "field_duplicate_id",
        key: "fire_class",
        label: "Duplicate key",
        type: "text",
        scope: "measurement",
        order: 2,
      },
      {
        id: "field_fire",
        key: "another_key",
        label: "Duplicate id",
        type: "text",
        scope: "measurement",
        order: 3,
      },
    );
    (raw.categories as Array<Record<string, unknown>>)[0].summaryRole = "nope";
    (raw.countTypes as Array<Record<string, unknown>>)[0].summaryRole = "nope";
    (raw.spaces as Array<Record<string, unknown>>).push({
      id: "space_bad",
      kind: "room",
      areaMode: "measured",
    });
    (raw.schedules as Array<Record<string, unknown>>).push({
      id: "sched_bad",
      name: "Bad schedule",
      source: "unknown",
      rowMode: "items",
    });
    delete findRawItem(raw, "item_schedule").scheduleId;
    const { project, report } = parseProjectWithReport(JSON.stringify(raw));
    expect(project.fieldDefinitions).toHaveLength(3);
    expect(project.fieldDefinitions[2].id).toBe("field_fire_2");
    expect(project.spaces.map((space) => space.id)).not.toContain("space_bad");
    expect(project.schedules.map((schedule) => schedule.id)).not.toContain("sched_bad");
    expect(findItem(project, "item_schedule")).toBeUndefined();
    expect(report.repaired).toContainEqual({ code: "repairedFieldId", count: 1 });
    expect(report.dropped).toEqual(
      expect.arrayContaining([
        { code: "droppedFieldDefinition", count: 1 },
        { code: "droppedSpace", count: 1 },
        { code: "droppedSchedule", count: 1 },
        { code: "droppedSchedulePlacement", count: 1 },
        { code: "droppedCategorySummaryRole", count: 1 },
        { code: "droppedCountTypeSummaryRole", count: 1 },
      ]),
    );
  });
});

describe("schema 28 integrity rules", () => {
  it("reports invalid field, space, schedule, placement and summary data", () => {
    const project = parseProjectWithReport(SCHEMA_28).project;
    project.fieldDefinitions[0].defaultValue = "EI99";
    project.fieldDefinitions[0].options = [
      { id: "EI30", label: "A" },
      { id: "EI30", label: "B" },
    ];
    project.fieldDefinitions[1].validation = { min: 9, max: 1 };
    project.fieldSets[0].fieldIds.push("field_missing");
    project.spaces[0].areaMode = "manual";
    delete project.spaces[0].areaM2;
    project.spaces.push({
      ...project.spaces[0],
      id: "space_duplicate_number",
      name: "Second room",
      areaM2: 10,
    });
    project.categories[0].summaryRole = "nope" as never;
    project.countTypes[0].summaryRole = "nope" as never;
    project.schedules[0].columns.push({ ...project.schedules[0].columns[0] });
    project.schedules[0].filters = { pageIds: ["page_missing"] };
    const placement = findItem(project, "item_schedule")!;
    placement.rowStart = -1;
    placement.scheduleId = "sched_missing";
    project.settings.summary.cards = [{ id: "rooms", visible: true }];

    expect(codes(project)).toEqual(
      expect.arrayContaining([
        "invalidFieldDefault",
        "invalidFieldOptions",
        "invalidFieldValidation",
        "missingFieldSetField",
        "missingSpaceArea",
        "duplicateSpaceNumber",
        "invalidCategorySummaryRole",
        "invalidCountTypeSummaryRole",
        "duplicateScheduleColumn",
        "missingScheduleFilterPage",
        "missingSchedulePlacement",
        "invalidScheduleRowRange",
        "invalidSummarySettings",
      ]),
    );
  });

  it("does not accept a room's page link after the page is deleted", () => {
    const project = parseProjectWithReport(SCHEMA_28).project;
    const pageId = project.pages[0].id;
    expect(project.spaces[0].pageId).toBe(pageId);
    const summary = deletePage(project, pageId)!;
    expect(summary.clearedSpaces).toBe(1);
    expect(project.spaces).toHaveLength(1);
    expect(project.spaces[0].pageId).toBeUndefined();
    expect(codes(project)).not.toContain("missingSpacePage");
  });
});

describe("schema 28 project doctor", () => {
  it("renames duplicate IDs and clears only deterministic dangling links", () => {
    const project = parseProjectWithReport(SCHEMA_28).project;
    project.fieldDefinitions.push({ ...project.fieldDefinitions[0] });
    project.spaces.push({ ...project.spaces[0] });
    project.schedules.push({ ...project.schedules[0] });
    project.spaces[0].parentId = "space_missing";
    project.spaces[0].custom = { field_missing: 1 };
    project.fieldSets[0].fieldIds.push("field_missing");
    project.schedules[0].filters = { pageIds: ["page_missing"] };
    const area = findItem(project, "item_area")!;
    area.spaceId = "space_missing";
    const placement = findItem(project, "item_schedule")!;
    placement.scheduleId = "sched_missing";

    const beforeSpaces = project.spaces.length;
    const beforeSchedules = project.schedules.length;
    const beforeFields = project.fieldDefinitions.length;
    const run = planRepair(project, ["duplicateIds", "danglingReferences"]);
    expect(run.plan.changes.length).toBeGreaterThan(0);
    expect(run.project.spaces).toHaveLength(beforeSpaces);
    expect(run.project.schedules).toHaveLength(beforeSchedules);
    expect(run.project.fieldDefinitions).toHaveLength(beforeFields);
    expect(run.project.spaces[0].parentId).toBeUndefined();
    expect(run.project.spaces[0].custom).toBeUndefined();
    expect(run.project.fieldSets[0].fieldIds).not.toContain("field_missing");
    expect(run.project.schedules[0].filters.pageIds).toBeUndefined();
    expect(findItem(run.project, "item_area")?.spaceId).toBeUndefined();
    expect(findItem(run.project, "item_schedule")).toBeUndefined();
    expect(codes(run.project)).not.toEqual(
      expect.arrayContaining([
        "duplicateFieldDefinitionId",
        "duplicateSpaceId",
        "duplicateScheduleId",
        "missingSpaceParent",
        "missingCustomField",
        "missingFieldSetField",
        "missingScheduleFilterPage",
        "missingItemSpace",
        "missingSchedulePlacement",
      ]),
    );
  });
});
