import {
  TILE_PROBE_ANTIALIAS_MAX_RATIO,
  TILE_PROBE_ANTIALIAS_MIN_COVERAGE,
  TILE_PROBE_MAX_CHANNEL_DELTA,
  TILE_PROBE_ZOOMS,
  bestShift,
  blankBlocks,
  boundsCoverage,
  centeredView,
  compareRasters,
  isOffsetShift,
  pathMatches,
  rasterHasContent,
  type DiffBounds,
  type RasterPixels,
  type ShiftMatch,
} from "./model";

/** The primary canvas surface the probe drives. */
export interface TileProbeHost {
  pageSize(): { width: number; height: number } | undefined;
  viewportSize(): { width: number; height: number };
  /** False when the runtime lacks the bitmap APIs and only the safe path exists. */
  tileSupported(): boolean;
  /** True when the tiled path is actually serving the current view. */
  tilePathActive(): boolean;
  /**
   * Forces the tiled or whole-page path and hides or shows the level underlay.
   * `force` keeps the tiled path for a capture even when the live first-tile
   * cost rule would abandon it; it is only meaningful when `tileSupported()`.
   */
  setPath(tiled: boolean, levels: boolean, force?: boolean): void;
  setView(zoom: number, panX: number, panY: number): void;
  /** Resolves true once the base raster for the current view is settled. */
  waitForRaster(timeoutMs?: number): Promise<boolean>;
  captureBase(): RasterPixels | null;
}

export type TileProbeVerdict =
  "match" | "antialias" | "offset" | "blank" | "mismatch" | "not-used" | "unready";

function verdictFor(
  tilesUsed: boolean,
  strict: boolean,
  blanks: number,
  offset: boolean,
  ratio: number,
  maxDelta: number,
  bounds: DiffBounds | null,
  total: number,
): TileProbeVerdict {
  // A level that never ran through the tile path must never look like a pass.
  if (!tilesUsed) return "not-used";
  // A missing tile can hide inside the strict-match tolerance when the mark is
  // faint and sparse, so a blank block is decisive before the strict return.
  if (blanks > 0) return "blank";
  if (offset) return "offset";
  if (strict) return "match";
  if (
    ratio <= TILE_PROBE_ANTIALIAS_MAX_RATIO &&
    maxDelta <= TILE_PROBE_MAX_CHANNEL_DELTA &&
    boundsCoverage(bounds, total) >= TILE_PROBE_ANTIALIAS_MIN_COVERAGE
  ) {
    return "antialias";
  }
  return "mismatch";
}

export interface TileProbeLevel {
  zoom: number;
  ready: boolean;
  /** True when tiles served this capture, whether the live path chose them or the probe forced them. */
  tilesUsed: boolean;
  /**
   * True when the probe forced the tiled path for this capture, so `tilesUsed`
   * says nothing about the live first-tile cost rule.
   */
  forced: boolean;
  differing: number;
  total: number;
  differingRatio: number;
  maxDelta: number;
  diffBounds: DiffBounds | null;
  /** Strict 1 % match, kept separately from the final verdict. */
  strictMatch: boolean;
  /** Best 1-px alignment when the strict match failed; null on a match. */
  bestShift: ShiftMatch | null;
  /** True when a non-zero shift explains the difference. */
  offset: boolean;
  /** Coarse blocks that carry drawing in the full page but not in the tiled one. */
  blankBlocks: number;
  verdict: TileProbeVerdict;
  passed: boolean;
}

export interface TileProbeReport {
  supported: boolean;
  /** False when no level actually ran through the tile path. */
  tilePathExercised: boolean;
  levels: TileProbeLevel[];
  passed: boolean;
}

/**
 * Captures the primary canvas through the tiled path and then the whole-page
 * path at the same centred views, and compares the pixels. The probe is
 * debug-only: the packaged smoke test runs it on Linux, macOS and Windows, so
 * WebKitGTK, WKWebView and WebView2 exercise the same code path that ships.
 *
 * When the runtime supports the tile cache the probe forces the tiled path for
 * each capture, so a level is real tile verification rather than a decision of
 * the live first-tile cost rule. Each forced level records `forced`; a runtime
 * without tile support, or a force that fails, stays `not-used` and never passes.
 */
export async function runTileProbe(
  host: TileProbeHost,
  zooms: readonly number[] = TILE_PROBE_ZOOMS,
): Promise<TileProbeReport> {
  const pageSize = host.pageSize();
  const supported = host.tileSupported();
  if (!pageSize) {
    return { supported, tilePathExercised: false, levels: [], passed: false };
  }

  const levels: TileProbeLevel[] = [];
  try {
    for (const zoom of zooms) {
      const view = centeredView(pageSize, host.viewportSize(), zoom);
      // Force tiles for every capture when the runtime supports them. Otherwise
      // the live first-tile cost rule decides per run whether a level is tiled,
      // and the same platform reports `not-used` on one run and tiles on the
      // next. A runtime without the bitmap APIs cannot force and stays
      // `not-used`; a force that fails leaves `tilesUsed` false.
      const force = supported;
      host.setPath(true, false, force);
      host.setView(view.zoom, view.panX, view.panY);
      const tiledReady = await host.waitForRaster();
      const tilesUsed = tiledReady && host.tilePathActive();
      const forced = force && tilesUsed;
      const tiled = tiledReady ? host.captureBase() : null;

      host.setPath(false, false);
      host.setView(view.zoom, view.panX, view.panY);
      const fullReady = await host.waitForRaster();
      const full = fullReady ? host.captureBase() : null;

      if (!tiled || !full) {
        levels.push({
          zoom,
          ready: false,
          tilesUsed,
          forced,
          differing: 0,
          total: 0,
          differingRatio: 1,
          maxDelta: 255,
          diffBounds: null,
          strictMatch: false,
          bestShift: null,
          offset: false,
          blankBlocks: 0,
          verdict: "unready",
          passed: false,
        });
        continue;
      }
      const diff = compareRasters(tiled, full);
      const strict = pathMatches(tiled, full);
      const blanks =
        rasterHasContent(tiled) && rasterHasContent(full) ? blankBlocks(tiled, full) : 1;
      const shift = strict || blanks > 0 ? null : bestShift(tiled, full);
      const offset = shift ? isOffsetShift(shift, diff.differingRatio) : false;
      const verdict = verdictFor(
        tilesUsed,
        strict,
        blanks,
        offset,
        diff.differingRatio,
        diff.maxDelta,
        diff.bounds,
        diff.total,
      );
      levels.push({
        zoom,
        ready: true,
        tilesUsed,
        forced,
        differing: diff.differing,
        total: diff.total,
        differingRatio: diff.differingRatio,
        maxDelta: diff.maxDelta,
        diffBounds: diff.bounds,
        strictMatch: strict,
        bestShift: shift,
        offset,
        blankBlocks: blanks,
        verdict,
        passed: verdict === "match" || verdict === "antialias",
      });
    }
  } finally {
    // Leave the live canvas on the path and underlay it shipped with.
    host.setPath(true, true);
  }
  return {
    supported,
    tilePathExercised: levels.some((level) => level.tilesUsed),
    levels,
    passed: levels.length > 0 && levels.every((level) => level.passed),
  };
}
