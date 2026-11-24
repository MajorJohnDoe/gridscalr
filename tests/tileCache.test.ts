import { describe, expect, it } from "vitest";
import {
  TILE_BYTES_PER_PIXEL,
  TILE_CSS_SIZE,
  buildTilePlan,
  distanceFromViewport,
  renderScaleFor,
  selectEvictions,
  supportsTileCache,
  tileByteSize,
  tileKey,
  visibleFirstOrder,
  zoomBucket,
  type TileCacheEntryMeta,
} from "../src/features/tileCache";

const crop = { x: 0, y: 0, width: 600, height: 400 };
const visible = { x: 0, y: 0, width: 600, height: 400 };

function plan(overrides: Partial<Parameters<typeof buildTilePlan>[0]> = {}) {
  return buildTilePlan({
    pageId: "page-1",
    pageNumber: 1,
    zoom: 1,
    dpr: 1,
    crop,
    visible,
    ...overrides,
  });
}

function entry(key: string, x: number, lastUsed = 0): TileCacheEntryMeta {
  return { key, bytes: 4, rect: { x, y: 0, width: 512, height: 512 }, lastUsed, bucket: 0 };
}

describe("tile grid", () => {
  it("covers the whole raster with integer device-pixel tiles", () => {
    const result = plan();
    expect(result.width).toBe(600);
    expect(result.height).toBe(400);
    expect(result.columns).toBe(2);
    expect(result.rows).toBe(1);
    expect(result.tiles).toHaveLength(2);
    expect(result.tiles[0]).toMatchObject({ x: 0, y: 0, width: 512, height: 400 });
    expect(result.tiles[1]).toMatchObject({ x: 512, y: 0, width: 88, height: 400 });
    const covered = result.tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0);
    expect(covered).toBe(600 * 400);
  });

  it("uses the device scale for the tile size and the page-space rect", () => {
    const result = plan({ zoom: 2, dpr: 2 });
    expect(result.scale).toBe(4);
    expect(result.width).toBe(2400);
    expect(result.height).toBe(1600);
    // 512 CSS px at DPR 2 is 1024 device pixels.
    expect(result.tiles[0].width).toBe(1024);
    expect(result.tiles[0].rect.width).toBe(1024 / 4);
    expect(result.columns).toBe(3);
  });

  it("applies the same 4096 px / 8 Mpixel cap as the full-page crop", () => {
    const square = { x: 0, y: 0, width: 3000, height: 3000 };
    const scale = renderScaleFor(square, 10);
    expect(scale).toBeCloseTo(Math.sqrt(8_000_000 / 9_000_000), 6);
    const wide = renderScaleFor({ x: 0, y: 0, width: 8192, height: 100 }, 1);
    expect(wide).toBeCloseTo(4096 / 8192, 6);
  });

  it("produces a stable key per page, crop and tile", () => {
    const a = plan();
    const b = plan();
    expect(a.signature).toBe(b.signature);
    expect(tileKey(a, a.tiles[0])).toBe(tileKey(b, b.tiles[0]));
    expect(tileKey(a, a.tiles[0])).not.toBe(tileKey(a, a.tiles[1]));
  });
});

describe("zoom buckets", () => {
  it("gives the same bucket to a small zoom change", () => {
    expect(zoomBucket(1)).toBe(0);
    expect(zoomBucket(1.01)).toBe(zoomBucket(1));
    expect(zoomBucket(2)).toBe(12);
    expect(zoomBucket(4)).toBe(24);
  });

  it("keeps the bucket stable for a non-finite or unusable zoom", () => {
    expect(zoomBucket(0)).toBe(0);
    expect(zoomBucket(Number.NaN)).toBe(0);
    expect(zoomBucket(-2)).toBe(0);
  });
});

describe("visible-first ordering", () => {
  it("starts with the tile under the viewport centre", () => {
    const result = plan({
      crop: { x: 0, y: 0, width: 1200, height: 1200 },
      visible: { x: 512, y: 512, width: 512, height: 512 },
    });
    const ordered = visibleFirstOrder(result.tiles);
    expect(ordered[0]).toMatchObject({ column: 1, row: 1 });
    expect(distanceFromViewport(ordered[0], result.visible)).toBe(0);
    expect(ordered[ordered.length - 1].distance).toBeGreaterThan(0);
  });
});

describe("byte-bounded eviction", () => {
  it("counts RGBA bytes for one tile", () => {
    expect(tileByteSize(512, 512)).toBe(512 * 512 * TILE_BYTES_PER_PIXEL);
    expect(TILE_CSS_SIZE).toBe(512);
  });

  it("evicts the farthest tiles from the viewport first", () => {
    const keys = selectEvictions(
      [entry("near", 0), entry("middle", 600), entry("far", 1200)],
      8,
      new Set(),
      { x: 0, y: 0, width: 512, height: 512 },
    );
    expect(keys).toEqual(["far"]);
  });

  it("never evicts a tile the current plan needs", () => {
    const keys = selectEvictions(
      [entry("near", 0), entry("middle", 600), entry("far", 1200)],
      8,
      new Set(["far"]),
      { x: 0, y: 0, width: 512, height: 512 },
    );
    expect(keys).toEqual(["middle"]);
  });

  it("does nothing while the cache fits the budget", () => {
    expect(selectEvictions([entry("a", 0)], 4, new Set(), visible)).toEqual([]);
  });
});

describe("capability check", () => {
  it("requires both createImageBitmap and OffscreenCanvas", () => {
    const fn = () => undefined;
    expect(supportsTileCache({ createImageBitmap: fn, OffscreenCanvas: fn })).toBe(true);
    expect(supportsTileCache({ createImageBitmap: fn })).toBe(false);
    expect(supportsTileCache({ OffscreenCanvas: fn })).toBe(false);
    expect(supportsTileCache({})).toBe(false);
  });
});
