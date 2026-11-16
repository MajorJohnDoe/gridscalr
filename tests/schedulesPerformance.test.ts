import { describe, expect, it } from "vitest";
import {
  cachedSchedule,
  cachedSummary,
  clearScheduleCache,
  computeSummary,
  createKeyCache,
  layoutForItem,
  tableWindow,
} from "../src/features/schedules";
import {
  addItem,
  addLayer,
  createProject,
  defaultDocument,
  layersForKind,
} from "../src/model/layers";
import type { MarkupItem, Project, ScheduleDefinition } from "../src/model/types";
import { clearSummaryCache } from "../src/features/schedules/summary";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

/**
 * The summary and schedule performance targets from the Drift Slice 1 plan:
 * 15 000 items, summary under 100 ms and recompute under 250 ms. The measured
 * numbers are printed for the handover and the limitations table. The hard
 * ceiling is deliberately looser than the target so a slow CI runner records a
 * regression instead of a flaky failure; the documented target is asserted when
 * `GRIDSCALR_PERF_STRICT=1`.
 */

const ITEMS = 15_000;
const SCALE = { pointsPerMeter: 100, sourceUnit: "m" as const };
const NOW = "2026-01-01T00:00:00.000Z";
const strict = process.env.GRIDSCALR_PERF_STRICT === "1";

function buildProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 3)));
  project.settings.lengthUnit = "m";
  project.settings.areaUnit = "m2";
  const wall = project.categories.find((category) => category.name === "Wall")!;
  wall.summaryRole = "wall";
  const door = project.countTypes.find((type) => type.id === "door")!;
  door.summaryRole = "door";
  const layer = layersForKind(project, "measure")[0];
  const extra = addLayer(project, "measure", "Extra");
  for (let index = 0; index < ITEMS; index += 1) {
    const kind = index % 10 === 0 ? "area" : index % 10 === 1 ? "count" : "length";
    const page = (index % 3) + 1;
    const item: MarkupItem = {
      id: `item_${index}`,
      pageId: pageIdFor(page),
      kind,
      points:
        kind === "area"
          ? [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 100, y: 100 },
              { x: 0, y: 100 },
            ]
          : [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ],
      color: "#e30613",
      strokeWidth: 2,
      scale: { ...SCALE },
      categoryId: wall.id,
      label: `Item ${index}`,
      room: `Room ${index % 20}`,
      createdAt: NOW,
      updatedAt: NOW,
      ...(kind === "count" ? { countType: "door" as const, countQuantity: 2 } : {}),
    };
    addItem(project, index % 2 ? layer.id : extra.id, item);
  }
  return project;
}

function definition(): ScheduleDefinition {
  return {
    id: "sched_perf",
    name: "Reference",
    source: "measurements",
    rowMode: "items",
    columns: [
      { id: "c1", field: "label", visible: true },
      { id: "c2", field: "category", visible: true },
      { id: "c3", field: "room", visible: true },
      { id: "c4", field: "value", visible: true, format: "unit" },
      { id: "c5", field: "unit", visible: true },
    ],
    filters: { pageIds: [pageIdFor(1), pageIdFor(2)] },
    groupBy: "category",
    sort: [{ field: "value", direction: "desc" }],
    totals: [{ field: "value", op: "sum" }],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("schedule and summary budgets", () => {
  it("opens the summary and recomputes a 15 000-item schedule", () => {
    const project = buildProject();
    clearSummaryCache();
    clearScheduleCache();

    const summaryStart = performance.now();
    const summary = computeSummary(project);
    const summaryMs = performance.now() - summaryStart;
    cachedSummary(99, project);
    const warmStart = performance.now();
    cachedSummary(99, project);
    cachedSummary(99, project);
    const warmMs = performance.now() - warmStart;
    const scheduleStart = performance.now();
    const result = cachedSchedule(101, project, definition());
    const scheduleMs = performance.now() - scheduleStart;
    const cacheHitStart = performance.now();
    cachedSchedule(101, project, definition());
    const cacheHitMs = performance.now() - cacheHitStart;

    console.log(
      `schedules: summary ${summaryMs.toFixed(1)} ms cold, ${warmMs.toFixed(1)} ms for two ` +
        `cached reads; schedule ${scheduleMs.toFixed(1)} ms cold, ${cacheHitMs.toFixed(1)} ms ` +
        `from cache; ${result.rowCount} rows, ${summary.table.rows.length} table groups`,
    );

    expect(summary.cards).toHaveLength(4);
    expect(summary.table.rows.length).toBeGreaterThan(0);
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.groups.length).toBeGreaterThan(0);
    expect(summaryMs).toBeLessThan(strict ? 100 : 1500);
    expect(scheduleMs).toBeLessThan(strict ? 250 : 3000);
    expect(cacheHitMs).toBeLessThan(10);
  });

  it("lays out a placed table window from a large schedule", () => {
    const project = buildProject();
    clearScheduleCache();
    const result = cachedSchedule(303, project, definition());
    const item: MarkupItem = {
      id: "item_sched_perf",
      pageId: pageIdFor(1),
      kind: "schedule",
      points: [
        { x: 24, y: 24 },
        { x: 424, y: 260 },
      ],
      color: "#1a2024",
      strokeWidth: 1,
      scheduleId: "sched_perf",
      rowStart: 0,
      rowLimit: 25,
      showHeader: true,
      showTotals: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const measure = (text: string, size: number) => text.length * size * 0.5;
    const start = performance.now();
    const layout = layoutForItem(result, item, measure);
    const layoutMs = performance.now() - start;
    console.log(
      `placed table: ${layoutMs.toFixed(1)} ms layout for a ${result.rowCount}-row schedule, ` +
        `${layout.visibleRows} drawn row(s), overflow ${layout.overflowReason ?? "none"}`,
    );
    expect(layout.visibleRows).toBeLessThanOrEqual(25);
    expect(layout.overflow).toBe(true);
    expect(layoutMs).toBeLessThan(strict ? 50 : 1000);
  });

  it("virtualises a 1 000-row window to a bounded slice", () => {
    const total = 1000;
    const window = tableWindow(total, 28 * 500, 280, 28, 8);
    expect(window.end - window.start).toBeLessThanOrEqual(26);
    expect(window.start).toBeGreaterThan(400);
    const cache = createKeyCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
  });
});
