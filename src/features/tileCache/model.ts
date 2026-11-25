/**
 * Tile cache: the pure 512 CSS px grid, zoom buckets, visible-first ordering,
 * budget-bounded eviction and the capability check.
 *
 * The grid is anchored to the page, not to the current crop: a tile is
 * identified by its page-space column and row at one render scale, so panning
 * keeps every tile that is still on screen and only the newly exposed edge is
 * rendered. The composition canvas is still crop-sized; tiles that start
 * outside it are clipped by the canvas itself.
 */

/** One tile is 512 CSS px on each side before the device scale is applied. */
export const TILE_CSS_SIZE = 512;

/**
 * Hard cap on retained tile pixels: 128 MiB of RGBA.
 *
 * A 1440 × 900 viewport needs 6 tiles at DPR 1 (6 MiB) or 6 tiles at DPR 2
 * (24 MiB), so the budget holds several recent views and stays well below the
 * 2 GB desktop working-set budget. See docs/limitations.md.
 */
export const TILE_CACHE_BUDGET_BYTES = 128 * 1024 * 1024;

/** `ImageBitmap` and canvas pixels are RGBA in this accounting. */
export const TILE_BYTES_PER_PIXEL = 4;

/** Zoom buckets group tiles for eviction; the render scale stays exact. */
export const ZOOM_BUCKET_STEPS = 12;

export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TilePlanInput {
  pageId: string;
  pageNumber: number;
  zoom: number;
  dpr: number;
  /** Page-space crop, exactly the rect `renderCrop()` would render. */
  crop: TileRect;
  /** Visible part of the crop, in crop device pixels. */
  visible: TileRect;
}

export interface PlannedTile {
  column: number;
  row: number;
  /** Destination origin and size inside the composition, in device pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Page-space rect passed to PDF.js for this tile. */
  rect: TileRect;
  /** Distance from the visible viewport, used for queue and eviction order. */
  distance: number;
}

export interface TilePlan {
  pageId: string;
  pageNumber: number;
  bucket: number;
  scale: number;
  dpr: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  /** Stable key for this exact page, scale and crop. */
  signature: string;
  /** The page-space crop the composition replaces. */
  crop: TileRect;
  visible: TileRect;
  tiles: PlannedTile[];
}

export interface TileCacheStats {
  supported: boolean;
  bytes: number;
  budgetBytes: number;
  tiles: number;
  hits: number;
  misses: number;
  firstTileMs: number | null;
}

export interface TileCacheEntryMeta {
  key: string;
  bytes: number;
  rect: TileRect;
  lastUsed: number;
  bucket: number;
}

export interface TileCapabilityEnv {
  createImageBitmap?: unknown;
  OffscreenCanvas?: unknown;
}

/** WebKitGTK is not assumed: without both APIs the full-page path stays live. */
export function supportsTileCache(env: TileCapabilityEnv = globalThis): boolean {
  return typeof env.createImageBitmap === "function" && typeof env.OffscreenCanvas === "function";
}

/** A stable bucket per ~6 % zoom step, used for grouping and eviction. */
export function zoomBucket(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 0;
  return Math.round(Math.log2(zoom) * ZOOM_BUCKET_STEPS);
}

export function tileByteSize(width: number, height: number): number {
  const w = Math.max(0, Math.round(width));
  const h = Math.max(0, Math.round(height));
  return w * h * TILE_BYTES_PER_PIXEL;
}

function clampDpr(dpr: number): number {
  if (!Number.isFinite(dpr)) return 1;
  return Math.max(0.5, Math.min(4, dpr));
}

/** Distance from a tile to the visible viewport; centred tiles come first. */
export function distanceFromViewport(rect: TileRect, viewport: TileRect): number {
  const gapX = Math.max(
    0,
    viewport.x - (rect.x + rect.width),
    rect.x - (viewport.x + viewport.width),
  );
  const gapY = Math.max(
    0,
    viewport.y - (rect.y + rect.height),
    rect.y - (viewport.y + viewport.height),
  );
  if (gapX > 0 || gapY > 0) return Math.hypot(gapX, gapY);
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  return Math.hypot(
    centerX - (viewport.x + viewport.width / 2),
    centerY - (viewport.y + viewport.height / 2),
  );
}

export function buildTilePlan(input: TilePlanInput): TilePlan {
  const dpr = clampDpr(input.dpr);
  const scale = Math.max(0.05, input.zoom * dpr);
  const deviceSize = Math.max(1, Math.round(TILE_CSS_SIZE * dpr));
  // Page-anchored lattice: the tile step depends only on the zoom, so two crops
  // at the same zoom describe the same tiles and share their cache entries.
  const pageTile = deviceSize / scale;
  const width = Math.max(1, Math.ceil(input.crop.width * scale));
  const height = Math.max(1, Math.ceil(input.crop.height * scale));
  const firstColumn = Math.floor(input.crop.x / pageTile);
  const firstRow = Math.floor(input.crop.y / pageTile);
  const lastColumn = Math.floor((input.crop.x + input.crop.width - 1e-6) / pageTile);
  const lastRow = Math.floor((input.crop.y + input.crop.height - 1e-6) / pageTile);
  const bucket = zoomBucket(input.zoom);
  const tiles: PlannedTile[] = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      // Destinations are crop-device pixels; a tile that begins left of or
      // above the crop is clipped by the composition canvas.
      const dest = {
        x: Math.round((column * pageTile - input.crop.x) * scale),
        y: Math.round((row * pageTile - input.crop.y) * scale),
        width: deviceSize,
        height: deviceSize,
      };
      tiles.push({
        column,
        row,
        ...dest,
        rect: {
          x: column * pageTile,
          y: row * pageTile,
          width: pageTile,
          height: pageTile,
        },
        distance: distanceFromViewport(dest, input.visible),
      });
    }
  }
  // The signature covers the page, the exact render scale and the device tile
  // size. It deliberately excludes the crop, so a pan is a cache hit.
  const signature = [input.pageId, scale.toFixed(6), deviceSize].join("|");
  return {
    pageId: input.pageId,
    pageNumber: input.pageNumber,
    bucket,
    scale,
    dpr,
    width,
    height,
    columns: lastColumn - firstColumn + 1,
    rows: lastRow - firstRow + 1,
    signature,
    crop: { ...input.crop },
    visible: input.visible,
    tiles,
  };
}

/** Visible-first: nearest the viewport centre, then reading order for ties. */
export function visibleFirstOrder(tiles: readonly PlannedTile[]): PlannedTile[] {
  return [...tiles].sort((a, b) => a.distance - b.distance || a.row - b.row || a.column - b.column);
}

export function tileKey(plan: TilePlan, tile: PlannedTile): string {
  return `${plan.signature}:${tile.column},${tile.row}`;
}

/**
 * Keys to drop so the cache fits `budget`. The tiles of the current plan are
 * never evicted; the farthest tiles from the viewport go first, oldest first
 * on a tie.
 */
export function selectEvictions(
  entries: readonly TileCacheEntryMeta[],
  budget: number,
  keep: ReadonlySet<string>,
  viewport: TileRect,
): string[] {
  let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (total <= budget) return [];
  const candidates = entries
    .filter((entry) => !keep.has(entry.key))
    .sort((a, b) => {
      const distance =
        distanceFromViewport(b.rect, viewport) - distanceFromViewport(a.rect, viewport);
      if (distance !== 0) return distance;
      return a.lastUsed - b.lastUsed;
    });
  const evictions: string[] = [];
  for (const entry of candidates) {
    if (total <= budget) break;
    total -= entry.bytes;
    evictions.push(entry.key);
  }
  return evictions;
}
