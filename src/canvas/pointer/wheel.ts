/** Normalizes a wheel delta to pixels, independent of the event's delta mode. */
export function wheelDeltaPixels(value: number, deltaMode: number): number {
  if (!Number.isFinite(value)) return 0;
  if (deltaMode === 1) return value * 16;
  if (deltaMode === 2) return value * 100;
  return value;
}

/**
 * Zoom factor for Ctrl/Cmd + wheel. Trackpad pinch arrives as a wheel with
 * `ctrlKey` and very small pixel deltas, while a Ctrl + mouse wheel uses much
 * larger deltas. Tune both paths without letting a single event jump too far.
 */
export function wheelZoomFactor(event: Pick<WheelEvent, "deltaY" | "deltaMode">): number {
  const delta = wheelDeltaPixels(event.deltaY, event.deltaMode);
  if (delta === 0) return 1;
  const magnitude = Math.abs(delta);
  const limit = magnitude <= 10 ? 40 : 150;
  const sensitivity = magnitude <= 10 ? 0.012 : 0.0018;
  const clamped = Math.max(-limit, Math.min(limit, delta));
  return Math.exp(-clamped * sensitivity);
}
