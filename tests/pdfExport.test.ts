import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { exportProjectPdf } from "../src/pdf/pdfExport";
import type { PdfRenderer } from "../src/pdf/pdfRenderer";
import { createCalibration } from "../src/model/calibration";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import type { MarkupItem, Project } from "../src/model/types";

const now = "2026-01-01T00:00:00.000Z";

function makeItem(overrides: Partial<MarkupItem>): MarkupItem {
  return {
    id: "item_export",
    page: 1,
    kind: "text",
    points: [{ x: 20, y: 30 }],
    color: "#f2a93b",
    strokeWidth: 2,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeProject(): Project {
  const project = createProject(defaultDocument("Export.pdf", 2), createDefaultLayers());
  project.name = "Export test";
  project.pages["1"] = {
    calibration: createCalibration({ x: 10, y: 10 }, { x: 110, y: 10 }, 10, "m"),
  };
  const draw = project.layers.find((layer) => layer.kind === "draw")!;
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  draw.items.push(
    makeItem({ text: "Plan note", fontSize: 6, rotation: 20 }),
    makeItem({
      id: "item_rect",
      kind: "rect",
      points: [{ x: 40, y: 40 }, { x: 110, y: 90 }],
      rotation: 25,
      fillColor: "#f2a93b",
      opacity: 0.2,
    }),
  );
  measure.items.push(
    makeItem({
      id: "item_length",
      kind: "length",
      points: [{ x: 20, y: 60 }, { x: 120, y: 60 }],
      label: "Wall A",
      scale: { pointsPerMeter: 10, sourceUnit: "m" },
    }),
    makeItem({
      id: "item_area",
      kind: "area",
      points: [
        { x: 20, y: 80 },
        { x: 80, y: 90 },
        { x: 50, y: 110 },
      ],
      scale: { pointsPerMeter: 10, sourceUnit: "m" },
    }),
  );
  return project;
}

async function makeRenderer(): Promise<PdfRenderer> {
  const source = await PDFDocument.create();
  const first = source.addPage([200, 120]);
  first.setRotation(degrees(90));
  first.drawRectangle({ x: 5, y: 5, width: 50, height: 30, color: undefined });
  source.addPage([300, 200]);
  const raw = await source.save();

  return {
    document: { getData: async () => raw },
    getPage: async (pageNumber: number) => ({
      getViewport: ({ scale = 1 }: { scale?: number } = {}) => {
        const pageSize = pageNumber === 1 ? { width: 200, height: 120 } : { width: 300, height: 200 };
        const rotated = pageNumber === 1;
        return {
          width: (rotated ? pageSize.height : pageSize.width) * scale,
          height: (rotated ? pageSize.width : pageSize.height) * scale,
          scale,
          convertToPdfPoint: (x: number, y: number) => {
            const sx = x / scale;
            const sy = y / scale;
            if (!rotated) return [sx, pageSize.height - sy];
            return [sy, sx];
          },
        };
      },
    }),
  } as unknown as PdfRenderer;
}

async function contentBytes(bytes: Uint8Array): Promise<number> {
  const output = await PDFDocument.load(bytes);
  let total = 0;
  for (const page of output.getPages()) {
    const contents = page.node.Contents() as unknown as
      | {
          size?: () => number;
          lookup?: (index: number) => { contents?: Uint8Array };
        }
      | undefined;
    for (let index = 0; index < (contents?.size?.() ?? 0); index++) {
      total += contents?.lookup?.(index).contents?.byteLength ?? 0;
    }
  }
  return total;
}

describe("flattened PDF export", () => {
  it("keeps all source pages and adds vector markups", async () => {
    const renderer = await makeRenderer();

    const bytes = await exportProjectPdf(makeProject(), renderer);
    expect(bytes.byteLength).toBeGreaterThan(1_000);

    const output = await PDFDocument.load(bytes);
    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(0).getRotation().angle).toBe(90);
  });

  it("omits hidden items and hidden layers from the flattened PDF", async () => {
    const renderer = await makeRenderer();
    const project = makeProject();

    const visibleBytes = await exportProjectPdf(project, renderer);
    const visibleSize = await contentBytes(visibleBytes);

    for (const layer of project.layers) {
      for (const item of layer.items) item.visible = false;
    }
    const hiddenBytes = await exportProjectPdf(project, renderer);
    const hiddenSize = await contentBytes(hiddenBytes);

    for (const layer of project.layers) {
      layer.visible = true;
      for (const item of layer.items) item.visible = true;
    }
    project.layers.find((layer) => layer.kind === "draw")!.visible = false;
    const hiddenLayerBytes = await exportProjectPdf(project, renderer);
    const hiddenLayerSize = await contentBytes(hiddenLayerBytes);

    expect(visibleSize).toBeGreaterThan(0);
    expect(hiddenSize).toBeLessThan(visibleSize);
    expect(hiddenLayerSize).toBeLessThan(visibleSize);
  });
});
