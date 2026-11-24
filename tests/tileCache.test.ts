import { describe, expect, it } from "vitest";
import {
  TILE_BYTES_PER_PIXEL,
  TILE_CSS_SIZE,
  buildTilePlan,
  distanceFromViewport,
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
  it("covers the raster with page-anchored tiles", () => {
    const result = plan();
    expect(result.scale).toBe(1);
    expect(result.width).toBe(600);
    expect(result.height).toBe(400);
    expect(result.columns).toBe(2);
    expect(result.rows).toBe(1);
    expect(result.tiles).toHaveLength(2);
    expect(result.tiles[0]).toMatchObject({ column: 0, row: 0, x: 0, y: 0 });
    expect(result.tiles[1]).toMatchObject({ column: 1, row: 0, x: 512, y: 0 });
    const right = Math.max(...result.tiles.map((tile) => tile.x + tile.width));
    const bottom = Math.max(...result.tiles.map((tile) => tile.y + tile.height));
    expect(right).toBeGreaterThanOrEqual(result.width);
    expect(bottom).toBeGreaterThanOrEqual(result.height);
  });

  it("uses one device tile size at the exact render scale", () => {
    const result = plan({ zoom: 2, dpr: 2 });
    expect(result.scale).toBe(4);
    expect(result.width).toBe(2400);
    expect(result.height).toBe(1600);
    expect(result.tiles[0].width).toBe(1024);
    expect(result.tiles[0].rect.width).toBe(1024 / 4);
    expect(result.columns).toBe(3);
  });

  it("still covers the crop when it starts inside a tile", () => {
    const result = plan({ crop: { x: 300, y: 200, width: 600, height: 400 } });
    expect(result.tiles[0].x).toBeLessThan(0);
    expect(result.tiles[0].y).toBeLessThan(0);
    const right = Math.max(...result.tiles.map((tile) => tile.x + tile.width));
    const bottom = Math.max(...result.tiles.map((tile) => tile.y + tile.height));
    expect(right).toBeGreaterThanOrEqual(result.width);
    expect(bottom).toBeGreaterThanOrEqual(result.height);
  });

  it("reuses every tile when a pan stays inside the rendered columns", () => {
    const before = plan();
    const after = plan({ crop: { x: 128, y: 0, width: 600, height: 400 } });
    const beforeKeys = new Set(before.tiles.map((tile) => tileKey(before, tile)));
    expect(after.tiles.every((tile) => beforeKeys.has(tileKey(after, tile)))).toBe(true);
  });

  it("renders only the newly exposed column after a longer pan", () => {
    const before = plan();
    const after = plan({ crop: { x: 600, y: 0, width: 600, height: 400 } });
    const beforeKeys = new Set(before.tiles.map((tile) => tileKey(before, tile)));
    const fresh = after.tiles.filter((tile) => !beforeKeys.has(tileKey(after, tile)));
    expect(fresh).toHaveLength(1);
    expect(fresh[0].column).toBe(2);
  });

  it("keeps one signature for the page at a given scale", () => {
    const a = plan();
    const b = plan({ crop: { x: 300, y: 100, width: 600, height: 400 } });
    expect(a.signature).toBe(b.signature);
    expect(tileKey(a, a.tiles[0])).toBe(tileKey(b, b.tiles[0]));
  });

  it("changes the signature when the render scale changes", () => {
    expect(plan().signature).not.toBe(plan({ zoom: 2 }).signature);
    expect(plan().signature).not.toBe(plan({ dpr: 2 }).signature);
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
