import { describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, degrees } from "pdf-lib";
import { exportProjectPdf } from "../src/pdf/pdfExport";
import type { PdfRenderer } from "../src/pdf/pdfRenderer";
import { createPlacement } from "../src/features/schedules";
import { addItem, createProject, defaultDocument, layersForKind } from "../src/model/layers";
import type { MarkupItem, Project, ScheduleDefinition } from "../src/model/types";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";

function makeProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plans.pdf", 2)));
  project.name = "Schedule export";
  const measure = layersForKind(project, "measure")[0];
  for (const [index, label] of ["Wall A", "Wall B"].entries()) {
    const item: MarkupItem = {
      id: `item_${index}`,
      pageId: pageIdFor(1),
      kind: "length",
      points: [
        { x: 20, y: 100 + index * 10 },
        { x: 120, y: 100 + index * 10 },
      ],
      color: "#e30613",
      strokeWidth: 2,
      scale: { pointsPerMeter: 100, sourceUnit: "m" },
      createdAt: NOW,
      updatedAt: NOW,
      label,
    };
    addItem(project, measure.id, item);
  }
  const schedule: ScheduleDefinition = {
    id: "sched_pdf",
    name: "Walls",
    source: "measurements",
    rowMode: "items",
    columns: [
      { id: "c1", field: "label", visible: true, width: 22 },
      { id: "c2", field: "value", visible: true, width: 14, format: "unit" },
      { id: "c3", field: "unit", visible: true, width: 8 },
    ],
    filters: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
  project.schedules.push(schedule);
  const placement = createPlacement(project, {
    scheduleId: "sched_pdf",
    pageId: pageIdFor(1),
    width: 360,
    height: 160,
    position: { x: 30, y: 30 },
    layerName: "Schedules",
  });
  expect(placement).not.toBeNull();
  return project;
}

async function makeRenderer(): Promise<PdfRenderer> {
  const source = await PDFDocument.create();
  const first = source.addPage([400, 300]);
  first.setRotation(degrees(0));
  source.addPage([300, 200]);
  const raw = await source.save();
  return {
    getDocumentData: async () => raw,
    getPage: async (pageNumber: number) => ({
      getViewport: ({ scale = 1 }: { scale?: number } = {}) => {
        const size = pageNumber === 1 ? { width: 400, height: 300 } : { width: 300, height: 200 };
        return {
          width: size.width * scale,
          height: size.height * scale,
          scale,
          convertToPdfPoint: (x: number, y: number) => [x / scale, size.height - y / scale],
        };
      },
    }),
  } as unknown as PdfRenderer;
}

async function textItems(bytes: Uint8Array): Promise<string[]> {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
    disableFontFace: true,
  });
  const document = await task.promise;
  const page = await document.getPage(1);
  const content = await page.getTextContent();
  const text: string[] = [];
  for (const item of content.items) {
    if ("str" in item && item.str.trim()) text.push(item.str.trim());
  }
  await task.destroy();
  return text;
}

async function decodePageContent(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  let text = "";
  for (const ref of refs) {
    const stream = doc.context.lookup(ref);
    if (!(stream instanceof PDFRawStream)) continue;
    text += new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode());
  }
  return text;
}

async function exportBytes(project: Project): Promise<Uint8Array> {
  return exportProjectPdf(project, await makeRenderer(), {
    pages: [1],
    layerIds: project.layers.map((layer) => layer.id),
    includeLabels: false,
    includeCalibration: false,
    includeLegend: false,
  });
}

describe("placed schedule PDF export", () => {
  it("draws the same columns, rows and totals as vector text and lines", async () => {
    const project = makeProject();
    const schedule = project.schedules[0];
    schedule.totals = [{ field: "value", op: "sum" }];
    const placement = project.layers
      .flatMap((layer) => layer.items)
      .find((item) => item.kind === "schedule")!;
    placement.showTotals = true;
    const bytes = await exportBytes(project);
    const text = await textItems(bytes);
    for (const expected of ["Label", "Value", "Unit", "Wall A", "Wall B", "Total"]) {
      expect(text).toContain(expected);
    }
    const content = await decodePageContent(bytes);
    expect((content.match(/ l\n/g) ?? []).length).toBeGreaterThan(5);
  });

  it("excludes a hidden placement but exports a locked one", async () => {
    const hiddenProject = makeProject();
    const hidden = hiddenProject.layers
      .flatMap((layer) => layer.items)
      .find((item) => item.kind === "schedule")!;
    hidden.visible = false;
    expect(await textItems(await exportBytes(hiddenProject))).not.toContain("Wall A");

    const lockedProject = makeProject();
    const locked = lockedProject.layers
      .flatMap((layer) => layer.items)
      .find((item) => item.kind === "schedule")!;
    locked.locked = true;
    expect(await textItems(await exportBytes(lockedProject))).toContain("Wall A");
  });

  it("exports the missing-takeoff-table placeholder instead of an empty box", async () => {
    const project = makeProject();
    const placement = project.layers
      .flatMap((layer) => layer.items)
      .find((item) => item.kind === "schedule")!;
    placement.scheduleId = "sched_missing";
    const text = await textItems(await exportBytes(project));
    expect(text.some((entry) => entry.includes("missing takeoff table"))).toBe(true);
  });
});
