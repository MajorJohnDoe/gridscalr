/**
 * Tile-path verification: compare the primary canvas raster produced by the
 * tiled path with the same view produced by the whole-page path. The rules are
 * pure so a packaged probe can run on any platform and a unit test can pin the
 * thresholds without a canvas or a PDF.js worker.
 */

/** One captured device-pixel raster. */
export interface RasterPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface DiffBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface RasterDiff {
  differing: number;
  total: number;
  differingRatio: number;
  maxDelta: number;
  /** Bounding box of differing pixels, or null when the rasters agree. */
  bounds: DiffBounds | null;
}

/**
 * Per-tile PDF.js rasterisation is deterministic inside a tile but not
 * bit-identical to one crop over the same geometry. Phase 4 measured ≤ 0.17 %
 * differing pixels and a max channel delta of 27 at rest, so 1 % and 64 leave
 * room for antialiased edges while a blank or offset tile fails loudly.
 */
export const TILE_PROBE_MAX_DIFF_RATIO = 0.01;
export const TILE_PROBE_MAX_CHANNEL_DELTA = 64;

/**
 * A page-wide difference above the strict match but below this share, with no
 * 1-pixel shift and no blank region, is per-tile antialiasing. A blank or
 * misplaced tile is far larger (one clipped 512 px tile is tens of percent of
 * the viewport).
 */
export const TILE_PROBE_ANTIALIAS_MAX_RATIO = 0.02;

/** Coarse grid used to spot a blank region even when the total difference is small. */
export const TILE_PROBE_BLANK_BLOCKS = 8;
/** A block with this much drawing in the full page and almost none in the tiled one is blank. */
export const TILE_PROBE_BLANK_MIN_CONTENT = 16;

/** Zoom levels the probe checks: fit, a working view and a high zoom. */
export const TILE_PROBE_ZOOMS = [1, 3, 6] as const;

/** Largest translation the probe tests when a strict match fails. */
export const TILE_PROBE_SHIFT_PX = 1;

export interface ShiftMatch {
  dx: number;
  dy: number;
  differingRatio: number;
}

/**
 * Counts channel differences between two rasters. A missing tile shows up as
 * transparent pixels against the full-page raster, and an offset tile shows up
 * as a large high-delta region.
 */
