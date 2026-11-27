import { describe, expect, it } from "vitest";
import {
  TILE_PROBE_ANTIALIAS_MAX_RATIO,
  TILE_PROBE_ANTIALIAS_MIN_COVERAGE,
  TILE_PROBE_MAX_CHANNEL_DELTA,
  TILE_PROBE_MAX_DIFF_RATIO,
  ProbePathSwitch,
  bestShift,
  blankBlocks,
  boundsCoverage,
  centeredView,
  compareRasters,
  isOffsetShift,
  pathMatches,
  rasterHasContent,
  runTileProbe,
  shiftedDifferenceRatio,
  type RasterPixels,
} from "../src/features/tileProbe";

function raster(width: number, height: number, fill = 255): RasterPixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = fill;
    data[index + 1] = fill;
    data[index + 2] = fill;
    data[index + 3] = 255;
  }
  return { width, height, data };
}

function setPixel(image: RasterPixels, x: number, y: number, value: number): void {
  const index = (y * image.width + x) * 4;
  image.data[index] = value;
  image.data[index + 1] = value;
  image.data[index + 2] = value;
}

/** Spreads `count` differing pixels over the page so the bounds stay page-wide. */
function spreadDifference(image: RasterPixels, count: number, value: number): void {
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / image.width);
    setPixel(image, index % image.width, (index * 7 + row * 3) % image.height, value);
  }
}

describe("tile probe comparison", () => {
  it("reports no difference for identical rasters", () => {
    const diff = compareRasters(raster(4, 4), raster(4, 4));
    expect(diff).toEqual({
      differing: 0,
      total: 16,
      differingRatio: 0,
      maxDelta: 0,
      bounds: null,
    });
  });

  it("counts a differing pixel and its largest channel delta", () => {
    const a = raster(4, 4);
    const b = raster(4, 4);
    setPixel(a, 1, 2, 0);
    setPixel(b, 1, 2, 200);
    setPixel(b, 2, 2, 180);
    setPixel(a, 2, 2, 255);
    const diff = compareRasters(a, b);
    expect(diff.differing).toBe(2);
    expect(diff.total).toBe(16);
    expect(diff.maxDelta).toBe(200);
    expect(diff.differingRatio).toBeCloseTo(2 / 16);
    expect(diff.bounds).toEqual({ minX: 1, minY: 2, maxX: 2, maxY: 2 });
  });

  it("fails loudly when the rasters have different dimensions", () => {
    const diff = compareRasters(raster(4, 4), raster(8, 8));
    expect(diff.differingRatio).toBe(1);
    expect(diff.maxDelta).toBe(255);
    expect(diff.bounds).toBeNull();
  });

  it("accepts an antialiased edge inside the tolerance", () => {
    const tiled = raster(100, 100);
    const full = raster(100, 100);
    // Both paths paint the same dark line; only the edge resamples.
    setPixel(tiled, 0, 5, 40);
    setPixel(full, 0, 5, 40);
    // 50 pixels differ by 20, which is 0.5 % and inside both limits.
    for (let x = 0; x < 50; x += 1) setPixel(tiled, x, 0, 235);
    expect(pathMatches(tiled, full)).toBe(true);
  });

  it("rejects a blank region that the full-page path painted", () => {
    const tiled = raster(100, 100);
    const full = raster(100, 100);
    for (let y = 0; y < 20; y += 1) {
      for (let x = 0; x < 100; x += 1) setPixel(full, x, y, 20);
    }
    expect(pathMatches(tiled, full)).toBe(false);
  });

  it("rejects a capture with no drawing content", () => {
    expect(rasterHasContent(raster(8, 8))).toBe(false);
    const drawn = raster(8, 8);
    setPixel(drawn, 1, 1, 40);
    expect(rasterHasContent(drawn)).toBe(true);
  });

  it("pins the documented tolerance", () => {
    expect(TILE_PROBE_MAX_DIFF_RATIO).toBe(0.01);
    expect(TILE_PROBE_MAX_CHANNEL_DELTA).toBe(64);
    expect(TILE_PROBE_ANTIALIAS_MIN_COVERAGE).toBe(0.25);
  });

  it("measures a differing bound against the page area", () => {
    expect(boundsCoverage({ minX: 0, minY: 0, maxX: 49, maxY: 49 }, 100 * 100)).toBeCloseTo(0.25);
    expect(boundsCoverage({ minX: 10, minY: 10, maxX: 19, maxY: 19 }, 100 * 100)).toBeCloseTo(0.01);
    expect(boundsCoverage(null, 100)).toBe(0);
  });
});

