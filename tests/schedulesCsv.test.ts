import { describe, expect, it } from "vitest";
import {
  applyScheduleCsvImport,
  buildScheduleCsvImport,
  planScheduleCsvImport,
  serializeScheduleCsv,
  MAX_SCHEDULE_CSV_ROWS,
} from "../src/features/schedules";
import { MAX_SCHEDULE_CSV_BYTES } from "../src/io/limits";
import { addItem, createProject, defaultDocument, layersForKind } from "../src/model/layers";
import type {
  FieldDefinition,
  MarkupItem,
  Project,
  ScheduleDefinition,
  Space,
} from "../src/model/types";
import { store } from "../src/state/store";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";
const SCALE = { pointsPerMeter: 100, sourceUnit: "m" as const };

const FIELDS: FieldDefinition[] = [
  {
    id: "field_note",
    key: "note",
    label: "Note",
    type: "text",
    scope: "measurement",
    order: 1,
  },
  {
    id: "field_level",
    key: "level",
    label: "Level",
    type: "number",
    scope: "measurement",
    order: 2,
    validation: { min: 0, max: 10 },
  },
  {
    id: "field_fire",
    key: "fire",
    label: "Fire class",
    type: "enum",
    scope: "measurement",
    order: 3,
    options: [
      { id: "f30", label: "F30" },
      { id: "f60", label: "F60" },
    ],
  },
  {
    id: "field_tags",
    key: "tags",
    label: "Tags",
    type: "multiEnum",
    scope: "measurement",
    order: 4,
    options: [
      { id: "alpha", label: "Alpha" },
      { id: "beta", label: "Beta" },
    ],
  },
  {
    id: "field_ok",
    key: "ok",
    label: "Checked",
    type: "boolean",
    scope: "measurement",
    order: 5,
  },
  {
    id: "field_date",
    key: "date",
    label: "Inspected",
    type: "date",
    scope: "measurement",
    order: 6,
  },
];

function makeProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 2)));
  project.settings.lengthUnit = "m";
  project.settings.areaUnit = "m2";
  project.fieldDefinitions.push(...FIELDS.map((field) => ({ ...field })));
  return project;
}

function addItemToProject(
  project: Project,
  id: string,
  options: {
    label?: string;
    room?: string;
    meters?: number;
    custom?: MarkupItem["custom"];
    kind?: MarkupItem["kind"];
  } = {},
): MarkupItem {
  const item: MarkupItem = {
    id,
    pageId: pageIdFor(1),
    kind: options.kind ?? "length",
    points: [
      { x: 0, y: 0 },
      { x: (options.meters ?? 1) * 100, y: 0 },
    ],
    color: "#e30613",
    strokeWidth: 2,
    scale: { ...SCALE },
    createdAt: NOW,
    updatedAt: NOW,
    ...(options.label !== undefined ? { label: options.label } : {}),
    ...(options.room !== undefined ? { room: options.room } : {}),
    ...(options.custom ? { custom: options.custom } : {}),
  };
  addItem(project, layersForKind(project, "measure")[0].id, item);
  return item;
}

function customValues(): MarkupItem["custom"] {
  return {
    field_note: "North wall",
    field_level: 2.5,
    field_fire: "f30",
    field_tags: ["alpha", "beta"],
    field_ok: true,
    field_date: "2026-01-01",
  };
}

