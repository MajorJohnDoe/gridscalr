import { describe, expect, it } from "vitest";
import { createCalibration } from "../src/model/calibration";
import { findCategory } from "../src/model/categories";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
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
    expect(parsed.document.name).toBe("Floor Plan.pdf");
    expect(parsed.document.pageCount).toBe(2);
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

    expect(parsed.document).toEqual({
      name: "Untitled.pdf",
      path: null,
      relativePath: null,
      sha256: "",
      pageCount: 1,
      sizeBytes: 0,
    });
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
      expect(parsed.schemaVersion).toBe(3);
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

  it("accepts the square yard area unit", () => {
    const project = makeProject();
    project.settings.areaUnit = "yd2";
    const parsed = parseProject(serializeProject(project));
    expect(parsed.settings.areaUnit).toBe("yd2");
  });
});
