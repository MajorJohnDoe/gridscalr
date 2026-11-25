/**
 * Gesture-time content reuse: the pure settle rule.
 *
 * While a pan or a wheel zoom is in flight the canvas paints the previous item
 * raster transformed by the gesture instead of redrawing every item. That
 * raster is only a stand-in, so a short idle window after the last gesture
 * input decides when the real redraw happens. The rule lives here so it can be
 * tested without a canvas, a clock or a timer.
 */

/** Default idle window after the last wheel event. */
export const GESTURE_SETTLE_MS = 120;

/**
 * A gesture that keeps receiving input still gets a real content redraw this
 * often. Without it a long wheel stream or a slow drag shows the captured
 * raster until the gesture ends, so newly exposed markups stay missing.
 */
export const GESTURE_REFRESH_MS = 250;

/** A settle delay under one frame would spin the timer instead of drawing. */
export const MIN_GESTURE_SETTLE_MS = 16;

export interface SettleClock {
  /** `performance.now()` value of the most recent gesture input. */
  lastInputAt: number;
  /** Idle window for this gesture. */
  idleMs: number;
}

/** Keeps a caller-supplied idle window inside a range a timer can honour. */
export function clampSettleMs(idleMs: number): number {
  if (!Number.isFinite(idleMs)) return GESTURE_SETTLE_MS;
  return Math.max(MIN_GESTURE_SETTLE_MS, idleMs);
}

/**
 * Milliseconds left before the real redraw, or 0 when it is due now. A sample
 * that is not finite, or a clock that reads before the last input, settles at
 * once: a bad timestamp may cost one sharp frame early, never a stale one late.
 */
export function settleDelay(now: number, clock: SettleClock): number {
  const elapsed = now - clock.lastInputAt;
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  return Math.max(0, clampSettleMs(clock.idleMs) - elapsed);
}

export function settleDue(now: number, clock: SettleClock): boolean {
  return settleDelay(now, clock) === 0;
}

/**
 * True when a still-running gesture owes a real content redraw. A sample that
 * is not finite never forces one, so a bad clock cannot cause a redraw storm.
 */
export function refreshDue(now: number, refreshedAt: number): boolean {
  if (!Number.isFinite(now) || !Number.isFinite(refreshedAt)) return false;
  return now - refreshedAt >= GESTURE_REFRESH_MS;
}
