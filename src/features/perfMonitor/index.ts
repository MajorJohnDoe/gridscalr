/**
 * Performance monitor: the opt-in recorder, its movable panel and the support
 * summary. Other modules import spans and marks from this surface only.
 */

export {
  applyStoredPerfPreference,
  installPerfPanel,
  performanceEnabled,
  setPerformanceEnabled,
  togglePerformancePanel,
} from "./controller";
export { isPerfPanelOpen, refreshPerfPanel, setPerfPanelOpen, togglePerfPanel } from "./panel";
export type { PerfPanelOptions } from "./panel";
export {
  clearPerfSamples,
  isPerfRecording,
  perfDetail,
  perfMark,
  perfSnapshot,
  perfSpan,
  perfSpanAsync,
  setPerfRecording,
} from "./recorder";
export {
  BLOCKED_WINDOW_MS,
  FRAME_GOOD_MS,
  FRAME_WARN_MS,
  FRAME_WINDOW_MS,
  HEAP_BUDGET_BYTES,
  MARK_NAMES,
  PANEL_DRAW_INTERVAL_MS,
  SPAN_NAMES,
  blockedWindow,
  clampPanelPosition,
  formatBytes,
  formatMs,
  frameSeverity,
  frameWindow,
  percentOf,
  percentile,
  recentMarks,
  RingBuffer,
  sparkSeries,
  spanTable,
  summaryText,
  type BlockedWindow,
  type EventMark,
  type FrameSample,
  type FrameSeverity,
  type FrameWindow,
  type MarkName,
  type PerfSnapshot,
  type ProjectShape,
  type SpanName,
  type SpanRow,
  type SpanSample,
  type SummaryInput,
} from "./model";
