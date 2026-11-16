import { describe, expect, it } from "vitest";
import { buildScheduleCsvImport, serializeScheduleCsv } from "../src/features/schedules";
import { addItem, createProject, defaultDocument, layersForKind } from "../src/model/layers";
import type { MarkupItem, Project, ScheduleDefinition } from "../src/model/types";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

/**
 * The 10 000-row CSV budget from the Drift Slice 1 plan. The import plan is the
 * measured step: parse, header mapping, value validation and change detection.
 * The hard ceiling is looser than the documented target so a slow CI runner
 * records a regression instead of a flaky failure; the target is asserted when
 * `GRIDSCALR_PERF_STRICT=1`.
 */

const ROWS = 10_000;
const TARGET_MS = 1_500;
const CEILING_MS = 6_000;
const strict = process.env.GRIDSCALR_PERF_STRICT === "1";
const NOW = "2026-01-01T00:00:00.000Z";
const SCALE = { pointsPerMeter: 100, sourceUnit: "m" as const };

function buildProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 3)));
  project.fieldDefinitions.push({
    id: "field_note",
    key: "note",
    label: "Note",
    type: "text",
    scope: "measurement",
    order: 1,
  });
  const layer = layersForKind(project, "measure")[0];
  for (let index = 0; index < ROWS; index += 1) {
    const item: MarkupItem = {
      id: `item_${index}`,
      pageId: pageIdFor((index % 3) + 1),
      kind: "length",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      color: "#e30613",
      strokeWidth: 2,
      scale: { ...SCALE },
      label: `Wall ${index}`,
      room: `Room ${index % 20}`,
      custom: { field_note: `Note ${index}` },
      createdAt: NOW,
      updatedAt: NOW,
    };
    addItem(project, layer.id, item);
  }
  const schedule: ScheduleDefinition = {
    id: "sched_perf_csv",
    name: "Reference",
    source: "measurements",
    rowMode: "items",
    columns: [
      { id: "c1", field: "label", visible: true },
      { id: "c2", field: "room", visible: true },
      { id: "c3", field: "value", visible: true, format: "unit" },
      { id: "c4", field: "unit", visible: true },
      { id: "c5", field: "custom:field_note", visible: true },
    ],
    filters: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
  project.schedules.push(schedule);
  return project;
}

describe("schedule CSV 10 000 rows", () => {
  it("exports and plans an unchanged file within the measured budget", () => {
    const project = buildProject();
    const exportStart = performance.now();
    const csv = serializeScheduleCsv(project, "sched_perf_csv", {
      locale: "en",
      format: "locale",
    })!;
    const exportMs = performance.now() - exportStart;
    expect(csv.rowCount).toBe(ROWS);

    const planStart = performance.now();
    const plan = buildScheduleCsvImport(new TextEncoder().encode(csv.text), {
      project,
      scheduleId: "sched_perf_csv",
    });
    const planMs = performance.now() - planStart;
    expect(plan.blocked).toBeNull();
    expect(plan.totalRows).toBe(ROWS);
    expect(plan.changed).toHaveLength(0);
    expect(plan.unchanged).toHaveLength(ROWS);

    console.log(
      `schedule CSV ${ROWS} rows: export ${exportMs.toFixed(1)} ms, import plan ${planMs.toFixed(1)} ms`,
    );
    expect(exportMs).toBeLessThan(strict ? TARGET_MS : CEILING_MS);
    expect(planMs).toBeLessThan(strict ? TARGET_MS : CEILING_MS);
  });
});
