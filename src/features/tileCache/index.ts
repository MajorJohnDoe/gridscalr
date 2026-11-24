/**
 * Tile cache: the primary canvas rasterises 512 CSS px tiles in visible-first
 * order, paints the first tile as soon as it exists and keeps a byte-bounded
 * cache. The reference pane and every read-only view stay on the full-page
 * path. The canvas and the PDF renderer import this surface only.
 */

export {
  TileCacheController,
  type TileCacheHost,
  type TileRaster,
  type TileRenderSource,
  type TileRenderTask,
} from "./controller";
export {
  TILE_BYTES_PER_PIXEL,
  TILE_CACHE_BUDGET_BYTES,
  TILE_CSS_SIZE,
  ZOOM_BUCKET_STEPS,
  buildTilePlan,
  distanceFromViewport,
  renderScaleFor,
  selectEvictions,
  supportsTileCache,
  tileByteSize,
  tileKey,
  visibleFirstOrder,
  zoomBucket,
  type PlannedTile,
  type TileCacheEntryMeta,
  type TileCacheStats,
  type TileCapabilityEnv,
  type TilePlan,
  type TilePlanInput,
  type TileRect,
} from "./model";
export { renderPageRaster, type PageRaster, type RasterTask } from "./render";
