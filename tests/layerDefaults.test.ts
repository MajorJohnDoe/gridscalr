import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_DRAW_COLOR,
  DEFAULT_LAYER_COLORS,
  DEFAULT_MEASURE_COLOR,
  addLayer,
  createDefaultLayers,
  createProject,
  defaultDocument,
  defaultLayerColors,
  measurementLayerColor,
  resetDefaultLayerColors,
  setDefaultLayerColors,
} from "../src/model/layers";

afterEach(() => resetDefaultLayerColors());

describe("layer colour defaults", () => {
  it("uses signal red for measurements and orange for drawing layers", () => {
    expect(DEFAULT_MEASURE_COLOR).toBe("#f70808");
    expect(DEFAULT_DRAW_COLOR).toBe("#f2a93b");
    const [draw, measure] = createDefaultLayers();
    expect(draw.color).toBe(DEFAULT_DRAW_COLOR);
    expect(measure.color).toBe(DEFAULT_MEASURE_COLOR);
  });

  it("applies the session default to new layers", () => {
    setDefaultLayerColors({ measure: "#ff00aa", draw: "#00AAFF" });
    expect(defaultLayerColors()).toEqual({ measure: "#ff00aa", draw: "#00aaff" });

    const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
    const created = addLayer(project, "measure");
    expect(created.color).toBe("#ff00aa");
    expect(project.layers.find((layer) => layer.kind === "draw")?.color).toBe("#00aaff");
  });

  it("normalizes invalid colours and resets to the app defaults", () => {
    setDefaultLayerColors({ measure: "not-a-colour", draw: "#123456" });
    expect(defaultLayerColors().measure).toBe(DEFAULT_MEASURE_COLOR);
    expect(defaultLayerColors().draw).toBe("#123456");
    expect(resetDefaultLayerColors()).toEqual(DEFAULT_LAYER_COLORS);
  });

  it("uses the editable measurement layer colour for live previews", () => {
    const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    project.activeLayerId = measure.id;
    measure.color = "#123456";
    expect(measurementLayerColor(project, 1)).toBe("#123456");

    measure.visible = false;
    const fallback = addLayer(project, "measure");
    fallback.color = "#654321";
    project.activeLayerId = measure.id;
    expect(measurementLayerColor(project, 1)).toBe("#654321");
  });
});
