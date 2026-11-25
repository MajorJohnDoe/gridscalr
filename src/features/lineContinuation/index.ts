/**
 * Public surface for continuing an existing polyline from one of its ends. The
 * endpoint hit test, guards and append rule are pure; the controller validates
 * the request and applies the append as one undo step. See issue #379.
 */
export {
  CONTINUATION_HIT_TOLERANCE_PX,
  canContinuePolyline,
  isContinuablePolyline,
  mergeContinuedPoints,
  nearestContinuableEndpoint,
  polylineEndpoint,
} from "./model";
export type { ContinuableEndpoint, PolylineContinuationTarget } from "./model";
export { appendContinuedPolyline, startContinuation } from "./controller";
export type { ContinuationStart } from "./controller";