function measurementSchedule(project: Project, overrides: Partial<ScheduleDefinition> = {}) {
  const schedule: ScheduleDefinition = {
    id: "sched_csv",
    name: "Walls",
    source: "measurements",
    rowMode: "items",
    columns: [
      { id: "c1", field: "label", visible: true },
      { id: "c2", field: "room", visible: true },
      { id: "c3", field: "value", visible: true, format: "unit" },
      { id: "c4", field: "unit", visible: true },
      { id: "c5", field: "custom:field_note", visible: true },
      { id: "c6", field: "custom:field_level", visible: true },
      { id: "c7", field: "custom:field_fire", visible: true },
      { id: "c8", field: "custom:field_tags", visible: true },
      { id: "c9", field: "custom:field_ok", visible: true },
      { id: "c10", field: "custom:field_date", visible: true },
    ],
    filters: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
  project.schedules.push(schedule);
  return schedule;
}

function space(project: Project, id: string, name: string, extra: Partial<Space> = {}): Space {
  const entry: Space = {
    id,
    kind: "room",
    name,
    number: "101",
    floor: "1",
    usage: "Office",
    status: "Active",
    areaMode: "manual",
    areaM2: 12.5,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
  project.spaces.push(entry);
  return entry;
}

function spaceSchedule(project: Project) {
  const schedule: ScheduleDefinition = {
    id: "sched_spaces",
    name: "Rooms",
    source: "spaces",
    rowMode: "items",
    columns: [
      { id: "c1", field: "number", visible: true },
      { id: "c2", field: "name", visible: true },
      { id: "c3", field: "floor", visible: true },
      { id: "c4", field: "usage", visible: true },
      { id: "c5", field: "status", visible: true },
      { id: "c6", field: "area", visible: true, format: "unit" },
    ],
    filters: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
  project.schedules.push(schedule);
  return schedule;
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function lines(text: string): string[] {
  return text.replace(/^\uFEFF/, "").split("\r\n");
}

function baseProject(): { project: Project; schedule: ScheduleDefinition } {
  const project = makeProject();
  addItemToProject(project, "item_a", {
    label: "Wall A",
    room: "R1",
    meters: 1.5,
    custom: customValues(),
  });
  addItemToProject(project, "item_b", {
    label: "Wall B",
    room: "R2",
    meters: 2,
    custom: { field_note: "South wall", field_level: 4 },
  });
  return { project, schedule: measurementSchedule(project) };
}

describe("schedule CSV export", () => {
  it("writes the stable ID, Typ and Label [key] headers with a BOM", () => {
    const { project } = baseProject();
    const exported = serializeScheduleCsv(project, "sched_csv", { locale: "en", format: "locale" });
    expect(exported).not.toBeNull();
    const csv = exported!;
    expect(csv.text.startsWith("\uFEFF")).toBe(true);
    expect(csv.importable).toBe(true);
    expect(csv.headers).toEqual([
      "ID",
      "Typ",
      "Label [label]",
      "Room [room]",
      "Value [value]",
      "Unit [unit]",
      "Note [custom:field_note]",
      "Level [custom:field_level]",
      "Fire class [custom:field_fire]",
      "Tags [custom:field_tags]",
      "Checked [custom:field_ok]",
      "Inspected [custom:field_date]",
    ]);
    const rows = lines(csv.text);
    expect(rows[0]).toBe(csv.headers.join(","));
    expect(rows[1].startsWith("item_a,item,Wall A,R1,1.5,m,North wall,2.5,F30")).toBe(true);
    expect(csv.rowCount).toBe(2);
    expect(csv.text).not.toMatch(/(?<!\r)\n/);
  });

  it("uses the Swedish locale delimiter and decimal comma", () => {
    const { project } = baseProject();
    const csv = serializeScheduleCsv(project, "sched_csv", { locale: "sv", format: "locale" })!;
    expect(csv.delimiter).toBe(";");
    const rows = lines(csv.text);
    expect(rows[0].startsWith("ID;Typ;Label [label];")).toBe(true);
    expect(rows[1]).toContain("R1;1,5;m;North wall;2,5;F30");
  });

  it("escapes formula-leading text and keeps numbers numeric", () => {
    const project = makeProject();
    addItemToProject(project, "item_formula", {
      label: "=SUM(A1)",
      room: "+1",
      meters: 1,
      custom: { field_note: "@cmd", field_level: -2 },
    });
    measurementSchedule(project);
    const csv = serializeScheduleCsv(project, "sched_csv", { locale: "en", format: "locale" })!;
    const data = lines(csv.text)[1];
    expect(data).toContain("'=SUM(A1)");
    expect(data).toContain("'+1");
    expect(data).toContain("'@cmd");
    expect(data).toContain(",1,m,");
    expect(data).toContain(",-2,");
  });

  it("marks a grouped schedule read-only", () => {
    const { project } = baseProject();
    const grouped = measurementSchedule(project, {
      id: "sched_grouped",
      rowMode: "grouped",
      groupBy: "room",
      columns: [
        { id: "g1", field: "room", visible: true },
        { id: "g2", field: "value", visible: true, format: "unit" },
      ],
      totals: [{ field: "value", op: "sum" }],
    });
    const csv = serializeScheduleCsv(project, grouped.id, { locale: "en", format: "locale" })!;
    expect(csv.importable).toBe(false);
    expect(csv.rowMode).toBe("grouped");
    expect(lines(csv.text)[1]).toMatch(/^,group,/);
  });
});

describe("schedule CSV import", () => {
  it("round-trips an unchanged export with no conflicts and no stored change", () => {
    const { project } = baseProject();
    const csv = serializeScheduleCsv(project, "sched_csv", { locale: "sv", format: "locale" })!;
    const plan = buildScheduleCsvImport(bytes(csv.text), { project, scheduleId: "sched_csv" });
    expect(plan.blocked).toBeNull();
    expect(plan.delimiter).toBe(";");
    expect(plan.bom).toBe(true);
    expect(plan.totalRows).toBe(2);
    expect(plan.changed).toHaveLength(0);
    expect(plan.unchanged).toHaveLength(2);
    expect(plan.rejected).toHaveLength(0);
    expect(plan.issues).toHaveLength(0);
    expect(plan.missingRowCount).toBe(0);
    const before = JSON.stringify(project);
    const result = applyScheduleCsvImport(project, plan, { now: NOW });
    expect(result).toEqual({ applied: 0, skipped: 0 });
    expect(JSON.stringify(project)).toBe(before);
  });

  it("imports a changed cell with before and after values in one undo step", () => {
    const { project } = baseProject();
    const csv = serializeScheduleCsv(project, "sched_csv", { locale: "en", format: "locale" })!;
    const edited = csv.text.replace(",Wall A,", ",Wall A edited,");
    const plan = buildScheduleCsvImport(bytes(edited), { project, scheduleId: "sched_csv" });
    expect(plan.changed).toHaveLength(1);
    expect(plan.changed[0].id).toBe("item_a");
    expect(plan.changed[0].updates).toEqual([
      {
        field: "label",
        label: "Label",
        before: "Wall A",
        after: "Wall A edited",
        kind: "builtIn",
        value: "Wall A edited",
      },
    ]);
    store.setProject(project, null);
    expect(store.canUndo).toBe(false);
    store.mutate((target) => {
      applyScheduleCsvImport(target, plan, { now: NOW });
    });
    expect(
      store.project!.layers.flatMap((layer) => layer.items).find((item) => item.id === "item_a")
        ?.label,
    ).toBe("Wall A edited");
    expect(store.canUndo).toBe(true);
    store.undo();
    expect(
      store.project!.layers.flatMap((layer) => layer.items).find((item) => item.id === "item_a")
        ?.label,
    ).toBe("Wall A");
  });

  it("reports unknown fields, unknown IDs, duplicate IDs and invalid values", () => {
    const { project } = baseProject();
    const text = [
      "ID,Typ,Label [label],Mystery [mystery],Note [custom:field_note],Level [custom:field_level],Fire class [custom:field_fire]",
      "item_a,item,Wall A,,ok,not-a-number,F99",
      "item_missing,item,Missing,,,",
      "item_b,item,Wall B,,ok,3,F30",
      "item_b,item,Wall B again,,ok,3,F30",
      "item_c,item,Wrong type,,,",
      ",item,No id,,,",
    ].join("\r\n");
    const plan = planScheduleCsvImport(text, { project, scheduleId: "sched_csv" });
    expect(plan.blocked).toBeNull();
    expect(plan.issues.map((entry) => entry.code)).toContain("unknownField");
    expect(plan.rejected.map((row) => row.id)).toEqual([
      "item_a",
      "item_missing",
      "item_b",
      "item_b",
      "item_c",
      "",
    ]);
    const codes = plan.rejected.flatMap((row) => row.issues.map((entry) => entry.code));
    expect(codes).toContain("invalidValue");
    expect(codes).toContain("unknownId");
    expect(codes).toContain("duplicateId");
    expect(codes).toContain("missingId");
    expect(plan.changed).toHaveLength(0);
  });

  it("never applies an invalid enum option or number", () => {
    const { project } = baseProject();
    const text = [
      "ID,Typ,Fire class [custom:field_fire],Level [custom:field_level]",
      "item_b,item,F99,3",
      "item_a,item,F30,abc",
    ].join("\r\n");
    const plan = planScheduleCsvImport(text, { project, scheduleId: "sched_csv" });
    expect(plan.rejected).toHaveLength(2);
    for (const row of plan.rejected) {
      expect(row.updates).toEqual([]);
      expect(row.issues.some((entry) => entry.code === "invalidValue")).toBe(true);
    }
    const before = JSON.stringify(project);
    expect(applyScheduleCsvImport(project, plan, { now: NOW })).toEqual({ applied: 0, skipped: 0 });
    expect(JSON.stringify(project)).toBe(before);
  });

  it("lists read-only columns instead of importing them", () => {
    const { project } = baseProject();
    const text = ["ID,Typ,Value [value],Unit [unit]", "item_a,item,999,mm"].join("\r\n");
    const plan = planScheduleCsvImport(text, { project, scheduleId: "sched_csv" });
    expect(plan.changed).toHaveLength(0);
    expect(plan.readOnlyColumns.map((column) => column.field)).toEqual(["value", "unit"]);
    expect(plan.rejected).toHaveLength(0);
  });

  it("refuses a grouped schedule and a grouped export", () => {
    const { project } = baseProject();
    const grouped = measurementSchedule(project, {
      id: "sched_grouped",
      rowMode: "grouped",
      groupBy: "room",
      columns: [
        { id: "g1", field: "room", visible: true },
        { id: "g2", field: "value", visible: true, format: "unit" },
      ],
    });
    const groupedCsv = serializeScheduleCsv(project, grouped.id, {
      locale: "en",
      format: "locale",
    })!;
    const blocked = buildScheduleCsvImport(bytes(groupedCsv.text), {
      project,
      scheduleId: "sched_grouped",
    });
    expect(blocked.blocked).toBe("groupedSchedule");
    expect(blocked.changed).toHaveLength(0);
    const wrongType = buildScheduleCsvImport(bytes(groupedCsv.text), {
      project,
      scheduleId: "sched_csv",
    });
    expect(wrongType.rejected.length).toBeGreaterThan(0);
    expect(wrongType.rejected[0].issues[0].code).toBe("wrongType");
  });

  it("refuses an over-limit file and an over-limit row count before parsing values", () => {
    const { project } = baseProject();
    const tooLarge = new Uint8Array(MAX_SCHEDULE_CSV_BYTES + 1);
    expect(buildScheduleCsvImport(tooLarge, { project, scheduleId: "sched_csv" }).blocked).toBe(
      "tooLarge",
    );
    const rows = ["ID,Typ,Label [label]"];
    for (let index = 0; index <= MAX_SCHEDULE_CSV_ROWS; index += 1) {
      rows.push(`item_${index},item,Row ${index}`);
    }
    const tooMany = planScheduleCsvImport(rows.join("\r\n"), {
      project,
      scheduleId: "sched_csv",
    });
    expect(tooMany.blocked).toBe("tooManyRows");
    expect(tooMany.totalRows).toBe(MAX_SCHEDULE_CSV_ROWS + 1);
  });

  it("rejects non-UTF-8 bytes and a missing header", () => {
    const { project } = baseProject();
    expect(
      buildScheduleCsvImport(new Uint8Array([0xff, 0xfe, 0x00]), {
        project,
        scheduleId: "sched_csv",
      }).blocked,
    ).toBe("notUtf8");
    expect(
      planScheduleCsvImport("Label,Typ\r\nWall,item", {
        project,
        scheduleId: "sched_csv",
      }).blocked,
    ).toBe("missingHeader");
  });

  it("detects comma and semicolon files without a BOM", () => {
    const { project } = baseProject();
    const comma = "ID,Typ,Label [label]\r\nitem_a,item,Comma wall\r\n";
    const semicolon = "ID;Typ;Label [label]\r\nitem_a;item;Semicolon wall\r\n";
    const first = planScheduleCsvImport(comma, { project, scheduleId: "sched_csv" });
    const second = planScheduleCsvImport(semicolon, { project, scheduleId: "sched_csv" });
    expect(first.delimiter).toBe(",");
    expect(first.bom).toBe(false);
    expect(first.changed[0].updates[0].value).toBe("Comma wall");
    expect(second.delimiter).toBe(";");
    expect(second.changed[0].updates[0].value).toBe("Semicolon wall");
  });

  it("round-trips custom types by label and typed value", () => {
    const { project } = baseProject();
    const csv = serializeScheduleCsv(project, "sched_csv", { locale: "en", format: "locale" })!;
    const unchanged = buildScheduleCsvImport(bytes(csv.text), {
      project,
      scheduleId: "sched_csv",
    });
    expect(unchanged.changed).toHaveLength(0);

    const edited = csv.text
      .replace(",F30,Alpha; Beta,true,2026-01-01", ",F60,Beta,no,2026-02-02")
      .replace(",2.5,", ",3.5,");
    const plan = buildScheduleCsvImport(bytes(edited), { project, scheduleId: "sched_csv" });
    expect(plan.changed).toHaveLength(1);
    const fields = plan.changed[0].updates.map((update) => update.field);
    expect(fields).toEqual([
      "custom:field_level",
      "custom:field_fire",
      "custom:field_tags",
      "custom:field_ok",
      "custom:field_date",
    ]);
    store.setProject(project, null);
    store.mutate((target) => {
      applyScheduleCsvImport(target, plan, { now: NOW });
    });
    const item = store
      .project!.layers.flatMap((layer) => layer.items)
      .find((entry) => entry.id === "item_a")!;
    expect(item.custom).toEqual({
      field_note: "North wall",
      field_level: 3.5,
      field_fire: "f60",
      field_tags: ["beta"],
      field_ok: false,
      field_date: "2026-02-02",
    });
  });

  it("imports a formula-looking value literally and unguards the exported form", () => {
    const { project } = baseProject();
    const csv = serializeScheduleCsv(project, "sched_csv", { locale: "en", format: "locale" })!;
    const guarded = csv.text.replace(",North wall,", ",'=SUM(A1),");
    const plan = buildScheduleCsvImport(bytes(guarded), { project, scheduleId: "sched_csv" });
    expect(plan.changed).toHaveLength(1);
    expect(plan.changed[0].updates[0].field).toBe("custom:field_note");
    expect(plan.changed[0].updates[0].after).toBe("=SUM(A1)");
    store.setProject(project, null);
    store.mutate((target) => {
      applyScheduleCsvImport(target, plan, { now: NOW });
    });
    const item = store
      .project!.layers.flatMap((layer) => layer.items)
      .find((entry) => entry.id === "item_a")!;
    expect(item.custom?.field_note).toBe("=SUM(A1)");
  });

  it("updates a space by stable ID", () => {
    const project = makeProject();
    space(project, "space_a", "Kitchen");
    spaceSchedule(project);
    const csv = serializeScheduleCsv(project, "sched_spaces", {
      locale: "en",
      format: "locale",
    })!;
    const edited = csv.text.replace(",1,Office,", ",2,Storage,");
    const plan = buildScheduleCsvImport(bytes(edited), {
      project,
      scheduleId: "sched_spaces",
    });
    expect(plan.changed).toHaveLength(1);
    store.setProject(project, null);
    store.mutate((target) => {
      applyScheduleCsvImport(target, plan, { now: NOW });
    });
    const updated = store.project!.spaces.find((entry) => entry.id === "space_a")!;
    expect(updated.floor).toBe("2");
    expect(updated.usage).toBe("Storage");
    expect(updated.updatedAt).toBe(NOW);
  });

  it("maps a duplicate header to the first column and reports it", () => {
    const { project } = baseProject();
    const text = ["ID,Typ,Label [label],Label [label]", "item_a,item,First name,Second name"].join(
      "\r\n",
    );
    const plan = planScheduleCsvImport(text, { project, scheduleId: "sched_csv" });
    expect(plan.issues.some((entry) => entry.code === "duplicateHeader")).toBe(true);
    expect(plan.changed).toHaveLength(1);
    expect(plan.changed[0].updates[0].value).toBe("First name");
  });

  it("leaves rows that are absent from the file untouched", () => {
    const { project } = baseProject();
    const text = ["ID,Typ,Label [label]", "item_a,item,Wall A"].join("\r\n");
    const plan = planScheduleCsvImport(text, { project, scheduleId: "sched_csv" });
    expect(plan.changed).toHaveLength(0);
    expect(plan.missingRowCount).toBe(1);
  });

  it("preserves a literal leading apostrophe that looks like a guard", () => {
    const project = makeProject();
    addItemToProject(project, "item_quote", { label: "'=SUM(A1)" });
    measurementSchedule(project);
    const csv = serializeScheduleCsv(project, "sched_csv", { locale: "en", format: "locale" })!;
    expect(lines(csv.text)[1]).toContain("''=SUM(A1)");
    const plan = buildScheduleCsvImport(bytes(csv.text), { project, scheduleId: "sched_csv" });
    expect(plan.changed).toHaveLength(0);
    expect(plan.unchanged).toHaveLength(1);
  });

  it("never creates an entity from an unknown ID", () => {
    const project = makeProject();
    measurementSchedule(project);
    const text = "ID,Typ,Label [label]\r\nitem_new,item,New wall\r\n";
    const plan = planScheduleCsvImport(text, { project, scheduleId: "sched_csv" });
    expect(plan.rejected[0].issues[0].code).toBe("unknownId");
    expect(plan.changed).toHaveLength(0);
    expect(project.layers.flatMap((layer) => layer.items)).toHaveLength(0);
  });

  it("applies a multi-row import as one undo step", () => {
    const { project } = baseProject();
    const csv = serializeScheduleCsv(project, "sched_csv", { locale: "en", format: "locale" })!;
    const edited = csv.text.replace(",Wall A,", ",Wall A2,").replace(",Wall B,", ",Wall B2,");
    const plan = buildScheduleCsvImport(bytes(edited), { project, scheduleId: "sched_csv" });
    expect(plan.changed).toHaveLength(2);
    store.setProject(project, null);
    store.mutate((target) => {
      applyScheduleCsvImport(target, plan, { now: NOW });
    });
    expect(store.project!.layers.flatMap((layer) => layer.items).map((item) => item.label)).toEqual(
      ["Wall A2", "Wall B2"],
    );
    expect(store.canUndo).toBe(true);
    store.undo();
    expect(store.project!.layers.flatMap((layer) => layer.items).map((item) => item.label)).toEqual(
      ["Wall A", "Wall B"],
    );
  });
});
