import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { compareRevisions } from "../src/compare/revisionDiff";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import { exportComparisonPdf } from "../src/pdf/comparePdf";
import type { PdfRenderer } from "../src/pdf/pdfRenderer";

function project(pages: number) {
  const value = createProject(defaultDocument("Plan.pdf", pages), createDefaultLayers());
  value.name = "Current takeoff";
  return value;
}

function blockedRenderer(): PdfRenderer {
  return {
    getPage: async () => {
      throw new Error("Rendering is not available in this test.");
    },
  } as unknown as PdfRenderer;
}

describe("comparison PDF", () => {
  it("exports summary and visual pages for a drawing reference without a diff", async () => {
    const current = project(2);
    const bytes = await exportComparisonPdf({
      current,
      referenceName: "Reference drawing.pdf",
      referencePageCount: 3,
      diff: null,
      currentRenderer: blockedRenderer(),
      referenceRenderer: blockedRenderer(),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const pdf = await PDFDocument.load(bytes);

    // Summary + three visual page spreads; a drawing reference has no diff table.
    expect(pdf.getPageCount()).toBe(4);
  });

  it("keeps the diff table for a project revision", async () => {
    const current = project(2);
    const reference = structuredClone(current);
    reference.name = "Revision B";
    const diff = compareRevisions(current, reference);
    const bytes = await exportComparisonPdf({
      current,
      reference,
      referenceName: reference.name,
      referencePageCount: 2,
      diff,
      currentRenderer: blockedRenderer(),
      referenceRenderer: blockedRenderer(),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const pdf = await PDFDocument.load(bytes);

    // Summary + two visual page spreads + the differences table.
    expect(pdf.getPageCount()).toBe(4);
  });
});
