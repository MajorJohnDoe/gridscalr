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
  });
});
