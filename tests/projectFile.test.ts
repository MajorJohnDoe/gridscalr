import { describe, expect, it } from "vitest";
import { createCalibration, createManualCalibration, manualPointsPerMeter } from "../src/model/calibration";
import { findCategory } from "../src/model/categories";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import { SCHEMA_VERSION } from "../src/model/types";
import type { MarkupItem, Project } from "../src/model/types";
import {
  parseProject,
  relativeDocumentPath,
  resolveRelativePath,
  serializeProject,
  suggestedProjectName,
} from "../src/io/projectFile";

function makeProject(): Project {
  const project = createProject(defaultDocument("Floor Plan.pdf", 2), createDefaultLayers());
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  const now = "2026-01-01T00:00:00.000Z";
  const item: MarkupItem = {
    id: "item_a",
    page: 1,
    kind: "length",
    points: [{ x: 10, y: 10 }, { x: 110, y: 10 }],
    color: "#4cc9f0",
    strokeWidth: 2,
    label: "Wall A",
    scale: { pointsPerMeter: 20, sourceUnit: "m" },
    createdAt: now,
    updatedAt: now,
  };
  measure.items.push(item);
  project.pages["1"] = {
    calibration: createCalibration({ x: 0, y: 0 }, { x: 100, y: 0 }, 5, "m"),
  };
  return project;
}

