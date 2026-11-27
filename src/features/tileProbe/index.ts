/**
 * Tile-path verification: a debug-only probe that compares the tiled primary
 * raster with the whole-page path at several zoom levels. The packaged smoke
 * test runs it on Linux (WebKitGTK), macOS (WKWebView) and Windows (WebView2),
 * so a blank or offset tile becomes a recorded result instead of an assumption.
 */

export {
  runTileProbe,
  type TileProbeHost,
  type TileProbeLevel,
  type TileProbeReport,
  type TileProbeVerdict,
} from "./controller";
export { createTileProbeAccess, type TileProbeAccess, type TileProbeRaster } from "./access";
export { ProbePathSwitch, type ProbePathState } from "./pathState";
export {
  TILE_PROBE_ANTIALIAS_MAX_RATIO,
  TILE_PROBE_ANTIALIAS_MIN_COVERAGE,
  TILE_PROBE_BLANK_BLOCKS,
  TILE_PROBE_BLANK_MIN_CONTENT,
  TILE_PROBE_MAX_CHANNEL_DELTA,
  TILE_PROBE_MAX_DIFF_RATIO,
  TILE_PROBE_SHIFT_PX,
  TILE_PROBE_ZOOMS,
  bestShift,
  blankBlocks,
  boundsCoverage,
  centeredView,
  compareRasters,
  isOffsetShift,
  pathMatches,
  rasterHasContent,
  shiftedDifferenceRatio,
  type DiffBounds,
  type RasterDiff,
  type RasterPixels,
  type ShiftMatch,
} from "./model";
