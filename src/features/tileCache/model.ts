/**
 * Tile cache: the pure 512 CSS px grid, zoom buckets, visible-first ordering,
 * budget-bounded eviction and the capability check.
 *
 * The grid is expressed in the raster's own device pixels: a tile is a whole
 * number of pixels, so tiles meet without a seam and the composed page matches
 * the single-crop render as closely as PDF.js rasterises the same geometry.
 * Edges are aligned to the crop origin, not the screen, because the crop is
 * what the canvas draws.
 */

/** One tile is 512 CSS px on each side before the device scale is applied. */
export const TILE_CSS_SIZE = 512;

/**
 * Hard cap on retained tile pixels: 64 MiB of RGBA.
 *
 * A 1440 × 900 viewport needs 6 tiles at DPR 1 (6 MiB) or 6 tiles at DPR 2
 * (24 MiB), so the budget holds several recent views and stays well below the
 * 2 GB desktop working-set budget. See docs/limitations.md.
 */
export const TILE_CACHE_BUDGET_BYTES = 64 * 1024 * 1024;

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

/** The same cap `renderCrop()` applies, so the tiled view has the same density. */
export function renderScaleFor(crop: TileRect, requestedScale: number): number {
  const width = Math.max(0.5, crop.width);
  const height = Math.max(0.5, crop.height);
  let scale = Math.min(requestedScale, 4096 / Math.max(width, 1), 4096 / Math.max(height, 1));
  if (width * height * scale * scale > 8_000_000) {
    scale = Math.sqrt(8_000_000 / (width * height));
  }
  return Math.max(0.05, scale);
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
  const scale = renderScaleFor(input.crop, input.zoom * clampDpr(input.dpr));
  const width = Math.max(1, Math.ceil(input.crop.width * scale));
  const height = Math.max(1, Math.ceil(input.crop.height * scale));
  const deviceSize = Math.max(1, Math.round(TILE_CSS_SIZE * clampDpr(input.dpr)));
  const columns = Math.max(1, Math.ceil(width / deviceSize));
  const rows = Math.max(1, Math.ceil(height / deviceSize));
  const bucket = zoomBucket(input.zoom);
  const tiles: PlannedTile[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * deviceSize;
      const y = row * deviceSize;
      const tileWidth = Math.min(deviceSize, width - x);
      const tileHeight = Math.min(deviceSize, height - y);
      if (tileWidth < 1 || tileHeight < 1) continue;
      const dest = { x, y, width: tileWidth, height: tileHeight };
      tiles.push({
        column,
        row,
        ...dest,
        rect: {
          x: input.crop.x + x / scale,
          y: input.crop.y + y / scale,
          width: tileWidth / scale,
          height: tileHeight / scale,
        },
        distance: distanceFromViewport(dest, input.visible),
      });
    }
  }
  const signature = [
    input.pageId,
    bucket,
    input.zoom.toFixed(4),
    scale.toFixed(5),
    `${input.crop.x.toFixed(3)},${input.crop.y.toFixed(3)},${input.crop.width.toFixed(3)},${input.crop.height.toFixed(3)}`,
    `${width}x${height}`,
  ].join("|");
  return {
    pageId: input.pageId,
    pageNumber: input.pageNumber,
    bucket,
    scale,
    dpr: clampDpr(input.dpr),
    width,
    height,
    columns,
    rows,
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
