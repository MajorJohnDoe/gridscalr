import { describe, expect, it } from "vitest";
import {
  backdropFor,
  rasterCovers,
  rasterMatchesView,
  visiblePageRect,
  type RenderedView,
} from "../src/canvas/raster";
import { cadenceWaitMs, firstTileTooSlow, gestureCadenceMs } from "../src/canvas/rasterCadence";
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

describe("visiblePageRect", () => {
  const page = { width: 2000, height: 1500 };

  it("is the viewport in page units when it lies inside the page", () => {
    expect(visiblePageRect(page, 2, -1000, -800, 800, 600)).toEqual({
      x: 500,
      y: 400,
      width: 400,
      height: 300,
    });
  });

  it("is clamped to the page at the fit view", () => {
    // The viewport is larger than the drawing, with empty margin on both sides.
    expect(visiblePageRect(page, 0.25, 100, 100, 800, 600)).toEqual({
      x: 0,
      y: 0,
      width: 2000,
      height: 1500,
    });
  });

  it("is empty for an invalid zoom", () => {
    expect(visiblePageRect(page, 0, 0, 0, 800, 600)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});

describe("rasterMatchesView", () => {
  const viewRaster = raster(1);
  const view = { x: 20, y: 20, width: 50, height: 40 };
  const rendered: RenderedView = { page: 1, zoom: 2, dpr: 1 };

  it("is true when the same page, zoom and density already covers the view", () => {
    expect(rasterMatchesView(viewRaster, rendered, 1, 2, 1, view)).toBe(true);
  });

  it("is false without a raster or a recorded view", () => {
    expect(rasterMatchesView(null, rendered, 1, 2, 1, view)).toBe(false);
    expect(rasterMatchesView(viewRaster, null, 1, 2, 1, view)).toBe(false);
  });

  it("is false when the zoom or the density changed", () => {
    expect(rasterMatchesView(viewRaster, rendered, 1, 3, 1, view)).toBe(false);
    expect(rasterMatchesView(viewRaster, rendered, 1, 2, 2, view)).toBe(false);
  });

  it("is false on another page even when the rect matches", () => {
    expect(rasterMatchesView(viewRaster, rendered, 2, 2, 1, view)).toBe(false);
    expect(rasterMatchesView(viewRaster, { ...rendered, page: 2 }, 2, 2, 1, view)).toBe(false);
  });

  it("is false when the view reaches past the raster", () => {
    expect(rasterMatchesView(viewRaster, rendered, 1, 2, 1, { ...view, width: 500 })).toBe(false);
  });
});

describe("firstTileTooSlow", () => {
  it("abandons tiles when the first tile costs more than 30 ms", () => {
    expect(
      firstTileTooSlow({ completed: 1, firstTileMs: 31, forced: false, tilesDisabled: false }),
    ).toBe(true);
    expect(
      firstTileTooSlow({ completed: 1, firstTileMs: 30, forced: false, tilesDisabled: false }),
    ).toBe(false);
  });

  it("keeps the live cost rule for a slow first tile only", () => {
    expect(
      firstTileTooSlow({ completed: 0, firstTileMs: 99, forced: false, tilesDisabled: false }),
    ).toBe(false);
    expect(
      firstTileTooSlow({ completed: 2, firstTileMs: 99, forced: false, tilesDisabled: false }),
    ).toBe(false);
    expect(
      firstTileTooSlow({ completed: 1, firstTileMs: 99, forced: false, tilesDisabled: true }),
    ).toBe(false);
  });

  it("never abandons tiles while the debug probe forces the tiled path", () => {
    expect(
      firstTileTooSlow({ completed: 1, firstTileMs: 5000, forced: true, tilesDisabled: false }),
    ).toBe(false);
    expect(
      firstTileTooSlow({ completed: 1, firstTileMs: 5000, forced: true, tilesDisabled: true }),
    ).toBe(false);
  });
});

describe("gestureCadenceMs", () => {
  it("never drops below 220 ms", () => {
    expect(gestureCadenceMs(0)).toBe(220);
    expect(gestureCadenceMs(20)).toBe(220);
  });

  it("scales at 1.5 times the measured cost", () => {
    expect(gestureCadenceMs(200)).toBe(300);
    expect(gestureCadenceMs(46)).toBe(220);
    expect(gestureCadenceMs(85)).toBe(220);
  });

  it("never exceeds 600 ms", () => {
    expect(gestureCadenceMs(400)).toBe(600);
    expect(gestureCadenceMs(5000)).toBe(600);
  });

  it("treats a missing cost as the minimum", () => {
    expect(gestureCadenceMs(Number.NaN)).toBe(220);
    expect(gestureCadenceMs(Number.POSITIVE_INFINITY)).toBe(220);
  });
});

describe("cadenceWaitMs", () => {
  it("spaces a gesture-time raster by the measured cost", () => {
    expect(cadenceWaitMs({ gesture: true, settle: false, lastCostMs: 300, overdueMs: 0 })).toBe(
      450,
    );
  });

  it("does not postpone a gesture-time raster that is already overdue", () => {
    expect(cadenceWaitMs({ gesture: true, settle: false, lastCostMs: 300, overdueMs: 900 })).toBe(
      16,
    );
  });

  it("renders at once on the first schedule after the gesture settles", () => {
    expect(cadenceWaitMs({ gesture: false, settle: true, lastCostMs: 300, overdueMs: 0 })).toBe(16);
  });

  it("coalesces an ordinary view change", () => {
    expect(cadenceWaitMs({ gesture: false, settle: false, lastCostMs: 300, overdueMs: 0 })).toBe(
      90,
    );
    expect(cadenceWaitMs({ gesture: false, settle: false, lastCostMs: 300, overdueMs: 70 })).toBe(
      20,
    );
    expect(cadenceWaitMs({ gesture: false, settle: false, lastCostMs: 300, overdueMs: 900 })).toBe(
      16,
    );
  });
});
