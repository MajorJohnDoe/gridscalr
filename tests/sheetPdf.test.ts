import { describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument } from "pdf-lib";
import {
  buildDataSummaryTemplate,
  buildDrawingFrameTemplate,
  MM_TO_PT,
  resolveSheetLabels,
  type SheetLabels,
} from "../src/features/schematics/model/sheetTemplate";
import { buildSheetPdf, buildStaticSheetPdf } from "../src/features/schematics/render/sheetPdf";

const labels: SheetLabels = {
  handledBy: "Handled",
  card: "Card",
  date: "Date",
  system: "System",
  assignment: "Assignment",
  page: "Page",
  bet: "Bet.",
  rev: "Rev.",
  sign: "Sign",
};

async function pageText(bytes: Uint8Array): Promise<string> {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
    disableFontFace: true,
  });
  const document = await task.promise;
  try {
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
  } finally {
    await task.destroy();
  }
}

describe("static sheet PDF", () => {
  it("creates one A3 page with the frame labels", async () => {
    const template = buildDrawingFrameTemplate("A3", labels);
    const bytes = await buildStaticSheetPdf(template);
    const document = await PDFDocument.load(bytes);

    expect(document.getPageCount()).toBe(1);
    expect(document.getPage(0).getWidth()).toBeCloseTo(420 * MM_TO_PT, 2);
    expect(document.getPage(0).getHeight()).toBeCloseTo(297 * MM_TO_PT, 2);

    const text = await pageText(bytes);
    expect(text).toContain("Bet.");
    expect(text).toContain("Handled");
    expect(text).toContain("Card");
  });

  it("creates the data-summary table with its headers", async () => {
    const template = buildDataSummaryTemplate(
      "A3",
      resolveSheetLabels((key) => key),
    );
    const bytes = await buildStaticSheetPdf(template);
    const document = await PDFDocument.load(bytes);

    expect(document.getPageCount()).toBe(1);
    expect(document.getPage(0).getWidth()).toBeCloseTo(420 * MM_TO_PT, 2);
    const text = await pageText(bytes);
    expect(text).toContain("sheet.table.title");
  });

  it("creates an A2 page when requested", async () => {
    const template = buildDrawingFrameTemplate("A2", labels);
    const bytes = await buildStaticSheetPdf(template);
    const document = await PDFDocument.load(bytes);

    expect(document.getPage(0).getWidth()).toBeCloseTo(594 * MM_TO_PT, 2);
    expect(document.getPage(0).getHeight()).toBeCloseTo(420 * MM_TO_PT, 2);
  });
});

describe("sheet PDF with values", () => {
  it("writes field values as searchable text", async () => {
    const template = buildDrawingFrameTemplate("A3", labels);
    const bytes = await buildSheetPdf(template, {
      "project.name": "Test project",
      "title.card": "56-01-01",
      "title.system": "Värmesystem",
      "rev.1.bet": "A",
    });

    const text = await pageText(bytes);
    expect(text).toContain("Test project");
    expect(text).toContain("56-01-01");
    expect(text).toContain("Värmesystem");
    expect(text).toContain("A");
  });

  it("leaves the frame intact when values are empty", async () => {
    const template = buildDrawingFrameTemplate("A3", labels);
    const bytes = await buildSheetPdf(template, {});
    const text = await pageText(bytes);

    expect(text).toContain("Bet.");
    expect(text).toContain("Page");
  });

  it("does not change the page size when values are added", async () => {
    const template = buildDrawingFrameTemplate("A3", labels);
    const staticPdf = await PDFDocument.load(await buildStaticSheetPdf(template));
    const filledPdf = await PDFDocument.load(
      await buildSheetPdf(template, { "title.page": "1 av 4" }),
    );

    expect(filledPdf.getPage(0).getWidth()).toBeCloseTo(staticPdf.getPage(0).getWidth(), 5);
    expect(filledPdf.getPage(0).getHeight()).toBeCloseTo(staticPdf.getPage(0).getHeight(), 5);
  });
});
