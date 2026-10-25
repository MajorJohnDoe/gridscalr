import { describe, expect, it } from "vitest";
import {
  cropAreaPercent,
  defaultDrawingExportOptions,
  formatPageList,
  normalizeCropRect,
  pageRectFromCrop,
  parsePageRange,
} from "../src/model/export";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";

describe("drawing export model", () => {
  it("parses single pages, ranges, and comma-separated selections", () => {
    expect(parsePageRange("1", 5)).toEqual({ pages: [1], error: null });
    expect(parsePageRange("1-3", 5)).toEqual({ pages: [1, 2, 3], error: null });
    expect(parsePageRange("1,3,5", 5)).toEqual({ pages: [1, 3, 5], error: null });
    expect(parsePageRange("3-1", 5).error).toContain("reversed");
    expect(parsePageRange("1-3, 5", 5)).toEqual({ pages: [1, 2, 3, 5], error: null });
  });

  it("sorts and de-duplicates page ranges", () => {
    expect(parsePageRange("5, 2-3, 2, 1", 5)).toEqual({ pages: [1, 2, 3, 5], error: null });
    expect(formatPageList([5, 2, 3, 1, 3])).toBe("1-3, 5");
  });

  it("rejects empty, zero, reversed, out-of-range, and malformed ranges", () => {
    expect(parsePageRange("", 5).error).toContain("at least one page");
    expect(parsePageRange("0", 5).error).toContain("start at 1");
    expect(parsePageRange("1-0", 5).error).toContain("start at 1");
    expect(parsePageRange("2-1", 5).error).toContain("reversed");
    expect(parsePageRange("1-6", 5).error).toContain("between 1 and 5");
    expect(parsePageRange("abc", 5).error).toContain("page numbers");
    expect(parsePageRange("1,,2", 5).error).toContain("page numbers");
  });

  it("normalizes and clamps crop rectangles to the visible page", () => {
    const crop = normalizeCropRect(
      { x: 20, y: 10, width: 60, height: 40 },
      { width: 200, height: 100 },
    );
    expect(crop).toEqual({ x: 0.1, y: 0.1, width: 0.3, height: 0.4 });
    expect(cropAreaPercent(crop!)).toBeCloseTo(12, 6);

    const clamped = normalizeCropRect(
      { x: -20, y: -10, width: 100, height: 50 },
      { width: 200, height: 100 },
    );
    expect(clamped).toEqual({ x: 0, y: 0, width: 0.4, height: 0.4 });
    expect(pageRectFromCrop(clamped!, { width: 200, height: 100 })).toEqual({
      x: 0,
      y: 0,
      width: 80,
      height: 40,
    });
    expect(
      normalizeCropRect({ x: 0, y: 0, width: 0.2, height: 0.2 }, { width: 200, height: 100 }),
    ).toBeNull();
  });

  it("applies the same relative crop to pages of different sizes", () => {
    const crop = { x: 0.25, y: 0.2, width: 0.5, height: 0.6 };
    expect(pageRectFromCrop(crop, { width: 200, height: 100 })).toEqual({
      x: 50,
      y: 20,
      width: 100,
      height: 60,
    });
    expect(pageRectFromCrop(crop, { width: 300, height: 150 })).toEqual({
      x: 75,
      y: 30,
      width: 150,
      height: 90,
    });
  });

  it("defaults exports to the current page and all visible layers", () => {
    const project = createProject(
      { ...defaultDocument("Export.pdf", 3), pageCount: 3 },
      createDefaultLayers(),
    );
    project.layers[0].visible = false;
    const options = defaultDrawingExportOptions(project, 99);
    expect(options.pages).toEqual([3]);
    expect(options.layerIds).toEqual(
      project.layers.filter((layer) => layer.visible).map((layer) => layer.id),
    );
    expect(options).toMatchObject({
      includeLabels: true,
      includeCalibration: true,
      includeLegend: false,
    });
  });
});
