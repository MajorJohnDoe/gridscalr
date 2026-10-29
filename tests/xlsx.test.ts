import { strFromU8, unzipSync } from "fflate";
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
import { exportQuantityWorkbook } from "../src/report/xlsx";

const NOW = "2026-01-01T00:00:00.000Z";
const GENERATED = "2026-10-22T12:00:00.000Z";

function makeProject(): Project {
  const project = createProject(defaultDocument("Plan.pdf", 2), createDefaultLayers());
  project.name = "Example project";
  project.documents[0].sha256 = "abc123";
  project.settings.lengthUnit = "m";
  project.settings.areaUnit = "m2";
  project.pages["1"] = {
    name: "Ground floor",
    building: "House A",
    floor: "Level 1",
    calibration: createManualCalibration(100),
  };
  project.pages["2"] = { calibration: createManualCalibration(100) };
  return project;
}

function add(project: Project, kind: "length" | "area" | "count", extra: Partial<MarkupItem> = {}) {
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
    label: `${kind} label`,
    scale: kind === "count" ? null : { pointsPerMeter: 100, sourceUnit: "m" },
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
  addItem(project, layersForKind(project, "measure")[0].id, item);
}

function workbook(project: Project) {
  const report = buildQuantityReport(project, { generatedAt: GENERATED });
  return unzipSync(exportQuantityWorkbook(project, report));
}

function sheet(files: Record<string, Uint8Array>, index: number): string {
  return strFromU8(files[`xl/worksheets/sheet${index}.xml`]);
}

describe("XLSX quantity workbook", () => {
  it("writes the six documented sheets and a valid package", () => {
    const files = workbook(makeProject());
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/workbook.xml",
        "xl/styles.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet6.xml",
      ]),
    );
    const workbookXml = strFromU8(files["xl/workbook.xml"]);
    for (const name of [
      "Summary",
      "By category",
      "By room",
      "By page",
      "Markups",
      "Source notes",
    ]) {
      expect(workbookXml).toContain(`name="${name}"`);
    }
  });

  it("keeps the quantity figures and source notes derived from item data", () => {
    const project = makeProject();
    const floor = project.categories.find((category) => category.name === "Floor")!;
    add(project, "area", { categoryId: floor.id, room: "Room A" });
    add(project, "count", { categoryId: floor.id, room: "Room A", countType: "door" });
    add(project, "length", { categoryId: floor.id, room: "Room A", visible: false });

    const files = workbook(project);
    const summary = sheet(files, 1);
    expect(summary).toContain("Example project");
    expect(summary).toContain(GENERATED);
    expect(summary).toContain('<t xml:space="preserve">area</t>');
    expect(summary).toContain('<t xml:space="preserve">count</t>');
    expect(summary).toContain('<c r="H11" s="3"><v>1</v></c>');
    expect(summary).toContain("Hidden items excluded");

    const byPage = sheet(files, 4);
    expect(byPage).toContain("Ground floor");
    expect(byPage).toContain("House A");
    expect(byPage).toContain("Level 1");

    const markups = sheet(files, 5);
    expect(markups).toContain("area label");
    expect(markups).toContain("count label");
    expect(markups).not.toContain("length label");

    const notes = sheet(files, 6);
    expect(notes).toContain("Plan.pdf");
    expect(notes).toContain("abc123");
  });

  it("writes numeric cells instead of formatted strings", () => {
    const project = makeProject();
    const floor = project.categories.find((category) => category.name === "Floor")!;
    add(project, "area", { categoryId: floor.id, room: "Room A" });

    const summary = sheet(workbook(project), 1);
    expect(summary).toMatch(/<c r="C10" s="2"><v>1<\/v><\/c>/);
    expect(summary).toMatch(/<c r="E10" s="2"><v>1<\/v><\/c>/);
  });

  it("does not mutate the project", () => {
    const project = makeProject();
    const floor = project.categories.find((category) => category.name === "Floor")!;
    add(project, "area", { categoryId: floor.id, room: "Room A" });
    const before = JSON.stringify(project);
    workbook(project);
    expect(JSON.stringify(project)).toBe(before);
  });
});
