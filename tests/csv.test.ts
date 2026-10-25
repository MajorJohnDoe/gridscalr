import { describe, expect, it } from "vitest";
import { createManualCalibration } from "../src/model/calibration";
import {
  addItem,
  createDefaultLayers,
  createProject,
  defaultDocument,
  layersForKind,
} from "../src/model/layers";
import type { MarkupItem, Project } from "../src/model/types";
import { buildQuantityReport } from "../src/report/reportModel";
import { QUANTITY_CSV_COLUMNS, serializeQuantityCsv } from "../src/report/csv";

const NOW = "2026-01-01T00:00:00.000Z";
const GENERATED = "2026-10-22T12:00:00.000Z";
const SCALE = { pointsPerMeter: 100, sourceUnit: "m" as const };

function makeProject(): Project {
  const project = createProject(defaultDocument("plan, final.pdf", 2), createDefaultLayers());
  project.name = "Example, project";
  project.documents[0].sha256 = "abc123";
  project.settings.lengthUnit = "m";
  project.settings.areaUnit = "m2";
  project.settings.quantity.wastePercent = 10;
  project.settings.quantity.roundingStep = 0.5;
  return project;
}

function add(
  project: Project,
  kind: "length" | "area" | "count",
  extra: Partial<MarkupItem> = {},
): MarkupItem {
  const item: MarkupItem = {
    id: `item_${Math.random().toString(36).slice(2)}`,
    page: 1,
    kind,
    points:
      kind === "count"
        ? [{ x: 40, y: 40 }]
        : [
            { x: 10, y: 10 },
            { x: 110, y: 10 },
            { x: 110, y: 110 },
            { x: 10, y: 110 },
          ],
    color: "#4cc9f0",
    strokeWidth: 2,
    scale: kind === "count" ? null : { ...SCALE },
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
  addItem(project, layersForKind(project, "measure")[0].id, item);
  return item;
}

function categoryId(project: Project, name: string): string {
  const category = project.categories.find((entry) => entry.name === name);
  if (!category) throw new Error(`Missing category ${name}`);
  return category.id;
}

describe("quantity CSV", () => {
  it("reports a manual drawing scale as 1:N", () => {
    const project = makeProject();
    project.pages["1"] = { calibration: createManualCalibration(100) };
    project.pages["2"] = { calibration: createManualCalibration(100) };
    const report = buildQuantityReport(project, { generatedAt: GENERATED });
    expect(report.scaleSummary).toBe("All pages · 1:100");
  });

  it("writes the specified columns, decimal formats, and escaping", () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    const room = 'Room, "A"';
    add(project, "area", { categoryId: floor, room });
    add(project, "count", { categoryId: floor, room, countType: "door" });

    const report = buildQuantityReport(project, { generatedAt: GENERATED });
    const csv = serializeQuantityCsv(report);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(QUANTITY_CSV_COLUMNS.join(","));
    expect(lines[1]).toBe(
      'Floor,"Room, ""A""",area,m²,1.000,0.000,1.000,10.000,0.100,0.500,1.500,1',
    );
    expect(lines[2]).toBe('Floor,"Room, ""A""",count,pcs,1,0,1,10.000,0.100,0.500,2,1');
  });

  it("puts metadata after two blank lines and escapes project metadata", () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    add(project, "length", { categoryId: floor, room: "A" });

    const csv = serializeQuantityCsv(buildQuantityReport(project, { generatedAt: GENERATED }));
    const lines = csv.slice(1).split("\r\n");
    const firstBlank = lines.indexOf("");
    expect(lines[firstBlank + 1]).toBe("");
    expect(lines[firstBlank + 2]).toBe('project,"Example, project"');
    expect(lines.slice(firstBlank + 2, firstBlank + 7)).toEqual([
      'project,"Example, project"',
      'document,"plan, final.pdf"',
      "document_sha256,abc123",
      `generated_at,${GENERATED}`,
      "hidden_excluded,false",
    ]);
  });

  it("reports when hidden measurements were excluded", () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    add(project, "length", { categoryId: floor, room: "A", visible: false });

    const csv = serializeQuantityCsv(buildQuantityReport(project, { generatedAt: GENERATED }));
    expect(csv).toContain("hidden_excluded,true");
    expect(csv).not.toContain("A,length");
  });

  it("does not mutate the project", () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    add(project, "area", { categoryId: floor, room: "A" });
    const before = JSON.stringify(project);
    serializeQuantityCsv(buildQuantityReport(project, { generatedAt: GENERATED }));
    expect(JSON.stringify(project)).toBe(before);
  });
});
