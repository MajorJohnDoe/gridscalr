/**
 * The performance recorder: frame sampling, long-task observation, named span
 * timing and the snapshot the panel and the diagnostics text read.
 *
 * Every entry point is a single boolean check while recording is off, so the
 * instrumentation can sit on hot paths such as the canvas redraw.
 */

import {
  BLOCKED_WINDOW_MS,
  FRAME_WINDOW_MS,
  HEAP_BUDGET_BYTES,
  RingBuffer,
  blockedWindow,
  frameWindow,
  recentMarks,
  sparkSeries,
  spanTable,
  type EventMark,
  type FrameSample,
  type LongTaskSample,
  type MarkName,
  type PerfSnapshot,
  type ProjectShape,
  type SpanName,
  type SpanSample,
} from "./model";

const FRAME_CAPACITY = 4096;
const LONG_TASK_CAPACITY = 256;
const SPAN_CAPACITY = 1024;
const MARK_CAPACITY = 256;

/** A hidden or sleeping window is not a stalled frame. */
const MAX_FRAME_GAP_MS = 5_000;

interface RecorderState {
  enabled: boolean;
  frames: RingBuffer<FrameSample>;
  longTasks: RingBuffer<LongTaskSample>;
  spans: RingBuffer<SpanSample>;
  marks: RingBuffer<EventMark>;
  details: Map<SpanName, number>;
  rafId: number | null;
  lastFrameAt: number;
  observer: PerformanceObserver | null;
}

const state: RecorderState = {
  enabled: false,
  frames: new RingBuffer<FrameSample>(FRAME_CAPACITY),
  longTasks: new RingBuffer<LongTaskSample>(LONG_TASK_CAPACITY),
  spans: new RingBuffer<SpanSample>(SPAN_CAPACITY),
  marks: new RingBuffer<EventMark>(MARK_CAPACITY),
  details: new Map<SpanName, number>(),
  rafId: null,
  lastFrameAt: 0,
  observer: null,
};

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clearSamples(): void {
  state.frames.clear();
  state.longTasks.clear();
  state.spans.clear();
  state.marks.clear();
  state.details.clear();
}

/** Exposed for the panel's reset action and for tests. */
export function clearPerfSamples(): void {
  clearSamples();
}

function scheduleFrame(): void {
  if (!state.enabled || state.rafId !== null) return;
  if (typeof requestAnimationFrame !== "function") return;
  state.rafId = requestAnimationFrame(onFrame);
}

function onFrame(timestamp: number): void {
  state.rafId = null;
  if (!state.enabled) return;
  const gap = timestamp - state.lastFrameAt;
  state.lastFrameAt = timestamp;
  if (gap > 0 && gap < MAX_FRAME_GAP_MS) state.frames.push({ at: timestamp, ms: gap });
  scheduleFrame();
}

function startLongTaskObserver(): void {
  if (state.observer || typeof PerformanceObserver === "undefined") return;
  const supported = PerformanceObserver.supportedEntryTypes;
  if (Array.isArray(supported) && !supported.includes("longtask")) return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.longTasks.push({ at: entry.startTime, ms: entry.duration });
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
    state.observer = observer;
  } catch {
    state.observer = null;
  }
}

function stopLongTaskObserver(): void {
  try {
    state.observer?.disconnect();
  } catch {
    // An observer that never started has nothing to disconnect.
  }
  state.observer = null;
}

/** Turns sampling on or off. Turning it off also drops every sample. */
export function setPerfRecording(enabled: boolean): void {
  if (state.enabled === enabled) return;
  state.enabled = enabled;
  if (enabled) {
    state.lastFrameAt = now();
    startLongTaskObserver();
    scheduleFrame();
    return;
  }
  if (state.rafId !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(state.rafId);
  }
  state.rafId = null;
  stopLongTaskObserver();
  clearSamples();
}

export function isPerfRecording(): boolean {
  return state.enabled;
}

function recordSpan(name: SpanName, start: number, end: number, detail?: number): void {
  state.spans.push({ name, at: start, ms: end - start });
  if (typeof detail === "number" && Number.isFinite(detail)) state.details.set(name, detail);
  // A user-timing entry with the same name puts the span on the devtools
  // timeline, so the panel and a Performance recording show the same data.
  try {
    performance.measure(name, { start, end });
  } catch {
    // User Timing level 3 is unavailable in some engines; the ring buffer stands.
  }
}

/** Times a synchronous span. Returns the callback's result unchanged. */
export function perfSpan<T>(name: SpanName, run: () => T, detail?: (result: T) => number): T {
  if (!state.enabled) return run();
  const start = now();
  let result: T;
  try {
    result = run();
  } catch (error) {
    recordSpan(name, start, now());
    throw error;
  }
  let size: number | undefined;
  if (detail) {
    try {
      size = detail(result);
    } catch {
      size = undefined;
    }
  }
  recordSpan(name, start, now(), size);
  return result;
}

/** Times an asynchronous span, including a rejected promise. */
export async function perfSpanAsync<T>(
  name: SpanName,
  run: () => Promise<T>,
  detail?: (result: T) => number,
): Promise<T> {
  if (!state.enabled) return run();
  const start = now();
  try {
    const result = await run();
    recordSpan(name, start, now(), detail ? detail(result) : undefined);
    return result;
  } catch (error) {
    recordSpan(name, start, now());
    throw error;
  }
}

/** Places an event on the timeline under the sparkline. */
export function perfMark(name: MarkName): void {
  if (!state.enabled) return;
  state.marks.push({ name, at: now() });
}

function readHeapBytes(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  const used = memory?.usedJSHeapSize;
  return typeof used === "number" && Number.isFinite(used) ? used : null;
}

/**
 * The current window, for the panel and the diagnostics block. Reading a
 * snapshot clears the user-timing measures so the browser buffer stays bounded.
 */
export function perfSnapshot(project: ProjectShape | null, at = now()): PerfSnapshot {
  const snapshot: PerfSnapshot = {
    recording: state.enabled,
    at,
    frames: frameWindow(state.frames.values(), at, FRAME_WINDOW_MS),
    blocked: blockedWindow(state.longTasks.values(), at, BLOCKED_WINDOW_MS),
    spans: spanTable(state.spans.values(), at, FRAME_WINDOW_MS, state.details),
    marks: recentMarks(state.marks.values(), at, FRAME_WINDOW_MS),
    spark: sparkSeries(state.frames.values(), at, FRAME_WINDOW_MS),
    heapBytes: readHeapBytes(),
    heapBudgetBytes: HEAP_BUDGET_BYTES,
    project,
  };
  try {
    performance.clearMeasures();
  } catch {
    // Nothing to clear when User Timing is unavailable.
  }
  return snapshot;
}

/** The recorded span detail for one name, for example the last serialized size. */
export function perfDetail(name: SpanName): number | null {
  return state.details.get(name) ?? null;
}
