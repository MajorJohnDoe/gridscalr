import { describe, expect, it } from "vitest";
import { backdropFor, rasterCovers } from "../src/canvas/raster";
import type { RenderResult } from "../src/pdf/pdfRenderer";

function raster(pageNumber: number): RenderResult {
  return {
    pageNumber,
    rect: { x: 0, y: 0, width: 100, height: 100 },
    canvas: {} as HTMLCanvasElement,
    renderScale: 1,
  };
}

describe("backdropFor", () => {
  it("keeps nothing visible when there is no previous raster", () => {
    expect(backdropFor(null, raster(1), 1)).toBeNull();
  });

  it("keeps the previous raster visible under a partial composition", () => {
    const previous = raster(1);
    const current = raster(1);
    expect(backdropFor(previous, current, 1)).toBe(previous);
  });

  it("never repeats the raster that is already drawn on top", () => {
    const same = raster(1);
    expect(backdropFor(same, same, 1)).toBeNull();
  });

  it("never draws a raster from another page", () => {
    expect(backdropFor(raster(2), raster(1), 1)).toBeNull();
  });
});

describe("rasterCovers", () => {
  const raster = { rect: { x: 10, y: 10, width: 100, height: 80 } };

  it("is false without a raster", () => {
    expect(rasterCovers(null, { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it("is true when the raster contains the whole view", () => {
    expect(rasterCovers(raster, { x: 20, y: 20, width: 50, height: 40 })).toBe(true);
  });

  it("is false when the view reaches past the raster", () => {
    expect(rasterCovers(raster, { x: 20, y: 20, width: 120, height: 40 })).toBe(false);
    expect(rasterCovers(raster, { x: 0, y: 20, width: 50, height: 40 })).toBe(false);
  });
});
