import { describe, expect, it } from "vitest";
import { createCalibration } from "../src/model/calibration";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import type { MarkupItem } from "../src/model/types";
import {
  parseProject,
  relativeDocumentPath,
  resolveRelativePath,
  serializeProject,
  suggestedProjectName,
} from "../src/io/projectFile";

function makeProject() {
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
});
