import { describe, expect, it } from "vitest";
import { createTemplateDocument } from "../src/features/schematics/model/sheetDocument";
import {
  commitProjectImport,
  inspectProjectImport,
  prepareProjectImport,
  ProjectImportError,
} from "../src/features/projectImport/model";
import { buildImportPreflight } from "../src/features/projectImport/preflight";
import { createProject, defaultDocument } from "../src/model/layers";
import { parseProject } from "../src/io/projectFile";
import { serializeProject } from "../src/io/projectFile/serialize";
import type { DocumentRef, ImageAsset, Layer, MarkupItem, Project } from "../src/model/types";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";

function asset(id: string, data: string): ImageAsset {
  return {
    id,
    name: `${id}.png`,
    mime: "image/png",
    width: 2,
    height: 2,
    byteSize: data.length,
    data,
  };
}

function item(
  id: string,
  page: number,
  kind: MarkupItem["kind"],
  extra: Partial<MarkupItem> = {},
): MarkupItem {
  return {
    id,
    pageId: pageIdFor(page),
    kind,
    points: [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

function layer(
  id: string,
  name: string,
  kind: Layer["kind"],
  items: MarkupItem[],
  extra: Partial<Layer> = {},
): Layer {
  return {
    id,
    name,
    kind,
    visible: true,
    locked: false,
    opacity: 1,
    color: kind === "measure" ? "#4cc9f0" : "#f4a261",
    items,
    ...extra,
  };
}

function tifDocument(id = "doc_tif"): DocumentRef {
  return {
    id,
    kind: "tiff",
    name: "Scan.tif",
    path: null,
    relativePath: null,
    sha256: "hash_tif",
    pageCount: 1,
    sizeBytes: 1234,
    embeddedPdf: "JVBERi0=",
    source: { format: "tiff", dpi: [300, 300], originalName: "Scan.tif" },
  };
}

function destinationProject(): Project {
  const document = defaultDocument("Plan.pdf", 2);
  document.sha256 = "hash_dest";
  const project = withTestPageIds(createProject(document));
  project.name = "Destination";
  project.settings.lengthUnit = "m";
  project.settings.areaUnit = "m2";
  const other = project.categories.find((category) => category.name === "Other")!;
  project.settings.quantity.defaultCategoryId = other.id;
  project.categories.push({ id: "cat_dest_walls", name: "Walls", wastePercent: 5 });
  const draw = project.layers.find((entry) => entry.kind === "draw")!;
  draw.items.push(item("dest_draw", 1, "text", { text: "keep me" }));
  const measure = project.layers.find((entry) => entry.kind === "measure")!;
  measure.items.push(
    item("dest_measure", 1, "length", {
      categoryId: other.id,
      scale: { pointsPerMeter: 20, sourceUnit: "m" },
    }),
  );
  project.assets.asset_src = asset("asset_src", "data:image/png;base64,AAAA");
  return project;
}

function sourceProject(): Project {
  const pdf = defaultDocument("Plan.pdf", 3);
  pdf.sha256 = "hash_plan";
  const project = withTestPageIds(createProject(pdf));
  project.name = "Source";
  project.settings.lengthUnit = "cm";
  project.settings.areaUnit = "m2";
  const template = createTemplateDocument("gridscalr.operation-card.frame", "A3", "Operation card");
  template.template!.fields = {
    "project.name": "Source project",
    "title.page": "7",
  };
  project.documents.push(template, tifDocument());
  project.pages.push(
    { id: "page_4", documentId: template.id, localPage: 1, state: {} },
    { id: "page_5", documentId: project.documents[2].id, localPage: 1, state: {} },
  );

  project.categories.push({
    id: "cat_src_walls",
    name: "Walls",
    wastePercent: 99,
    roundingStep: 2,
  });
  project.categories.push({
    id: "cat_src_pipes",
    name: "Pipes",
    wastePercent: 12,
    roundingStep: 0.5,
  });
  project.categories.push({ id: "cat_src_unused", name: "Unused" });

  project.countTypes.push({ id: "diffuser", label: "Diffuser", glyph: "fixture" });
  project.countTypes.push({ id: "unused", label: "Unused type", glyph: "other" });
  project.lineTypes.push({
    id: "customLine",
    name: "Custom supply",
    color: "#112233",
    widthPt: 3,
    style: "dashed",
  });
  project.lineTypes.push({
    id: "unusedLine",
    name: "Unused line",
    color: "#445566",
    widthPt: 1,
    style: "solid",
  });

  project.assets.asset_src = asset("asset_src", "data:image/png;base64,BBBB");
  project.assets.asset_unused = asset("asset_unused", "data:image/png;base64,CCCC");

  project.pages[0].state = {
    name: "Plan 1",
    building: "Building A",
    floor: "Floor 1",
    calibration: {
      id: "cal_src",
      p1: { x: 0, y: 0 },
      p2: { x: 100, y: 0 },
      knownLength: 10,
      unit: "m",
      pointsPerMeter: 10,
      createdAt: NOW,
    },
    scaleLocked: true,
    ocr: {
      text: "pump",
      words: [{ text: "pump", x: 1, y: 2, width: 10, height: 5, confidence: 90 }],
      engine: "tesseract",
      languages: "eng",
      generatedAt: NOW,
      documentSha256: "hash_plan",
      sourcePage: 1,
      width: 100,
      height: 50,
    },
  };
  project.pages[1].state = { name: "Plan 2" };
  project.pages[2].state = { name: "Plan 3" };
  project.pages[3].state = { name: "Card 1" };
  project.pages[4].state = {
    name: "Scan 1",
    ocr: {
      text: "scan",
      words: [{ text: "scan", x: 1, y: 2, width: 10, height: 5 }],
      engine: "tesseract",
      languages: "eng",
      generatedAt: NOW,
      documentSha256: "hash_tif",
      sourcePage: 1,
      width: 100,
      height: 50,
    },
  };

  const markups = layer("layer_src_markups", "Markups", "draw", [
    item("src_text_1", 1, "text", { text: "one" }),
    item("src_rect_1", 1, "rect", { rotation: 5 }),
    item("src_image_1", 1, "image", {
      image: { assetId: "asset_src", mode: "annotation" },
      points: [
        { x: 10, y: 10 },
        { x: 30, y: 30 },
      ],
    }),
    item("src_polyline_1", 1, "polyline", { lineTypeId: "customLine" }),
    item("src_text_2", 2, "text", { text: "two" }),
    item("src_rect_4", 4, "rect"),
  ]);
  markups.pageState = { [pageIdFor(1)]: { visible: false, locked: true } };

  const measurements = layer("layer_src_measure", "Measurements", "measure", [
    item("src_length_2", 2, "length", {
      categoryId: "cat_src_pipes",
      scale: { pointsPerMeter: 20, sourceUnit: "m" },
    }),
    item("src_area_2", 2, "area", {
      categoryId: "cat_src_walls",
      visible: false,
      locked: true,
      points: [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 30, y: 30 },
      ],
    }),
    item("src_count_2", 2, "count", { countType: "diffuser", countQuantity: 3 }),
  ]);

  const hidden = layer(
    "layer_src_hidden",
    "Hidden layer",
    "draw",
    [item("src_hidden_item", 1, "text", { text: "hidden", visible: false, locked: true })],
    { visible: false, locked: true },
  );

  const empty = layer("layer_src_empty", "Empty", "draw", []);
  project.layers = [markups, measurements, hidden, empty];
  project.activeLayerId = markups.id;
  return project;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe("project page import", () => {
  it("inspects source pages in document order", () => {
    const groups = inspectProjectImport(sourceProject());
    expect(groups.map((group) => group.documentKind)).toEqual(["pdf", "template", "tiff"]);
    expect(groups[0].pages.map((page) => page.page)).toEqual([1, 2, 3]);
    expect(groups[0].pages[0]).toMatchObject({
      name: "Plan 1",
      building: "Building A",
      floor: "Floor 1",
      itemCount: 5,
    });
    expect(groups[1].pages[0]).toMatchObject({ page: 4, name: "Card 1", itemCount: 1 });
    expect(groups[2].pages[0]).toMatchObject({ page: 5, name: "Scan 1", itemCount: 0 });
  });

  it("records optional provenance on imported pages", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const provenance = {
      sourceProjectId: source.id,
      sourceRevisionSha256: "d".repeat(64),
      sourceRevisionSize: 4096,
      sourceRevisionModifiedAt: NOW,
      appVersion: "0.22.4",
    };
    const prepared = prepareProjectImport(
      destination,
      source,
      [1, 5],
      new Map(),
      undefined,
      provenance,
    );
    expect(prepared.pages).toHaveLength(2);
    for (const page of prepared.pages) {
      expect(page.provenance).toMatchObject({
        ...provenance,
        sourcePageId: page.id === prepared.pageMap[0].newPageId ? pageIdFor(1) : "page_5",
      });
      expect(Number.isNaN(Date.parse(page.provenance!.importedAt))).toBe(false);
    }
    commitProjectImport(destination, prepared);
    expect(destination.pages[2].provenance?.sourcePageId).toBe(pageIdFor(1));
    expect(destination.pages[3].provenance?.sourcePageId).toBe("page_5");
  });

  it("builds a preflight report before the import mutates anything", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const before = JSON.stringify(destination);
    const prepared = prepareProjectImport(destination, source, [1, 2, 4, 5]);
    const preflight = buildImportPreflight({
      prepared,
      sourceName: source.name,
      skipped: [3, 5],
      warnings: [
        { code: "checksum", documentName: "Plan.pdf" },
        { code: "pageCount", documentName: "Plan.pdf", expected: 3, actual: 4 },
        { code: "skippedPage", page: 5, documentName: "Scan.tif" },
      ],
    });
    expect(preflight).toMatchObject({
      sourceName: source.name,
      documents: 3,
      pages: 4,
      items: 10,
      categories: 1,
      countTypes: 1,
      lineTypes: 1,
      assets: 1,
      missingDocuments: ["Scan.tif"],
      skippedPages: [3, 5],
      checksumDocuments: ["Plan.pdf"],
    });
    expect(preflight.pageCountChanges).toEqual([{ name: "Plan.pdf", expected: 3, actual: 4 }]);
    expect(JSON.stringify(destination)).toBe(before);
  });

  it("appends pages in source order and keeps the source untouched", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const before = JSON.stringify(source);
    deepFreeze(source);

    const prepared = prepareProjectImport(destination, source, [5, 2, 1, 4]);
    expect(prepared.pageMap.map((entry) => [entry.sourcePage, entry.newPage])).toEqual([
      [1, 3],
      [2, 4],
      [4, 5],
      [5, 6],
    ]);
    expect(prepared.documents.map((document) => document.kind)).toEqual([
      "pdf",
      "template",
      "tiff",
    ]);
    expect(prepared.documents[0].excludedPages).toEqual([3]);
    expect(prepared.documents[1].template?.fields).toEqual({
      "project.name": "Source project",
      "title.page": "7",
    });
    expect(prepared.documents[2].embeddedPdf).toBe("JVBERi0=");
    expect(JSON.stringify(source)).toBe(before);

    const result = commitProjectImport(destination, prepared);
    expect(result.importedItemCount).toBe(10);
    expect(destination.documents).toHaveLength(4);
    expect(destination.documents[1].name).toBe("Plan.pdf 2");
    expect(destination.pages[2].state.name).toBe("Plan 1");
    expect(destination.pages[2].state.calibration?.id).not.toBe("cal_src");
    expect(destination.pages[2].state.scaleLocked).toBe(true);
    expect(destination.pages[2].state.ocr?.text).toBe("pump");
    expect(destination.pages[5].state.ocr?.text).toBe("scan");
    expect(JSON.stringify(source)).toBe(before);
  });

  it("creates one new layer set per imported page and never merges with destination layers", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const destinationLayerIds = new Set(destination.layers.map((entry) => entry.id));
    const destinationItemCount = destination.layers.reduce(
      (sum, entry) => sum + entry.items.length,
      0,
    );

    const prepared = prepareProjectImport(destination, source, [1, 2, 4]);
    const pageIdForNew = (newPage: number) =>
      prepared.pageMap.find((entry) => entry.newPage === newPage)!.newPageId;
    const markups = prepared.createdLayers.filter((entry) => entry.name === "Markups");
    expect(markups).toHaveLength(1);
    expect(markups[0].homePageId).toBe(pageIdForNew(3));
    expect(markups[0].items).toHaveLength(6);
    expect(markups[0].pageState).toEqual({
      [pageIdForNew(3)]: { visible: false, locked: true },
    });
    expect(markups.every((entry) => !destinationLayerIds.has(entry.id))).toBe(true);

    const measurements = prepared.createdLayers.filter((entry) => entry.name === "Measurements");
    expect(measurements).toHaveLength(1);
    expect(measurements[0].homePageId).toBe(pageIdForNew(4));
    expect(measurements[0].items).toHaveLength(3);

    const hidden = prepared.createdLayers.find((entry) => entry.name === "Hidden layer");
    expect(hidden).toMatchObject({
      visible: false,
      locked: true,
      homePageId: pageIdForNew(3),
    });
    expect(hidden?.items[0]).toMatchObject({ visible: false, locked: true });

    const empty = prepared.createdLayers.find((entry) => entry.name === "Empty");
    expect(empty).toBeUndefined();

    commitProjectImport(destination, prepared);
    expect(destination.layers.filter((entry) => destinationLayerIds.has(entry.id))).toHaveLength(
      destination.layers.length - prepared.createdLayers.length,
    );
    expect(
      destination.layers
        .filter((entry) => destinationLayerIds.has(entry.id))
        .reduce((sum, entry) => sum + entry.items.length, 0),
    ).toBe(destinationItemCount);
  });

  it("remaps categories by name, adds source-only categories and keeps destination settings", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const walls = destination.categories.find((category) => category.name === "Walls")!;
    const prepared = prepareProjectImport(destination, source, [2]);
    const imported = prepared.createdLayers.find((entry) => entry.name === "Measurements")!;
    const length = imported.items.find((entry) => entry.kind === "length")!;
    const area = imported.items.find((entry) => entry.kind === "area")!;

    const pipes = prepared.categories.find((category) => category.name === "Pipes");
    expect(pipes).toMatchObject({ wastePercent: 12, roundingStep: 0.5 });
    expect(length.categoryId).toBe(pipes?.id);
    expect(area.categoryId).toBe(walls.id);
    expect(destination.categories.find((category) => category.name === "Walls")?.wastePercent).toBe(
      5,
    );
    expect(prepared.categories.map((category) => category.name)).not.toContain("Other");
    expect(prepared.categories.map((category) => category.name)).not.toContain("Unused");
  });

  it("remaps count types, line types and image assets; unused data is not copied", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const prepared = prepareProjectImport(destination, source, [1, 2]);

    const markups = prepared.createdLayers.filter((entry) => entry.name === "Markups");
    const image = markups[0].items.find((entry) => entry.kind === "image")!;
    const polyline = markups[0].items.find((entry) => entry.kind === "polyline")!;
    const count = prepared.createdLayers
      .find((entry) => entry.name === "Measurements")!
      .items.find((entry) => entry.kind === "count")!;
    const importedAsset = Object.values(prepared.assets).find((entry) =>
      entry.data.endsWith("BBBB"),
    );

    expect(prepared.countTypes).toEqual([{ id: "diffuser", label: "Diffuser", glyph: "fixture" }]);
    expect(count.countType).toBe("diffuser");
    expect(prepared.lineTypes).toHaveLength(1);
    expect(prepared.lineTypes[0].name).toBe("Custom supply");
    expect(polyline.lineTypeId).toBe(prepared.lineTypes[0].id);
    expect(importedAsset).toBeDefined();
    expect(Object.values(prepared.assets).some((entry) => entry.data.endsWith("CCCC"))).toBe(false);
    expect(image.image?.assetId).toBe(importedAsset!.id);

    commitProjectImport(destination, prepared);
    expect(destination.assets.asset_src.data).toBe("data:image/png;base64,AAAA");
    const importedImage = destination.layers
      .flatMap((entry) => entry.items)
      .find(
        (entry) =>
          entry.kind === "image" &&
          entry.pageId === prepared.pageMap.find((map) => map.newPage === 3)!.newPageId,
      )!.image!;
    expect(destination.assets[importedImage.assetId].data).toBe("data:image/png;base64,BBBB");
  });

  it("reports units, missing references and dropped OCR", () => {
    const destination = destinationProject();
    const source = sourceProject();
    source.layers[0].items.push(
      item("src_missing_line", 1, "polyline", { lineTypeId: "line_missing" }),
      item("src_missing_image", 1, "image", {
        image: { assetId: "asset_missing", mode: "annotation" },
      }),
    );
    source.layers[1].items.push(
      item("src_missing_category", 1, "length", {
        categoryId: "cat_missing",
        scale: { pointsPerMeter: 20, sourceUnit: "m" },
      }),
      item("src_missing_count", 1, "count", { countType: "missing" }),
    );

    const prepared = prepareProjectImport(destination, source, [1], new Map());
    expect(prepared.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "units" }),
        expect.objectContaining({ code: "missingCategory", count: 1 }),
        expect.objectContaining({ code: "missingLineType", count: 1 }),
        expect.objectContaining({ code: "missingImage", count: 1 }),
        expect.objectContaining({ code: "missingCountType", count: 1 }),
      ]),
    );
    const markups = prepared.createdLayers.find((entry) => entry.name === "Markups")!;
    expect(markups.items.some((entry) => entry.id === "src_missing_image")).toBe(false);
    const measurements = prepared.createdLayers.find((entry) => entry.name === "Measurements")!;
    expect(measurements.items.find((entry) => entry.kind === "count")?.countType).toBe("other");

    const dropped = prepareProjectImport(
      destination,
      source,
      [5],
      new Map([[source.documents[2].id, { dropOcr: true }]]),
    );
    expect(dropped.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "ocrDropped", count: 1 })]),
    );
    expect(
      dropped.pages.find((page) => page.id === dropped.pageMap[0].newPageId)?.state.ocr,
    ).toBeUndefined();
  });

  it("keeps hidden and locked items and preserves timestamps", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const prepared = prepareProjectImport(destination, source, [2]);
    const measurement = prepared.createdLayers.find((entry) => entry.name === "Measurements")!;
    const area = measurement.items.find((entry) => entry.kind === "area")!;
    expect(area).toMatchObject({ visible: false, locked: true });
    expect(area.createdAt).toBe(NOW);
    expect(area.updatedAt).toBe(NOW);
  });

  it("round-trips through the project file parser", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const prepared = prepareProjectImport(destination, source, [1, 2, 3, 4, 5]);
    commitProjectImport(destination, prepared);
    const parsed = parseProject(serializeProject(destination));
    expect(parsed.documents).toHaveLength(destination.documents.length);
    expect(parsed.pages[2].state?.name).toBe("Plan 1");
    expect(parsed.pages[6].state?.name).toBe("Scan 1");
    const importedItems = parsed.layers.reduce(
      (sum, entry) =>
        sum +
        entry.items.filter((item) => parsed.pages.findIndex((page) => page.id === item.pageId) >= 2)
          .length,
      0,
    );
    const destinationItems = destination.layers.reduce(
      (sum, entry) =>
        sum +
        entry.items.filter((item) => parsed.pages.findIndex((page) => page.id === item.pageId) >= 2)
          .length,
      0,
    );
    expect(importedItems).toBe(destinationItems);
    expect(parsed.categories.map((category) => category.name)).toContain("Pipes");
    expect(parsed.countTypes.map((countType) => countType.id)).toContain("diffuser");
    expect(parsed.lineTypes.map((lineType) => lineType.name)).toContain("Custom supply");
  });

  it("rejects empty and invalid selections without changing the destination", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const before = JSON.stringify(destination);
    expect(() => prepareProjectImport(destination, source, [])).toThrow(ProjectImportError);
    expect(() => prepareProjectImport(destination, source, [99])).toThrow(ProjectImportError);
    expect(JSON.stringify(destination)).toBe(before);
  });

  it("uses an override page count and resolved path for a relinked PDF", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const prepared = prepareProjectImport(
      destination,
      source,
      [1, 3],
      new Map([
        [
          source.documents[0].id,
          {
            pageCount: 4,
            path: "/drawings/Plan.pdf",
            sha256: "hash_relinked",
            sizeBytes: 999,
            dropOcr: true,
          },
        ],
      ]),
    );
    expect(prepared.documents[0]).toMatchObject({
      path: "/drawings/Plan.pdf",
      sha256: "hash_relinked",
      sizeBytes: 999,
      pageCount: 4,
    });
    expect(prepared.documents[0].excludedPages).toEqual([2, 4]);
    expect(
      prepared.pages.find((page) => page.id === prepared.pageMap[0].newPageId)?.state.ocr,
    ).toBeUndefined();
  });

  it("gives copied documents unique names", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const prepared = prepareProjectImport(destination, source, [1]);
    expect(prepared.documents[0].name).toBe("Plan.pdf 2");
    const second = prepareProjectImport(destination, source, [2]);
    expect(second.documents[0].name).toBe("Plan.pdf 2");
  });

  it("keeps category and count-type ids free of collisions", () => {
    const destination = destinationProject();
    destination.categories.push({ id: "cat_src_pipes", name: "Something else" });
    const source = sourceProject();
    const prepared = prepareProjectImport(destination, source, [2]);
    const pipes = prepared.categories.find((category) => category.name === "Pipes")!;
    expect(pipes.id).not.toBe("cat_src_pipes");
    expect(prepared.categories.map((category) => category.id)).toContain(pipes.id);
  });
});
