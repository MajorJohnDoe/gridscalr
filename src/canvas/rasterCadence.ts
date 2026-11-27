/**
 * Raster scheduling cadence and the first-tile cost rule, pure so the controller
 * and its tests share one definition. Kept beside the raster controller rather
 * than inside it so the scheduling policy does not grow the controller.
 */

/** Coalescing window for a single view change outside a gesture. */
const COALESCE_MS = 90;
/** Shortest delay before a scheduled raster, so a burst shares one render. */
const MIN_WAIT_MS = 16;
/**
 * During a gesture a raster may start no sooner than this after the last one.
 * A coalescing timer alone is reset by every wheel event, so a held scroll would
 * otherwise render nothing until it stopped and the newly exposed strip would
 * stay empty for the whole gesture.
 */
const GESTURE_MIN_INTERVAL_MS = 220;
/**
 * ... and no later than this, so an expensive page still fills while the
 * gesture runs instead of waiting for the release.
 */
const GESTURE_MAX_INTERVAL_MS = 600;
/** A gesture-time raster is spaced at this multiple of its own measured cost. */
const GESTURE_COST_FACTOR = 1.5;
/**
 * PDF.js re-walks the page operator list for every tile, so on a dense drawing
 * a tile can cost as much as a whole crop. When the first tile is this slow the
 * tiled path is abandoned for the full-crop render, which walks the list once.
 */
const TILE_COST_LIMIT_MS = 30;

/**
 * True when the first tile is slow enough to abandon the tiled path for the
 * full-page render. The debug probe sets `forced` so a capture keeps tiles even
 * when the live rule would fall back; the live app never sets it.
 */
export function firstTileTooSlow(input: {
  completed: number;
  firstTileMs: number;
  forced: boolean;
  tilesDisabled: boolean;
}): boolean {
  return (
    !input.forced &&
    !input.tilesDisabled &&
    input.completed === 1 &&
    input.firstTileMs > TILE_COST_LIMIT_MS
  );
}

/**
 * Raster cadence during a gesture: proportional to the last measured cost, so a
 * 46 ms page fills every 220 ms and a 400 ms page every 600 ms, instead of a
 * binary "cheap pages render, expensive pages wait for the release" rule.
 */
export function gestureCadenceMs(lastCostMs: number): number {
  const cost = Number.isFinite(lastCostMs) && lastCostMs > 0 ? lastCostMs : 0;
  return Math.round(
    Math.min(
      GESTURE_MAX_INTERVAL_MS,
      Math.max(GESTURE_MIN_INTERVAL_MS, cost * GESTURE_COST_FACTOR),
    ),
  );
}

/**
 * How long to wait before starting the next raster. During a gesture the
 * measured-cost interval applies; the first schedule after the gesture settles
 * renders at once; an ordinary view change coalesces a burst.
 */
export function cadenceWaitMs(input: {
  gesture: boolean;
  settle: boolean;
  lastCostMs: number;
  overdueMs: number;
}): number {
  const overdue = Number.isFinite(input.overdueMs) ? Math.max(0, input.overdueMs) : 0;
  if (input.gesture) return Math.max(MIN_WAIT_MS, gestureCadenceMs(input.lastCostMs) - overdue);
  if (input.settle) return MIN_WAIT_MS;
  return Math.max(MIN_WAIT_MS, COALESCE_MS - overdue);
}
