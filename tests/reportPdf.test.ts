import { describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument } from "pdf-lib";
import { createCalibration } from "../src/model/calibration";
import {
  addItem,
  createDefaultLayers,
  createProject,
  defaultDocument,
  layersForKind,
} from "../src/model/layers";
import type { MarkupItem, Project } from "../src/model/types";
import { buildQuantityReport } from "../src/report/reportModel";
import { exportQuantityReportPdf } from "../src/pdf/reportPdf";

const NOW = "2026-01-01T00:00:00.000Z";
const GENERATED = "2026-10-22T12:00:00.000Z";
const SCALE = { pointsPerMeter: 100, sourceUnit: "m" as const };

function makeProject(): Project {
  const project = createProject(defaultDocument("plan.pdf", 2), createDefaultLayers());
  project.name = "Mängd ÅÄÖ";
  project.pages["1"] = {
    calibration: createCalibration({ x: 10, y: 10 }, { x: 110, y: 10 }, 10, "m"),
  };
  project.pages["2"] = {
    calibration: createCalibration({ x: 10, y: 10 }, { x: 110, y: 10 }, 10, "m"),
  };
  project.settings.lengthUnit = "m";
  project.settings.areaUnit = "m2";
  return project;
}

function categoryId(project: Project, name: string): string {
  const category = project.categories.find((entry) => entry.name === name);
  if (!category) throw new Error(`Missing category ${name}`);
  return category.id;
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

async function textByPage(bytes: Uint8Array): Promise<string[]> {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
    disableFontFace: true,
  });
  const document = await task.promise;
  const pages: string[] = [];
  for (let index = 1; index <= document.numPages; index++) {
    const page = await document.getPage(index);
    const content = await page.getTextContent();
    const parts: string[] = [];
    for (const item of content.items) {
      if ("str" in item && item.str.trim()) parts.push(item.str);
    }
    pages.push(parts.join(" "));
  }
  await task.destroy();
  return pages;
}

describe("quantity report PDF", () => {
  it("renders an A4 report with rows, totals, notices, and page numbers", async () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    add(project, "area", { categoryId: floor, room: "Room A" });
    add(project, "count", { categoryId: floor, room: "Room A", countType: "door" });
    add(project, "length", { categoryId: floor, room: "Hidden", visible: false });
    project.settings.quantity.wastePercent = 10;
    project.settings.quantity.roundingStep = 0.5;

    const report = buildQuantityReport(project, { generatedAt: GENERATED });
    const bytes = await exportQuantityReportPdf(report);
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPage(0);
    expect(page.getWidth()).toBeCloseTo(595.28, 1);
    expect(page.getHeight()).toBeCloseTo(841.89, 1);

    const text = (await textByPage(bytes)).join(" ");
    expect(text).toContain("Mängd ÅÄÖ");
    expect(text).toContain("Quantity report");
    expect(text).toContain("Floor");
    expect(text).toContain("Room A");
    expect(text).toContain("Area");
    expect(text).toContain("Count");
    expect(text).toContain("Order");
    expect(text).toContain("Total");
    expect(text).toContain("hidden measurement excluded");
    expect(text).toContain("Page 1 of 1");
  });

  it("repeats the table header and page footer across page breaks", async () => {
    const project = makeProject();
    const floor = categoryId(project, "Floor");
    for (let index = 1; index <= 80; index++) {
      add(project, "length", { categoryId: floor, room: `Room ${index}` });
    }

    const bytes = await exportQuantityReportPdf(
      buildQuantityReport(project, { generatedAt: GENERATED }),
    );
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);

    const pages = await textByPage(bytes);
    for (const [index, text] of pages.entries()) {
      expect(text).toContain("Mängd ÅÄÖ");
      expect(text).toContain("Room");
      expect(text).toContain(`Page ${index + 1} of ${pages.length}`);
    }
  });

  it("renders a clear empty report", async () => {
    const project = makeProject();
    for (const layer of project.layers) layer.items.length = 0;
    const bytes = await exportQuantityReportPdf(
      buildQuantityReport(project, { generatedAt: GENERATED }),
    );
    const text = (await textByPage(bytes)).join(" ");
    expect(text).toContain("No quantities");
    expect(text).toContain("No visible, calibrated measurements");
    expect(text).toContain("Page 1 of 1");
  });
});
