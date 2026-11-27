/**
 * Gesture-time content reuse: during a pan or a wheel zoom the canvas paints the
 * previous item raster with the gesture transform, then redraws for real once
 * the gesture settles. Models, the pointer layer and the canvas import this
 * surface only.
 */

export {
  GestureRenderController,
  rasterTransform,
  type GestureKind,
  type GestureRenderHost,
  type GestureViewport,
  type RasterTransform,
} from "./controller";
export {
  GESTURE_REFRESH_DISTANCE,
  GESTURE_REFRESH_MS,
  GESTURE_SETTLE_MS,
  MIN_GESTURE_SETTLE_MS,
  captureStale,
  clampSettleMs,
  gestureContentKey,
  movedFar,
  refreshDue,
  settleDelay,
  settleDue,
  type SettleClock,
} from "./model";
export { ViewGestureSignal, type ViewGestureEvent, type ViewGestureListener } from "./signal";
