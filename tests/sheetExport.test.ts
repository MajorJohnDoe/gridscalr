import { describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument } from "pdf-lib";
import { exportProjectPdf } from "../src/pdf/pdfExport";
import type { PdfRenderer } from "../src/pdf/pdfRenderer";
import { createDefaultLayers, createProject } from "../src/model/layers";
import {
  createTemplateDocument,
  prefillSheetFields,
} from "../src/features/schematics/model/sheetDocument";
import {
  buildDrawingFrameTemplate,
  resolveSheetLabels,
} from "../src/features/schematics/model/sheetTemplate";
import { buildStaticSheetPdf } from "../src/features/schematics/render/sheetPdf";
import { defaultRailRows, RAIL_ROW_SPACING } from "../src/model/rail";

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

describe("template sheet export", () => {
  it("includes title-block field values in the exported PDF", async () => {
    const labels = resolveSheetLabels((key) => key);
    const template = buildDrawingFrameTemplate("A3", labels);
    const staticBytes = await buildStaticSheetPdf(template);

    const documentRef = createTemplateDocument("gridscalr.operation-card.frame", "A3", "Sheet");
    const project = createProject(documentRef, createDefaultLayers());
    project.name = "Export sheet";
    prefillSheetFields(project, documentRef, 1);
    documentRef.template!.fields["title.card"] = "56-01-01";
    documentRef.template!.fields["title.system"] = "Värmesystem";

    const now = "2026-11-04T00:00:00.000Z";
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    draw.items.push({
      id: "item_textbox",
      page: 1,
      kind: "textbox",
      points: [
        { x: 60, y: 60 },
        { x: 320, y: 160 },
      ],
      color: "#1a2024",
      strokeWidth: 1,
      text: "Box text",
      textColor: "#1a2024",
      textBackground: "white",
      padding: 4,
      fontSize: 12,
      createdAt: now,
      updatedAt: now,
    });
    draw.items.push(
      {
        id: "item_polyline",
        page: 1,
        kind: "polyline",
        points: [
          { x: 60, y: 200 },
          { x: 220, y: 200 },
          { x: 220, y: 280 },
        ],
        color: "#e30613",
        strokeWidth: 2,
        lineTypeId: "control",
        lineStyle: "dashed",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "item_rail",
        page: 1,
        kind: "rail",
        points: [
          { x: 60, y: 380 },
          { x: 420, y: 380 },
        ],
        color: "#4a4a4a",
        strokeWidth: 0.6,
        rows: defaultRailRows("plc"),
        rowSpacing: RAIL_ROW_SPACING,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "item_rich_textbox",
        page: 1,
        kind: "textbox",
        points: [
          { x: 60, y: 300 },
          { x: 320, y: 360 },
        ],
        color: "#1a2024",
        strokeWidth: 1,
        text: "Rich text",
        textColor: "#1a2024",
        textBackground: "white",
        padding: 4,
        fontSize: 12,
        runs: [
          { text: "Rich", bold: true, size: 16, color: "#e30613" },
          { text: " text", italic: true, underline: true },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "item_symbol",
        page: 1,
        kind: "symbol",
        points: [{ x: 360, y: 300 }],
        color: "#2d7dd2",
        strokeWidth: 1,
        symbolId: "schematic.fan",
        symbolSize: 40,
        tag: "FF-01",
        createdAt: now,
        updatedAt: now,
      },
    );

    const renderer = {
      getDocumentData: async () => staticBytes,
      getPage: async () => ({
        getViewport: ({ scale = 1 }: { scale?: number } = {}) => ({
          width: template.width * scale,
          height: template.height * scale,
          scale,
          rotation: 0,
          convertToPdfPoint: (x: number, y: number) => [x / scale, template.height - y / scale],
        }),
      }),
    } as unknown as PdfRenderer;

    const bytes = await exportProjectPdf(project, renderer);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);

    const text = await pageText(bytes);
    expect(text).toContain("56-01-01");
    expect(text).toContain("Värmesystem");
    expect(text).toContain("Export sheet");
    expect(text).toContain("Box text");
    expect(text).toContain("Rich");
    expect(text).toContain("text");
    expect(text).toContain("PLC");
    expect(text).toContain("FF-01");
  });
});
