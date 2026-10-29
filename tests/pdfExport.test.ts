import { describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream, degrees } from "pdf-lib";
import { exportProjectPdf, pdfCropBoxForViewport } from "../src/pdf/pdfExport";
import type { PdfRenderer } from "../src/pdf/pdfRenderer";
import { createCalibration } from "../src/model/calibration";
import { LABEL_PRIMARY_SIZE, LABEL_SECONDARY_SIZE } from "../src/model/label";
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
      points: [
        { x: 40, y: 40 },
        { x: 110, y: 90 },
      ],
      rotation: 25,
      fillColor: "#f2a93b",
      opacity: 0.2,
    }),
  );
  measure.items.push(
    makeItem({
      id: "item_length",
      kind: "length",
      points: [
        { x: 20, y: 60 },
        { x: 120, y: 60 },
      ],
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
    makeItem({
      id: "item_count",
      kind: "count",
      points: [{ x: 100, y: 30 }],
      countType: "door",
      categoryId: project.settings.quantity.defaultCategoryId,
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
    getDocumentData: async () => raw,
    getPage: async (pageNumber: number) => ({
      getViewport: ({ scale = 1 }: { scale?: number } = {}) => {
        const pageSize =
          pageNumber === 1 ? { width: 200, height: 120 } : { width: 300, height: 200 };
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

async function textItems(
  bytes: Uint8Array,
  onlyPage?: number,
): Promise<Array<{ text: string; size: number }>> {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
    disableFontFace: true,
  });
  const document = await task.promise;
  const items: Array<{ text: string; size: number }> = [];
  const first = onlyPage ?? 1;
  const last = onlyPage ?? document.numPages;
  for (let index = first; index <= last; index++) {
    const page = await document.getPage(index);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ("str" in item && item.str.trim()) {
        items.push({
          text: item.str,
          size: Math.hypot(item.transform[2], item.transform[3]),
        });
      }
    }
  }
  await task.destroy();
  return items;
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

  it("exports visible symbols as vectors and skips hidden ones", async () => {
    const project = makeProject();
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    draw.items.length = 0;
    draw.items.push(
      makeItem({
        id: "item_symbol_visible",
        kind: "symbol",
        points: [{ x: 60, y: 60 }],
        color: "#e5484d",
        symbolId: "fire.extinguisher",
        status: "approved",
      }),
      makeItem({
        id: "item_symbol_hidden",
        kind: "symbol",
        points: [{ x: 120, y: 60 }],
        color: "#005eb8",
        symbolId: "hvac.valve",
        visible: false,
      }),
    );
    const content = await decodePageContent(
      await exportProjectPdf(project, await makeRenderer(), {
        pages: [1],
        layerIds: project.layers.map((layer) => layer.id),
        includeLabels: false,
        includeCalibration: false,
        includeLegend: false,
      }),
    );
    expect(content).toMatch(/0\.827/); // visible fire symbol
    expect(content).toContain("f*"); // filled even-odd symbol artwork
    expect(content).not.toMatch(/0\.368627/); // hidden blue valve symbol
  });

  it("does not export editing endpoint markers", async () => {
    const bytes = await exportProjectPdf(makeProject(), await makeRenderer());
    const content = await decodePageContent(bytes);
    expect(content).not.toMatch(/0\.062/);
  });

  it("exports only pages still included in the project", async () => {
    const project = makeProject();
    project.documents[0].excludedPages = [2];
    const bytes = await exportProjectPdf(project, await makeRenderer());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("exports revision clouds, callouts, stamps, deltas, and area highlights", async () => {
    const project = makeProject();
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    draw.items.push(
      makeItem({
        id: "cloud_item",
        kind: "cloud",
        points: [
          { x: 20, y: 20 },
          { x: 80, y: 20 },
          { x: 80, y: 70 },
          { x: 20, y: 70 },
        ],
        text: "Revision",
        fontSize: 10,
      }),
      makeItem({
        id: "callout_item",
        kind: "callout",
        points: [
          { x: 100, y: 20 },
          { x: 150, y: 60 },
        ],
        text: "Check valve",
        fontSize: 10,
      }),
      makeItem({
        id: "stamp_item",
        kind: "stamp",
        points: [{ x: 60, y: 100 }],
        text: "APPROVED",
        fontSize: 12,
      }),
      makeItem({
        id: "delta_item",
        kind: "delta",
        points: [{ x: 100, y: 100 }],
        text: "A",
        label: "2026-10-24",
        fontSize: 14,
      }),
      makeItem({
        id: "highlight_area",
        kind: "highlight",
        points: [
          { x: 130, y: 20 },
          { x: 180, y: 50 },
        ],
        highlightShape: "rectangle",
        opacity: 0.3,
      }),
      makeItem({
        id: "double_arrow",
        kind: "arrow",
        points: [
          { x: 40, y: 110 },
          { x: 140, y: 130 },
        ],
        arrowHeads: "both",
      }),
    );
    const bytes = await exportProjectPdf(project, await makeRenderer());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("exports rectangle and ellipse quick areas as vector content", async () => {
    const renderer = await makeRenderer();
    const baseline = await contentBytes(await exportProjectPdf(makeProject(), renderer));
    const project = makeProject();
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    measure.items.push(
      makeItem({
        id: "quick_rect",
        kind: "area",
        areaShape: "rectangle",
        points: [
          { x: 140, y: 20 },
          { x: 190, y: 60 },
        ],
        scale: { pointsPerMeter: 10, sourceUnit: "m" },
      }),
      makeItem({
        id: "quick_ellipse",
        kind: "area",
        areaShape: "ellipse",
        points: [
          { x: 140, y: 70 },
          { x: 190, y: 110 },
        ],
        scale: { pointsPerMeter: 10, sourceUnit: "m" },
      }),
    );
    const withQuickAreas = await contentBytes(await exportProjectPdf(project, renderer));
    expect(withQuickAreas).toBeGreaterThan(baseline);
  });

  it("uses paper-space label sizes that do not dominate the drawing", async () => {
    const renderer = await makeRenderer();
    const bytes = await exportProjectPdf(makeProject(), renderer);
    const items = await textItems(bytes);

    const length = items.find((item) => item.text.startsWith("Wall A"));
    const area = items.find((item) => item.text.includes("m²"));
    const perimeter = items.find((item) => /^(Perimeter|P) /.test(item.text));
    const count = items.find((item) => item.text === "1 pcs");
    const countType = items.find((item) => item.text === "Door");

    expect(length?.size).toBeCloseTo(LABEL_PRIMARY_SIZE, 1);
    expect(area?.size).toBeGreaterThanOrEqual(4);
    expect(area?.size).toBeLessThanOrEqual(LABEL_PRIMARY_SIZE);
    expect(perimeter?.size).toBeCloseTo(
      (area?.size ?? 0) * (LABEL_SECONDARY_SIZE / LABEL_PRIMARY_SIZE),
      1,
    );
    expect(count?.size).toBeCloseTo(LABEL_PRIMARY_SIZE, 1);
    expect(countType?.size).toBeCloseTo(LABEL_SECONDARY_SIZE, 1);

    const sizedProject = makeProject();
    sizedProject.settings.labelSize = 9;
    sizedProject.settings.compactAreaLabels = true;
    const sizedMeasure = sizedProject.layers.find((layer) => layer.kind === "measure")!;
    sizedMeasure.items.find((item) => item.id === "item_length")!.labelSize = 11;
    const sizedItems = await textItems(await exportProjectPdf(sizedProject, renderer));
    expect(sizedItems.find((item) => item.text.startsWith("Wall A"))?.size).toBeCloseTo(11, 1);
    const sizedArea = sizedItems.find((item) => item.text.includes("m²"));
    expect(sizedArea?.size).toBeGreaterThanOrEqual(4);
    expect(sizedArea?.size).toBeLessThanOrEqual(9);
    expect(sizedItems.find((item) => item.text.startsWith("P "))?.size).toBeCloseTo(
      (sizedArea?.size ?? 0) * (LABEL_SECONDARY_SIZE / LABEL_PRIMARY_SIZE),
      1,
    );

    const fitProject = makeProject();
    fitProject.settings.labelSize = 12;
    fitProject.layers
      .find((layer) => layer.kind === "measure")!
      .items.find((item) => item.id === "item_area")!.labelFit = "top-left";
    const fitItems = await textItems(await exportProjectPdf(fitProject, renderer));
    const fitArea = fitItems.find((item) => item.text.includes("m²"));
    expect(fitArea?.size).toBeGreaterThanOrEqual(4);
    expect(fitArea?.size).toBeLessThan(12);

    const calibrationProject = makeProject();
    for (const layer of calibrationProject.layers) layer.items.length = 0;
    const calibrationItems = (
      await textItems(await exportProjectPdf(calibrationProject, renderer))
    ).filter((item) => item.text.trim());
    expect(calibrationItems.length).toBeGreaterThan(0);
    for (const item of calibrationItems) {
      expect(item.size).toBeCloseTo(LABEL_PRIMARY_SIZE, 1);
    }
  });

  it("draws count symbols and omits hidden counts", async () => {
    const renderer = await makeRenderer();
    const project = makeProject();
    const count = project.layers
      .flatMap((layer) => layer.items)
      .find((item) => item.kind === "count")!;

    const visibleSize = await contentBytes(await exportProjectPdf(project, renderer));
    count.visible = false;
    const hiddenSize = await contentBytes(await exportProjectPdf(project, renderer));

    expect(hiddenSize).toBeLessThan(visibleSize);
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

  it("exports only selected pages and selected visible layers", async () => {
    const renderer = await makeRenderer();
    const project = makeProject();
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    const measure = project.layers.find((layer) => layer.kind === "measure")!;

    const bytes = await exportProjectPdf(project, renderer, {
      pages: [2, 1, 2],
      layerIds: [draw.id],
      includeLabels: true,
      includeCalibration: true,
      includeLegend: false,
    });
    const output = await PDFDocument.load(bytes);
    expect(output.getPageCount()).toBe(2);
    const text = await textItems(bytes);
    expect(text.some((item) => item.text === "Plan note")).toBe(true);
    expect(text.some((item) => item.text.startsWith("Wall A"))).toBe(false);
    expect(text.some((item) => item.text.includes("10 m reference"))).toBe(true);
    expect(measure.visible).toBe(true);
  });

  it("turns generated labels and the calibration line off independently", async () => {
    const renderer = await makeRenderer();
    const project = makeProject();
    const withBoth = await textItems(
      await exportProjectPdf(project, renderer, {
        pages: [1],
        layerIds: project.layers.map((layer) => layer.id),
        includeLabels: true,
        includeCalibration: true,
        includeLegend: false,
      }),
    );
    expect(withBoth.some((item) => item.text.startsWith("Wall A"))).toBe(true);
    expect(withBoth.some((item) => item.text.includes("10 m reference"))).toBe(true);

    const withoutBoth = await textItems(
      await exportProjectPdf(project, renderer, {
        pages: [1],
        layerIds: project.layers.map((layer) => layer.id),
        includeLabels: false,
        includeCalibration: false,
        includeLegend: false,
      }),
    );
    expect(withoutBoth.some((item) => item.text.startsWith("Wall A"))).toBe(false);
    expect(withoutBoth.some((item) => item.text.includes("10 m reference"))).toBe(false);
    expect(withoutBoth.some((item) => item.text === "Plan note")).toBe(true);
  });

  it("maps the same relative crop onto rotated and unrotated pages", async () => {
    const renderer = await makeRenderer();
    const project = makeProject();
    const options = {
      pages: [1, 2],
      layerIds: project.layers.map((layer) => layer.id),
      includeLabels: false,
      includeCalibration: false,
      includeLegend: false,
      crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    };
    const output = await PDFDocument.load(await exportProjectPdf(project, renderer, options));
    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(0).getCropBox()).toEqual({ x: 50, y: 30, width: 100, height: 60 });
    expect(output.getPage(0).getMediaBox()).toEqual({ x: 50, y: 30, width: 100, height: 60 });
    expect(output.getPage(1).getCropBox()).toEqual({ x: 75, y: 50, width: 150, height: 100 });
  });

  it("clips a crop against an existing CropBox and rejects tiny intersections", () => {
    const viewport = {
      width: 200,
      height: 100,
      rotation: 0,
      convertToPdfPoint: (x: number, y: number) => [x, 100 - y] as [number, number],
    };
    const box = pdfCropBoxForViewport(
      viewport,
      { x: 0, y: 0, width: 0.5, height: 0.5 },
      { x: 20, y: 20, width: 60, height: 60 },
    );
    expect(box).toEqual({ x: 20, y: 50, width: 60, height: 30 });
    expect(() =>
      pdfCropBoxForViewport(
        viewport,
        { x: 0, y: 0, width: 0.05, height: 0.05 },
        { x: 100, y: 0, width: 100, height: 100 },
      ),
    ).toThrow(/too small/i);
  });

  it("embeds image objects in the drawing export", async () => {
    const renderer = await makeRenderer();
    const project = makeProject();
    const data =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    project.assets["img_export"] = {
      id: "img_export",
      name: "Pixel.png",
      mime: "image/png",
      width: 1,
      height: 1,
      byteSize: 70,
      data,
    };
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    draw.items.push(
      makeItem({
        id: "item_image_bg",
        kind: "image",
        points: [
          { x: 20, y: 20 },
          { x: 120, y: 80 },
        ],
        image: { assetId: "img_export", mode: "background" },
        opacity: 0.5,
        rotation: 15,
      }),
    );

    const bytes = await exportProjectPdf(project, renderer, {
      pages: [1],
      layerIds: project.layers.map((layer) => layer.id),
      includeLabels: false,
      includeCalibration: false,
      includeLegend: false,
    });
    const output = await PDFDocument.load(bytes);
    expect(output.getPageCount()).toBe(1);
    const raw = new TextDecoder("latin1").decode(bytes);
    expect(raw).toContain("/Subtype /Image");
  });

  it("draws background images before markups and annotation images in layer order", async () => {
    const renderer = await makeRenderer();
    const project = makeProject();
    const data =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    project.assets["img_order"] = {
      id: "img_order",
      name: "Pixel.png",
      mime: "image/png",
      width: 1,
      height: 1,
      byteSize: 70,
      data,
    };
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    draw.items.length = 0;
    draw.items.push(
      makeItem({
        id: "item_rect",
        kind: "rect",
        points: [
          { x: 20, y: 20 },
          { x: 120, y: 80 },
        ],
        color: "#ff0000",
        strokeWidth: 2,
      }),
      makeItem({
        id: "item_image_bg",
        kind: "image",
        points: [
          { x: 20, y: 20 },
          { x: 120, y: 80 },
        ],
        image: { assetId: "img_order", mode: "background" },
      }),
      makeItem({
        id: "item_image_annotation",
        kind: "image",
        points: [
          { x: 30, y: 30 },
          { x: 130, y: 90 },
        ],
        image: { assetId: "img_order", mode: "annotation" },
      }),
    );

    const content = await decodePageContent(
      await exportProjectPdf(project, renderer, {
        pages: [1],
        layerIds: project.layers.map((layer) => layer.id),
        includeLabels: false,
        includeCalibration: false,
        includeLegend: false,
      }),
    );
    const imageDraws = [...content.matchAll(/\/Image-\d+ Do/g)].map((match) => match.index ?? -1);
    const rectFill = content.search(/1 0 0 RG/);
    expect(imageDraws.length).toBe(2);
    expect(imageDraws[0]).toBeLessThan(rectFill);
    expect(rectFill).toBeLessThan(imageDraws[1]);
  });

  it("excludes hidden images, exports locked images, and skips corrupt data", async () => {
    const renderer = await makeRenderer();
    const project = makeProject();
    const data =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    project.assets["img_state"] = {
      id: "img_state",
      name: "Pixel.png",
      mime: "image/png",
      width: 1,
      height: 1,
      byteSize: 70,
      data,
    };
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    draw.items.length = 0;
    const item = makeItem({
      id: "item_image_state",
      kind: "image",
      points: [
        { x: 20, y: 20 },
        { x: 120, y: 80 },
      ],
      image: { assetId: "img_state", mode: "annotation" },
      visible: false,
    });
    draw.items.push(item);
    const options = {
      pages: [1],
      layerIds: project.layers.map((layer) => layer.id),
      includeLabels: false,
      includeCalibration: false,
      includeLegend: false,
    };

    const hidden = new TextDecoder("latin1").decode(
      await exportProjectPdf(project, renderer, options),
    );
    expect(hidden).not.toContain("/Subtype /Image");

    item.visible = true;
    item.locked = true;
    const locked = new TextDecoder("latin1").decode(
      await exportProjectPdf(project, renderer, options),
    );
    expect(locked).toContain("/Subtype /Image");

    project.assets["img_state"].data = "data:image/png;base64,AAAA";
    const corrupt = new TextDecoder("latin1").decode(
      await exportProjectPdf(project, renderer, options),
    );
    expect(corrupt).not.toContain("/Subtype /Image");
  });

  it("adds a separate A4 legend page only when requested and counts exported content", async () => {
    const renderer = await makeRenderer();
    const project = makeProject();
    const withLegend = await exportProjectPdf(project, renderer, {
      pages: [1],
      layerIds: project.layers.map((layer) => layer.id),
      includeLabels: false,
      includeCalibration: false,
      includeLegend: true,
    });
    const output = await PDFDocument.load(withLegend);
    expect(output.getPageCount()).toBe(2);
    const legend = await textItems(withLegend, 2);
    expect(legend.some((item) => item.text === "Drawing legend")).toBe(true);
    expect(legend.some((item) => item.text === "Markups")).toBe(true);
    expect(legend.some((item) => item.text === "Measurements")).toBe(true);
    expect(legend.some((item) => item.text === "Door")).toBe(true);
    expect(legend.some((item) => item.text === "1 pcs")).toBe(true);

    const count = project.layers
      .flatMap((layer) => layer.items)
      .find((item) => item.kind === "count")!;
    count.visible = false;
    const withoutHiddenCount = await textItems(
      await exportProjectPdf(project, renderer, {
        pages: [1],
        layerIds: project.layers.map((layer) => layer.id),
        includeLabels: false,
        includeCalibration: false,
        includeLegend: true,
      }),
      2,
    );
    expect(withoutHiddenCount.some((item) => item.text === "Door")).toBe(false);
  });
  it("exports pages from every source document in project order", async () => {
    const first = await PDFDocument.create();
    first.addPage([100, 100]);
    const second = await PDFDocument.create();
    second.addPage([200, 200]);
    second.addPage([200, 200]);
    const firstBytes = await first.save();
    const secondBytes = await second.save();

    const project = createProject(defaultDocument("First.pdf", 1), createDefaultLayers());
    project.documents.push({
      ...defaultDocument("Second.pdf", 2),
      id: "doc_second",
      kind: "pdf",
    });

    const sizes = [
      { width: 100, height: 100 },
      { width: 200, height: 200 },
      { width: 200, height: 200 },
    ];
    const renderer = {
      getDocumentData: async (index: number) => (index === 0 ? firstBytes : secondBytes),
      getPage: async (pageNumber: number) => ({
        getViewport: ({ scale = 1 }: { scale?: number } = {}) => ({
          ...sizes[pageNumber - 1],
          width: sizes[pageNumber - 1].width * scale,
          height: sizes[pageNumber - 1].height * scale,
          scale,
          convertToPdfPoint: (x: number, y: number) => [
            x / scale,
            sizes[pageNumber - 1].height - y / scale,
          ],
        }),
      }),
    } as unknown as PdfRenderer;

    const bytes = await exportProjectPdf(project, renderer);
    const output = await PDFDocument.load(bytes);
    expect(output.getPageCount()).toBe(3);
    expect(output.getPage(0).getSize()).toEqual({ width: 100, height: 100 });
    expect(output.getPage(2).getSize()).toEqual({ width: 200, height: 200 });
  });
});