export function compareRasters(a: RasterPixels, b: RasterPixels): RasterDiff {
  const total = Math.max(a.width * a.height, b.width * b.height);
  if (a.width !== b.width || a.height !== b.height) {
    return { differing: total, total, differingRatio: 1, maxDelta: 255, bounds: null };
  }
  let differing = 0;
  let maxDelta = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < a.data.length; index += 4) {
    const red = Math.abs(a.data[index] - b.data[index]);
    const green = Math.abs(a.data[index + 1] - b.data[index + 1]);
    const blue = Math.abs(a.data[index + 2] - b.data[index + 2]);
    const alpha = Math.abs(a.data[index + 3] - b.data[index + 3]);
    const delta = Math.max(red, green, blue, alpha);
    if (delta > maxDelta) maxDelta = delta;
    if (delta > 0) {
      differing += 1;
      const pixel = index / 4;
      const x = pixel % a.width;
      const y = Math.floor(pixel / a.width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {
    differing,
    total,
    differingRatio: total > 0 ? differing / total : 1,
    maxDelta,
    bounds: differing > 0 ? { minX, minY, maxX, maxY } : null,
  };
}

function isContentPixel(data: Uint8ClampedArray, index: number): boolean {
  if (data[index + 3] === 0) return false;
  return Math.max(data[index], data[index + 1], data[index + 2]) < 200;
}

/** True when at least one pixel is darker than the page plate, so a blank capture fails. */
export function rasterHasContent(raster: RasterPixels): boolean {
  for (let index = 0; index < raster.data.length; index += 4) {
    if (isContentPixel(raster.data, index)) return true;
  }
  return false;
}

/**
 * Counts coarse grid blocks that carry drawing in the full-page raster but
 * almost none in the tiled one. Catches one blank tile even when the whole
 * image differs by less than the antialiasing allowance.
 */
export function blankBlocks(
  tiled: RasterPixels,
  full: RasterPixels,
  blocks = TILE_PROBE_BLANK_BLOCKS,
): number {
  if (tiled.width !== full.width || tiled.height !== full.height) return 1;
  const size = Math.max(1, Math.floor(blocks));
  const tiledCounts = new Uint32Array(size * size);
  const fullCounts = new Uint32Array(size * size);
  for (let y = 0; y < full.height; y += 1) {
    const row = Math.min(size - 1, Math.floor((y * size) / full.height));
    for (let x = 0; x < full.width; x += 1) {
      const column = Math.min(size - 1, Math.floor((x * size) / full.width));
      const block = row * size + column;
      const index = (y * full.width + x) * 4;
      if (isContentPixel(tiled.data, index)) tiledCounts[block] += 1;
      if (isContentPixel(full.data, index)) fullCounts[block] += 1;
    }
  }
  let blank = 0;
  for (let block = 0; block < tiledCounts.length; block += 1) {
    if (
      fullCounts[block] >= TILE_PROBE_BLANK_MIN_CONTENT &&
      tiledCounts[block] < fullCounts[block] * 0.05
    ) {
      blank += 1;
    }
  }
  return blank;
}

/** True when the tiled and full-page rasters agree within the edge tolerance. */
export function pathMatches(tiled: RasterPixels, full: RasterPixels): boolean {
  if (tiled.width < 1 || tiled.height < 1 || full.width < 1 || full.height < 1) return false;
  if (!rasterHasContent(tiled) || !rasterHasContent(full)) return false;
  const diff = compareRasters(tiled, full);
  return (
    diff.differingRatio <= TILE_PROBE_MAX_DIFF_RATIO &&
    diff.maxDelta <= TILE_PROBE_MAX_CHANNEL_DELTA
  );
}

/**
 * Fraction of differing pixels after shifting `b` by `(dx, dy)` over the
 * overlap. Used only when the strict match fails, to tell a 1-pixel tile
 * misalignment from per-tile antialiasing.
 */
export function shiftedDifferenceRatio(
  a: RasterPixels,
  b: RasterPixels,
  dx: number,
  dy: number,
): number {
  const x0 = Math.max(0, -dx);
  const x1 = Math.min(a.width, b.width - dx);
  const y0 = Math.max(0, -dy);
  const y1 = Math.min(a.height, b.height - dy);
  const width = Math.max(0, x1 - x0);
  const height = Math.max(0, y1 - y0);
  const total = width * height;
  if (!total) return 1;
  let differing = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const ai = (y * a.width + x) * 4;
      const bi = ((y + dy) * b.width + (x + dx)) * 4;
      if (
        a.data[ai] !== b.data[bi] ||
        a.data[ai + 1] !== b.data[bi + 1] ||
        a.data[ai + 2] !== b.data[bi + 2] ||
        a.data[ai + 3] !== b.data[bi + 3]
      ) {
        differing += 1;
      }
    }
  }
  return differing / total;
}

/**
 * Best alignment within `maxShift` pixels. A non-zero shift that materially
 * lowers the difference is a tile offset; no improvement means the difference
 * is per-tile rasterisation, not a misplaced tile.
 */
export function bestShift(
  a: RasterPixels,
  b: RasterPixels,
  maxShift = TILE_PROBE_SHIFT_PX,
): ShiftMatch {
  let best: ShiftMatch = { dx: 0, dy: 0, differingRatio: shiftedDifferenceRatio(a, b, 0, 0) };
  for (let dy = -maxShift; dy <= maxShift; dy += 1) {
    for (let dx = -maxShift; dx <= maxShift; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const ratio = shiftedDifferenceRatio(a, b, dx, dy);
      if (ratio < best.differingRatio) best = { dx, dy, differingRatio: ratio };
    }
  }
  return best;
}

/** True when a non-zero shift explains the difference, so the tile is offset. */
export function isOffsetShift(match: ShiftMatch, zeroRatio: number): boolean {
  return (
    (match.dx !== 0 || match.dy !== 0) &&
    match.differingRatio < zeroRatio * 0.5 &&
    match.differingRatio <= TILE_PROBE_MAX_DIFF_RATIO
  );
}

/** Centres the page in the viewport at a zoom, matching a real settled view. */
export function centeredView(
  pageSize: { width: number; height: number },
  viewport: { width: number; height: number },
  zoom: number,
): { zoom: number; panX: number; panY: number } {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    zoom: safeZoom,
    panX: (viewport.width - pageSize.width * safeZoom) / 2,
    panY: (viewport.height - pageSize.height * safeZoom) / 2,
  };
}