describe("tile probe alignment", () => {
  it("scores identical rasters at zero difference for every shift", () => {
    const image = raster(10, 10, 200);
    expect(shiftedDifferenceRatio(image, image, 1, 0)).toBe(0);
    expect(shiftedDifferenceRatio(image, image, 0, -1)).toBe(0);
  });

  it("finds the one-pixel shift that explains a displaced block", () => {
    const full = raster(20, 20, 255);
    const tiled = raster(20, 20, 255);
    for (let y = 5; y < 10; y += 1) {
      for (let x = 5; x < 10; x += 1) {
        setPixel(full, x, y, 30);
        setPixel(tiled, x - 1, y, 30);
      }
    }
    const zero = compareRasters(tiled, full).differingRatio;
    const shift = bestShift(tiled, full);
    expect(zero).toBeGreaterThan(0.01);
    expect(shift.dx).toBe(1);
    expect(shift.dy).toBe(0);
    expect(shift.differingRatio).toBeLessThan(zero * 0.5);
    expect(isOffsetShift(shift, zero)).toBe(true);
  });

  it("does not call a non-shiftable difference an offset", () => {
    const a = raster(10, 10, 255);
    const b = raster(10, 10, 255);
    setPixel(a, 5, 5, 0);
    const zero = compareRasters(a, b).differingRatio;
    const shift = bestShift(a, b);
    expect(shift).toEqual({ dx: 0, dy: 0, differingRatio: zero });
    expect(isOffsetShift(shift, zero)).toBe(false);
  });
});

describe("tile probe view", () => {
  it("centres the page in the viewport at the requested zoom", () => {
    expect(centeredView({ width: 800, height: 600 }, { width: 1000, height: 800 }, 2)).toEqual({
      zoom: 2,
      panX: (1000 - 1600) / 2,
      panY: (800 - 1200) / 2,
    });
  });

  it("falls back to zoom 1 for an unusable zoom", () => {
    expect(centeredView({ width: 100, height: 100 }, { width: 200, height: 200 }, 0).zoom).toBe(1);
    expect(
      centeredView({ width: 100, height: 100 }, { width: 200, height: 200 }, Number.NaN).zoom,
    ).toBe(1);
  });
});

describe("tile probe blank regions", () => {
  it("finds no blank block when the two paths agree", () => {
    const full = raster(64, 64, 255);
    for (let y = 20; y < 40; y += 1) for (let x = 20; x < 40; x += 1) setPixel(full, x, y, 20);
    expect(blankBlocks(full, full)).toBe(0);
  });

  it("flags a region that the tiled path left blank", () => {
    const full = raster(64, 64, 255);
    for (let y = 20; y < 40; y += 1) for (let x = 20; x < 40; x += 1) setPixel(full, x, y, 20);
    expect(blankBlocks(raster(64, 64, 255), full)).toBeGreaterThan(0);
  });
});

function probeHost(tiled: RasterPixels, full: RasterPixels, supported = true, active = true) {
  let useTiles = true;
  return {
    pageSize: () => ({ width: 100, height: 100 }),
    viewportSize: () => ({ width: 100, height: 100 }),
    tileSupported: () => supported,
    tilePathActive: () => active && useTiles,
    setPath: (next: boolean) => {
      useTiles = next;
    },
    setView: () => undefined,
    waitForRaster: async () => true,
    captureBase: () => (useTiles ? tiled : full),
  };
}

describe("tile probe path state", () => {
  it("restores the tile and level state the probe found", () => {
    const probePath = new ProbePathSwitch();
    const original = { useTiles: false, tilesDisabled: true, levelsDisabled: false };
    expect(probePath.apply(true, false, original)).toEqual({
      useTiles: true,
      tilesDisabled: false,
      levelsDisabled: true,
    });
    expect(probePath.apply(false, false, original).useTiles).toBe(false);
    expect(probePath.apply(true, true, original)).toEqual(original);
  });

  it("keeps the original state when tiles were enabled", () => {
    const probePath = new ProbePathSwitch();
    const original = { useTiles: true, tilesDisabled: false, levelsDisabled: true };
    probePath.apply(true, false, original);
    expect(probePath.apply(true, true, original)).toEqual(original);
  });
});