describe("project files", () => {
  it("round-trips project data, layers, items, and calibrations", () => {
    const project = makeProject();
    const parsed = parseProject(serializeProject(project));

    expect(parsed.id).toBe(project.id);
    expect(parsed.name).toBe("Floor Plan");
    expect(parsed.documents[0].name).toBe("Floor Plan.pdf");
    expect(parsed.documents[0].pageCount).toBe(2);
    expect(parsed.layers).toHaveLength(2);
    expect(parsed.pages["1"].calibration?.pointsPerMeter).toBe(20);

    const measure = parsed.layers.find((layer) => layer.kind === "measure")!;
    expect(measure.items).toHaveLength(1);
    expect(measure.items[0]).toMatchObject({
      id: "item_a",
      kind: "length",
      label: "Wall A",
      scale: { pointsPerMeter: 20, sourceUnit: "m" },
      visible: true,
      locked: false,
    });
  });

  it("round-trips category waste and rounding overrides", () => {
    const project = makeProject();
    project.categories[0].wastePercent = 12.5;
    project.categories[0].roundingStep = 0.25;
    const parsed = parseProject(serializeProject(project));
    expect(parsed.categories[0]).toMatchObject({
      wastePercent: 12.5,
      roundingStep: 0.25,
    });
  });

  it("clamps invalid category waste and rounding overrides", () => {
    const raw = JSON.parse(serializeProject(makeProject()));
    raw.categories = [
      { id: "cat_x", name: "X", wastePercent: 400, roundingStep: -2 },
    ];
    raw.settings.quantity.defaultCategoryId = "cat_x";
    const parsed = parseProject(JSON.stringify(raw));
    expect(parsed.categories[0].wastePercent).toBe(100);
    expect(parsed.categories[0].roundingStep).toBe(0);
  });

  it("round-trips per-item visibility and locking", () => {
    const project = makeProject();
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    measure.items[0].visible = false;
    measure.items[0].locked = true;
    const parsed = parseProject(serializeProject(project));
    const item = parsed.layers
      .flatMap((layer) => layer.items)
      .find((entry) => entry.id === "item_a")!;
    expect(item.visible).toBe(false);
    expect(item.locked).toBe(true);
  });

  it("normalizes text rotation and clamps arbitrary text sizes", () => {
    const project = makeProject();
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    draw.items.push({
      id: "item_text",
      page: 1,
      kind: "text",
      points: [{ x: 20, y: 20 }],
      color: "#f2a93b",
      strokeWidth: 2,
      text: "Note",
      fontSize: 900,
      rotation: 450,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const parsed = parseProject(serializeProject(project));
    const text = parsed.layers
      .flatMap((layer) => layer.items)
      .find((item) => item.id === "item_text")!;
    expect(text.rotation).toBe(90);
    expect(text.fontSize).toBe(300);
  });

  it("rejects empty, invalid, and newer project files", () => {
    expect(() => parseProject("not json")).toThrow(/valid JSON/);
    expect(() => parseProject("{}")).toThrow(/schema version/);
    expect(() =>
      parseProject(JSON.stringify({ schemaVersion: 999, document: {} })),
    ).toThrow(/newer version/);
  });

  it("drops items that do not belong to the layer kind and fills missing layers", () => {
    const raw = {
      schemaVersion: 1,
      id: "project_1",
      name: "Test",
      document: defaultDocument("Test.pdf", 1),
      settings: {},
      pages: {},
      activeLayerId: "missing",
      layers: [
        {
          id: "draw_1",
          name: "Drawings",
          kind: "draw",
          visible: true,
          locked: false,
          opacity: 1,
          color: "#f2a93b",
          items: [
            {
              id: "wrong_layer",
              page: 1,
              kind: "length",
              points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
              color: "#fff",
              strokeWidth: 1,
            },
          ],
        },
      ],
    };
    const parsed = parseProject(JSON.stringify(raw));
    expect(parsed.layers.some((layer) => layer.kind === "measure")).toBe(true);
    expect(parsed.layers.find((layer) => layer.id === "draw_1")?.items).toHaveLength(0);
    expect(parsed.layers.some((layer) => layer.id === parsed.activeLayerId)).toBe(true);
  });

  it("normalizes malformed document references", () => {
    const parsed = parseProject(
      JSON.stringify({
        schemaVersion: 1,
        document: {
          name: 123,
          path: 42,
          relativePath: false,
          sha256: { hash: "nope" },
          pageCount: "two",
          sizeBytes: -90,
        },
      }),
    );

    expect(parsed.documents).toHaveLength(1);
    expect(parsed.documents[0]).toMatchObject({
      kind: "pdf",
      name: "Untitled.pdf",
      path: null,
      relativePath: null,
      sha256: "",
      pageCount: 1,
      sizeBytes: 0,
    });
    expect(parsed.documents[0].id).toMatch(/^doc_/);
  });

  it("leaves legacy items without a scale snapshot undefined", () => {
    const raw = {
      schemaVersion: 1,
      document: defaultDocument("Test.pdf", 1),
      pages: {
        "1": {
          calibration: createCalibration({ x: 0, y: 0 }, { x: 100, y: 0 }, 5, "m"),
        },
      },
      layers: [
        {
          id: "measure_1",
          name: "Measurements",
          kind: "measure",
          items: [
            {
              id: "legacy",
              page: 1,
              kind: "length",
              points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
              color: "#4cc9f0",
              strokeWidth: 2,
            },
          ],
        },
      ],
    };
    const parsed = parseProject(JSON.stringify(raw));
    const item = parsed.layers.find((layer) => layer.kind === "measure")?.items[0];
    expect(item?.scale).toBeUndefined();
  });

  it("computes portable relative document paths", () => {
    expect(relativeDocumentPath("/home/ana/projects/plan.gridscalr", "/home/ana/drawings/a.pdf")).toBe(
      "../drawings/a.pdf",
    );
    expect(relativeDocumentPath("/home/ana/plan.gridscalr", "/home/ana/a.pdf")).toBe("a.pdf");
    expect(relativeDocumentPath("/home/ana/plan.gridscalr", null)).toBeNull();
    expect(resolveRelativePath("/home/ana/projects/plan.gridscalr", "../../drawings/a.pdf")).toBe(
      "/home/drawings/a.pdf",
    );
    expect(resolveRelativePath("/home/ana/projects/plan.gridscalr", null)).toBeNull();
  });

  it("suggests a safe project filename", () => {
    const project = makeProject();
    project.name = 'Floor: Plan / Rev "A"';
    expect(suggestedProjectName(project)).toBe("Floor Plan  Rev A.gridscalr");
  });

  it("migrates schema v1 and v2 projects into the default category model", () => {
    for (const schemaVersion of [1, 2]) {
      const raw = {
        schemaVersion,
        id: "project_legacy",
        name: "Legacy",
        document: defaultDocument("Legacy.pdf", 1),
        settings: { lengthUnit: "m", areaUnit: "m2" },
        pages: {},
        layers: [
          {
            id: "measure_1",
            name: "Measurements",
            kind: "measure",
            items: [
              {
                id: "item_length",
                page: 1,
                kind: "length",
                points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
                color: "#4cc9f0",
                strokeWidth: 2,
              },
              {
                id: "item_area",
                page: 1,
                kind: "area",
                points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
                color: "#4cc9f0",
                strokeWidth: 2,
              },
            ],
          },
        ],
      };
      const parsed = parseProject(JSON.stringify(raw));
      expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
      expect(parsed.categories.map((entry) => entry.name)).toEqual([
        "Floor",
        "Wall",
        "Ceiling",
        "Facade",
        "Roof",
        "Ground",
        "Other",
      ]);
      const other = parsed.categories.find((entry) => entry.name === "Other")!;
      expect(parsed.settings.quantity).toEqual({
        defaultCategoryId: other.id,
        wastePercent: 0,
        roundingStep: 0,
      });

      const items = parsed.layers.flatMap((layer) => layer.items);
      const length = items.find((item) => item.id === "item_length")!;
      const area = items.find((item) => item.id === "item_area")!;
      expect(length.categoryId).toBe(other.id);
      expect(length.room).toBeUndefined();
      expect(length.areaMode).toBeUndefined();
      expect(area.categoryId).toBe(other.id);
      expect(area.areaMode).toBe("add");
      expect(area.areaShape).toBe("polygon");
    }
  });

  it("repairs unknown category references and strips measurement fields from drawings", () => {
    const raw = {
      schemaVersion: 3,
      document: defaultDocument("Plan.pdf", 1),
      categories: [
        { id: "cat_keep", name: "Keep" },
        { id: "cat_other", name: "Other" },
      ],
      settings: { quantity: { defaultCategoryId: "cat_other", wastePercent: 10, roundingStep: 0.5 } },
      layers: [
        {
          id: "measure_1",
          kind: "measure",
          items: [
            {
              id: "orphan",
              page: 1,
              kind: "length",
              points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
              color: "#4cc9f0",
              strokeWidth: 2,
              categoryId: "cat_deleted",
              room: "  Room 5  ",
            },
          ],
        },
        {
          id: "draw_1",
          kind: "draw",
          items: [
            {
              id: "drawing",
              page: 1,
              kind: "rect",
              points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
              color: "#f2a93b",
              strokeWidth: 2,
              categoryId: "cat_keep",
              room: "Room 5",
              areaMode: "subtract",
              countType: "door",
            },
          ],
        },
      ],
    };
    const parsed = parseProject(JSON.stringify(raw));
    const measureItem = parsed.layers
      .flatMap((layer) => layer.items)
      .find((item) => item.id === "orphan")!;
    expect(measureItem.categoryId).toBe("cat_other");
    expect(measureItem.room).toBe("Room 5");

    const drawing = parsed.layers
      .flatMap((layer) => layer.items)
      .find((item) => item.id === "drawing")!;
    expect(drawing.categoryId).toBeUndefined();
    expect(drawing.room).toBeUndefined();
    expect(drawing.areaMode).toBeUndefined();
    expect(drawing.countType).toBeUndefined();

    expect(parsed.settings.quantity.wastePercent).toBe(10);
    expect(parsed.settings.quantity.roundingStep).toBe(0.5);
  });

  it("round-trips count items with a single anchor point", () => {
    const project = makeProject();
    const category = project.categories[0];
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    measure.items.push({
      id: "item_count",
      page: 1,
      kind: "count",
      points: [{ x: 30, y: 40 }],
      color: "#4cc9f0",
      strokeWidth: 2,
      categoryId: category.id,
      room: "Room 101",
      countType: "door",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const parsed = parseProject(serializeProject(project));
    const item = parsed.layers
      .flatMap((layer) => layer.items)
      .find((entry) => entry.id === "item_count")!;
    expect(item.kind).toBe("count");
    expect(item.points).toEqual([{ x: 30, y: 40 }]);
    expect(item.categoryId).toBe(category.id);
    expect(item.room).toBe("Room 101");
    expect(item.countType).toBe("door");
    expect(item.areaMode).toBeUndefined();
  });

  it("normalizes duplicate and empty category names while keeping ids", () => {
    const parsed = parseProject(
      JSON.stringify({
        schemaVersion: 3,
        document: defaultDocument("Plan.pdf", 1),
        categories: [
          { id: "cat_a", name: " Floor " },
          { id: "cat_b", name: "floor" },
          { id: "cat_c", name: "   " },
          { id: "cat_d", name: "Other" },
          { id: "cat_d", name: "Duplicate id" },
        ],
        settings: { quantity: { defaultCategoryId: "cat_d" } },
        layers: [],
      }),
    );

    expect(parsed.categories.map((entry) => entry.name)).toEqual(["Floor", "floor 2", "Other", "Duplicate id"]);
    expect(new Set(parsed.categories.map((entry) => entry.id)).size).toBe(4);
    expect(findCategory(parsed, "cat_a")?.name).toBe("Floor");
    expect(findCategory(parsed, "cat_b")?.name).toBe("floor 2");
    expect(parsed.settings.quantity.defaultCategoryId).toBe("cat_d");
  });

  it("repairs an invalid default category and unknown count types", () => {
    const parsed = parseProject(
      JSON.stringify({
        schemaVersion: 3,
        document: defaultDocument("Plan.pdf", 1),
        categories: [{ id: "cat_a", name: "Floor" }],
        settings: { quantity: { defaultCategoryId: "cat_gone", wastePercent: 400, roundingStep: -2 } },
        layers: [
          {
            id: "measure_1",
            kind: "measure",
            items: [
              {
                id: "count_bad",
                page: 1,
                kind: "count",
                points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
                color: "#4cc9f0",
                strokeWidth: 2,
                countType: "spaceship",
              },
            ],
          },
        ],
      }),
    );

    expect(parsed.settings.quantity.defaultCategoryId).toBe("cat_a");
    expect(parsed.settings.quantity.wastePercent).toBe(100);
    expect(parsed.settings.quantity.roundingStep).toBe(0);
    const item = parsed.layers.flatMap((layer) => layer.items)[0];
    expect(item.countType).toBe("other");
    expect(item.points).toHaveLength(1);
    expect(item.categoryId).toBe("cat_a");
  });

  it("round-trips manual scales, scale locks, quick areas, and snap tolerance", () => {
    const project = makeProject();
    project.pages["1"] = {
      calibration: createManualCalibration(100),
      scaleLocked: true,
    };
    project.settings.snapTolerancePx = 12;
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    measure.items.push({
      id: "item_quick_area",
      page: 1,
      kind: "area",
      points: [{ x: 10, y: 20 }, { x: 110, y: 70 }],
      color: "#4cc9f0",
      strokeWidth: 2,
      areaMode: "add",
      areaShape: "rectangle",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const parsed = parseProject(serializeProject(project));
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.settings.snapTolerancePx).toBe(12);
    expect(parsed.pages["1"].scaleLocked).toBe(true);
    const calibration = parsed.pages["1"].calibration;
    expect(calibration?.source).toBe("manual");
    if (calibration?.source === "manual") {
      expect(calibration.ratio).toBe(100);
      expect(calibration.pointsPerMeter).toBeCloseTo(manualPointsPerMeter(100), 6);
    }
    const area = parsed.layers
      .flatMap((layer) => layer.items)
      .find((item) => item.id === "item_quick_area")!;
    expect(area.areaShape).toBe("rectangle");
  });

  it("normalizes a source-less reference calibration from schema v3", () => {
    const raw = JSON.parse(serializeProject(makeProject()));
    raw.schemaVersion = 3;
    delete raw.pages["1"].calibration.source;

    const parsed = parseProject(JSON.stringify(raw));
    const calibration = parsed.pages["1"].calibration;
    expect(calibration?.source).toBe("reference");
    if (calibration?.source !== "manual") {
      expect(calibration?.p1).toEqual({ x: 0, y: 0 });
      expect(calibration?.knownLength).toBe(5);
    }
  });

  it("normalizes v3 snap settings, manual scales, locks, and malformed quick areas", () => {
    const raw = JSON.parse(serializeProject(makeProject()));
    raw.schemaVersion = 3;
    raw.settings.snapTolerancePx = 1;
    raw.pages["1"] = {
      calibration: {
        id: "cal_manual",
        source: "manual",
        ratio: 200,
        pointsPerMeter: 999,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      scaleLocked: true,
    };
    raw.pages["2"] = {
      calibration: {
        id: "cal_invalid_manual",
        source: "manual",
        ratio: 100,
        pointsPerMeter: 0,
      },
      scaleLocked: true,
    };
    const measure = raw.layers.find((layer: { kind: string }) => layer.kind === "measure");
    measure.items.push(
      {
        id: "bad_rectangle",
        page: 1,
        kind: "area",
        points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
        color: "#4cc9f0",
        strokeWidth: 2,
        areaShape: "rectangle",
      },
      {
        id: "unknown_shape",
        page: 1,
        kind: "area",
        points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
        color: "#4cc9f0",
        strokeWidth: 2,
        areaShape: "triangle",
      },
      {
        id: "undersized_ellipse",
        page: 1,
        kind: "area",
        points: [{ x: 0, y: 0 }],
        color: "#4cc9f0",
        strokeWidth: 2,
        areaShape: "ellipse",
      },
    );
    const draw = raw.layers.find((layer: { kind: string }) => layer.kind === "draw");
    draw.items.push({
      id: "drawing_with_shape",
      page: 1,
      kind: "rect",
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      color: "#f2a93b",
      strokeWidth: 2,
      areaShape: "ellipse",
    });

    const parsed = parseProject(JSON.stringify(raw));
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.settings.snapTolerancePx).toBe(2);
    expect(parsed.pages["2"]).toBeUndefined();

    const calibration = parsed.pages["1"].calibration;
    expect(calibration?.source).toBe("manual");
    if (calibration?.source === "manual") {
      expect(calibration.pointsPerMeter).toBeCloseTo(manualPointsPerMeter(200), 6);
    }

    const badRectangle = parsed.layers
      .flatMap((layer) => layer.items)
      .find((item) => item.id === "bad_rectangle")!;
    expect(badRectangle.areaShape).toBe("rectangle");
    expect(badRectangle.points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    const unknownShape = parsed.layers
      .flatMap((layer) => layer.items)
      .find((item) => item.id === "unknown_shape")!;
    expect(unknownShape.areaShape).toBe("polygon");
    expect(
      parsed.layers
        .flatMap((layer) => layer.items)
        .some((item) => item.id === "undersized_ellipse"),
    ).toBe(false);
    const drawing = parsed.layers
      .flatMap((layer) => layer.items)
      .find((item) => item.id === "drawing_with_shape")!;
    expect(drawing.areaShape).toBeUndefined();
  });

  it("accepts the square yard area unit", () => {
    const project = makeProject();
    project.settings.areaUnit = "yd2";
    const parsed = parseProject(serializeProject(project));
    expect(parsed.settings.areaUnit).toBe("yd2");
  });

  it("migrates a v4 project to the current schema with an empty asset map", () => {
    const raw = JSON.parse(serializeProject(makeProject()));
    raw.schemaVersion = 4;
    delete raw.assets;
    const parsed = parseProject(JSON.stringify(raw));
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.assets).toEqual({});
  });

  it("round-trips embedded images and image items", () => {
    const project = makeProject();
    const data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
    project.assets["img_a"] = {
      id: "img_a",
      name: "Detail.png",
      mime: "image/png",
      width: 640,
      height: 480,
      byteSize: data.length,
      data,
    };
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    draw.items.push({
      id: "item_image",
      page: 1,
      kind: "image",
      points: [{ x: 20, y: 20 }, { x: 220, y: 170 }],
      color: "#7aa2f7",
      strokeWidth: 1,
      opacity: 0.6,
      rotation: 30,
      image: { assetId: "img_a", mode: "annotation" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const parsed = parseProject(serializeProject(project));
    expect(parsed.assets["img_a"]).toMatchObject({
      name: "Detail.png",
      mime: "image/png",
      width: 640,
      height: 480,
      data,
    });
    const item = parsed.layers
      .flatMap((layer) => layer.items)
      .find((entry) => entry.id === "item_image")!;
    expect(item.kind).toBe("image");
    expect(item.image).toEqual({ assetId: "img_a", mode: "annotation" });
    expect(item.opacity).toBe(0.6);
    expect(item.rotation).toBe(30);
  });

  it("normalizes an unknown image mode to background", () => {
    const project = makeProject();
    project.assets["img_mode"] = {
      id: "img_mode",
      name: "Mode.png",
      mime: "image/png",
      width: 10,
      height: 10,
      byteSize: 44,
      data: "data:image/png;base64,iVBORw0KGgo=",
    };
    project.layers
      .find((layer) => layer.kind === "draw")!
      .items.push({
        id: "item_image_mode",
        page: 1,
        kind: "image",
        points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
        color: "#7aa2f7",
        strokeWidth: 1,
        image: { assetId: "img_mode", mode: "annotation" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    const raw = JSON.parse(serializeProject(project));
    const rawItem = raw.layers
      .flatMap((layer: { items: { id: string; image?: { mode: string } }[] }) => layer.items)
      .find((item: { id: string }) => item.id === "item_image_mode");
    rawItem.image.mode = "sticker";
    const parsed = parseProject(JSON.stringify(raw));
    const item = parsed.layers.flatMap((layer) => layer.items).find((entry) => entry.id === "item_image_mode");
    expect(item?.image).toEqual({ assetId: "img_mode", mode: "background" });
  });

  it("drops image items with missing or invalid assets", () => {
    const project = makeProject();
    project.assets["img_bad"] = {
      id: "img_bad",
      name: "Broken.png",
      mime: "image/png",
      width: 10,
      height: 10,
      byteSize: 4,
      data: "not-an-image",
    };
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    const base = {
      page: 1,
      color: "#7aa2f7",
      strokeWidth: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    draw.items.push(
      {
        ...base,
        id: "missing_asset",
        kind: "image",
        points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
        image: { assetId: "img_missing", mode: "background" },
      },
      {
        ...base,
        id: "bad_asset",
        kind: "image",
        points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
        image: { assetId: "img_bad", mode: "background" },
      },
    );
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    measure.items.push({
      ...base,
      id: "image_on_measure",
      kind: "image",
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      image: { assetId: "img_bad", mode: "background" },
    });

    const parsed = parseProject(serializeProject(project));
    expect(parsed.assets.img_bad).toBeUndefined();
    const ids = parsed.layers.flatMap((layer) => layer.items).map((item) => item.id);
    expect(ids).not.toContain("missing_asset");
    expect(ids).not.toContain("bad_asset");
    expect(ids).not.toContain("image_on_measure");
  });
  it("migrates a schema 5 project into a single document entry", () => {
    const project = makeProject();
    const raw = JSON.parse(serializeProject(project));
    expect(raw.schemaVersion).toBe(SCHEMA_VERSION);
    delete raw.documents;
    raw.schemaVersion = 5;
    raw.document = {
      name: "Legacy.pdf",
      path: "/plans/Legacy.pdf",
      relativePath: "Legacy.pdf",
      sha256: "oldhash",
      pageCount: 2,
      sizeBytes: 1024,
    };

    const parsed = parseProject(JSON.stringify(raw));
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.documents).toHaveLength(1);
    expect(parsed.documents[0]).toMatchObject({
      kind: "pdf",
      name: "Legacy.pdf",
      path: "/plans/Legacy.pdf",
      relativePath: "Legacy.pdf",
      sha256: "oldhash",
      pageCount: 2,
      sizeBytes: 1024,
    });
    expect(parsed.documents[0].id).toMatch(/^doc_/);
    // Page state keys survive unchanged so calibrations keep pointing at the right sheet.
    expect(parsed.pages["1"].calibration?.pointsPerMeter).toBe(20);
  });

  it("round-trips a project with an embedded TIF document", () => {
    const project = makeProject();
    project.documents.push({
      id: "doc_tif",
      kind: "tiff",
      name: "Plan.tif",
      path: "/plans/Plan.tif",
      relativePath: "Plan.tif",
      sha256: "tifhash",
      pageCount: 1,
      sizeBytes: 4096,
      embeddedPdf: "JVBERi0xLjQK",
      source: { format: "tiff", dpi: [400, 400], originalName: "Plan.tif" },
    });
    project.pages["3"] = { calibration: createManualCalibration(100) };

    const parsed = parseProject(serializeProject(project));
    expect(parsed.documents).toHaveLength(2);
    expect(parsed.documents[1]).toMatchObject({
      id: "doc_tif",
      kind: "tiff",
      name: "Plan.tif",
      pageCount: 1,
      embeddedPdf: "JVBERi0xLjQK",
      source: { format: "tiff", dpi: [400, 400], originalName: "Plan.tif" },
    });
    expect(parsed.pages["3"].calibration?.source).toBe("manual");
  });

  it("rejects a TIF document without its embedded PDF", () => {
    const project = makeProject();
    const raw = JSON.parse(serializeProject(project));
    raw.documents = [
      {
        id: "doc_tif",
        kind: "tiff",
        name: "Broken.tif",
        path: null,
        relativePath: null,
        sha256: "",
        pageCount: 1,
        sizeBytes: 0,
      },
    ];
    expect(() => parseProject(JSON.stringify(raw))).toThrow(/missing its embedded PDF/i);
  });

  it("drops page state beyond the last page", () => {
    const project = makeProject();
    const raw = JSON.parse(serializeProject(project));
    raw.pages["9"] = { calibration: createManualCalibration(50) };
    const parsed = parseProject(JSON.stringify(raw));
    expect(parsed.pages["9"]).toBeUndefined();
  });
});