describe("tile probe verdicts", () => {
  it("passes an identical tiled raster as a match", async () => {
    const image = raster(100, 100, 255);
    setPixel(image, 50, 50, 20);
    const report = await runTileProbe(probeHost(image, image), [1]);
    expect(report.levels[0]).toMatchObject({
      ready: true,
      tilesUsed: true,
      verdict: "match",
      passed: true,
    });
    expect(report.passed).toBe(true);
  });

  it("accepts a page-wide antialiasing difference that no shift explains", async () => {
    const full = raster(100, 100, 255);
    setPixel(full, 0, 99, 20);
    const tiled = raster(100, 100, 255);
    setPixel(tiled, 0, 99, 20);
    spreadDifference(tiled, 150, 240);
    const report = await runTileProbe(probeHost(tiled, full), [1]);
    expect(report.levels[0].strictMatch).toBe(false);
    expect(report.levels[0].verdict).toBe("antialias");
    expect(report.levels[0].passed).toBe(true);
    expect(report.levels[0].differingRatio).toBeLessThanOrEqual(TILE_PROBE_ANTIALIAS_MAX_RATIO);
    expect(
      boundsCoverage(report.levels[0].diffBounds, report.levels[0].total),
    ).toBeGreaterThanOrEqual(TILE_PROBE_ANTIALIAS_MIN_COVERAGE);
  });

  it("fails a localized high-delta seam as a mismatch", async () => {
    const full = raster(100, 100, 255);
    const tiled = raster(100, 100, 255);
    setPixel(full, 0, 99, 20);
    setPixel(tiled, 0, 99, 20);
    for (let y = 30; y < 40; y += 1) {
      for (let x = 30; x < 40; x += 1) setPixel(tiled, x, y, 0);
    }
    const report = await runTileProbe(probeHost(tiled, full), [1]);
    expect(report.levels[0].verdict).toBe("mismatch");
    expect(report.levels[0].passed).toBe(false);
    expect(report.levels[0].maxDelta).toBeGreaterThan(TILE_PROBE_MAX_CHANNEL_DELTA);
  });

  it("fails a two-pixel shift even when its bounds are page-wide", async () => {
    const full = raster(100, 100, 255);
    const tiled = raster(100, 100, 255);
    for (let row = 0; row < 10; row += 1) {
      for (let column = 0; column < 10; column += 1) {
        const x = 5 + column * 10;
        const y = 5 + row * 10;
        setPixel(full, x, y, 20);
        setPixel(tiled, x + 2, y, 20);
      }
    }
    const report = await runTileProbe(probeHost(tiled, full), [1]);
    expect(report.levels[0].verdict).toBe("mismatch");
    expect(report.levels[0].passed).toBe(false);
    expect(report.levels[0].maxDelta).toBeGreaterThan(TILE_PROBE_MAX_CHANNEL_DELTA);
    expect(
      boundsCoverage(report.levels[0].diffBounds, report.levels[0].total),
    ).toBeGreaterThanOrEqual(TILE_PROBE_ANTIALIAS_MIN_COVERAGE);
  });

  it("fails a one-pixel offset as an offset", async () => {
    const full = raster(100, 100, 255);
    const tiled = raster(100, 100, 255);
    for (let y = 30; y < 50; y += 1) {
      for (let x = 30; x < 50; x += 1) {
        setPixel(full, x, y, 20);
        setPixel(tiled, x - 1, y, 20);
      }
    }
    const report = await runTileProbe(probeHost(tiled, full), [1]);
    expect(report.levels[0].verdict).toBe("offset");
    expect(report.levels[0].passed).toBe(false);
  });

  it("fails a blank region as blank", async () => {
    const full = raster(100, 100, 255);
    for (let y = 40; y < 60; y += 1) for (let x = 40; x < 60; x += 1) setPixel(full, x, y, 20);
    const report = await runTileProbe(probeHost(raster(100, 100, 255), full), [1]);
    expect(report.levels[0].verdict).toBe("blank");
    expect(report.levels[0].passed).toBe(false);
  });

  it("fails a sparse faint blank block even when the strict match passes", async () => {
    const full = raster(100, 100, 255);
    const tiled = raster(100, 100, 255);
    setPixel(full, 0, 99, 20);
    setPixel(tiled, 0, 99, 20);
    // A light-grey mark (max channel 199) under 1 % of the page: the strict
    // ratio and channel limits accept it, but the block is still missing.
    for (let y = 10; y < 15; y += 1) {
      for (let x = 10; x < 20; x += 1) setPixel(full, x, y, 199);
    }
    const report = await runTileProbe(probeHost(tiled, full), [1]);
    expect(report.levels[0].strictMatch).toBe(true);
    expect(report.levels[0].blankBlocks).toBeGreaterThan(0);
    expect(report.levels[0].verdict).toBe("blank");
    expect(report.levels[0].passed).toBe(false);
  });

  it("never passes a level where the tile path was not exercised", async () => {
    const image = raster(100, 100, 255);
    setPixel(image, 50, 50, 20);
    const report = await runTileProbe(probeHost(image, image, true, false), [1]);
    expect(report.levels[0]).toMatchObject({
      ready: true,
      tilesUsed: false,
      strictMatch: true,
      verdict: "not-used",
      passed: false,
    });
    expect(report.tilePathExercised).toBe(false);
    expect(report.passed).toBe(false);
  });

  it("reports that the tile path was exercised when a level used tiles", async () => {
    const image = raster(100, 100, 255);
    setPixel(image, 50, 50, 20);
    const report = await runTileProbe(probeHost(image, image), [1]);
    expect(report.tilePathExercised).toBe(true);
    expect(report.levels[0].tilesUsed).toBe(true);
  });
});
