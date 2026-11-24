/**
 * Pure performance-panel model: bounded sample buffers, window statistics and
 * the support summary. Nothing here touches the DOM, the browser APIs or the
 * store, so every number can be tested without rendering a panel.
 */

/** The panel reports the last 30 seconds of interaction. */
export const FRAME_WINDOW_MS = 30_000;

/** Main-thread blocking is reported over a shorter, more immediate window. */
export const BLOCKED_WINDOW_MS = 2_000;

/** A frame under 20 ms is smooth; over 50 ms is a dropped frame worth naming. */
export const FRAME_GOOD_MS = 20;
export const FRAME_WARN_MS = 50;

/** The documented desktop working-set budget in `docs/limitations.md`. */
export const HEAP_BUDGET_BYTES = 2 * 1024 * 1024 * 1024;

/** Sparkline resolution: one bar per half second of the 30 s window. */
export const SPARK_BUCKETS = 60;

/** The panel redraws at this rate; sampling still happens every frame. */
export const PANEL_DRAW_INTERVAL_MS = 500;

/** Just below the dialog band, so a real dialog is never hidden behind it. */
export const PANEL_Z_INDEX = 1999;

export const PANEL_MARGIN = 8;

/**
 * Instrumented span names. Hyphenated technical identifiers, deliberately not
 * translated: the same name must mean the same thing in a copied summary, in a
 * devtools trace and in a GitHub issue.
 */
export const SPAN_NAMES = [
  "serialize",
  "shell-render",
  "canvas-redraw",
  "draw-base",
  "draw-items",
  "pdf-raster",
  "pdf-render",
  "tile-render",
  "tile-cache-hit",
  "pdf-operator-list",
  "thumbnail",
  "autosave-write",
  "project-open",
] as const;

export type SpanName = (typeof SPAN_NAMES)[number];

export const MARK_NAMES = ["undo", "redo", "save", "autosave", "raster"] as const;

export type MarkName = (typeof MARK_NAMES)[number];

export interface FrameSample {
  at: number;
  ms: number;
}

export interface LongTaskSample {
  at: number;
  ms: number;
}

export interface SpanSample {
  name: SpanName;
  at: number;
  ms: number;
}

export interface EventMark {
  name: MarkName;
  at: number;
}

/** Project shape only. Counts and sizes, never a name, label or path. */
export interface ProjectShape {
  documents: number;
  pages: number;
  items: number;
  embeddedBytes: number;
}

export interface FrameWindow {
  count: number;
  current: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  /** Frames at or above {@link FRAME_GOOD_MS}: work no longer inside a 60 Hz frame. */
  overGoodMs: number;
  /** Milliseconds between the slowest frame and `now`. */
  worstAgoMs: number;
  fps: number;
}

export interface BlockedWindow {
  count: number;
  totalMs: number;
  maxMs: number;
}

export interface SpanRow {
  name: SpanName;
  count: number;
  p50: number;
  p95: number;
  max: number;
  /** Last recorded detail, for example the serialized character count. */
  detail: number | null;
}

export interface PerfSnapshot {
  recording: boolean;
  at: number;
  frames: FrameWindow | null;
  blocked: BlockedWindow;
  spans: SpanRow[];
  marks: EventMark[];
  spark: number[];
  heapBytes: number | null;
  heapBudgetBytes: number;
  project: ProjectShape | null;
}

/** Fixed-capacity FIFO. Pushing past the capacity drops the oldest sample. */
export class RingBuffer<T> {
  private items: T[] = [];

  constructor(private readonly capacity: number) {}

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) this.items.shift();
  }

  /** Oldest first, newest last. A copy, so callers cannot mutate the buffer. */
  values(): T[] {
    return this.items.slice();
  }

  get size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}

/** Nearest-rank percentile over an ascending list. Empty input returns 0. */
export function percentile(ascending: readonly number[], fraction: number): number {
  if (!ascending.length) return 0;
  const index = Math.min(
    ascending.length - 1,
    Math.max(0, Math.ceil(fraction * ascending.length) - 1),
  );
  return ascending[index];
}

function ascending(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** Frame statistics for the panel window, or null before the first frame. */
export function frameWindow(
  samples: readonly FrameSample[],
  now: number,
  windowMs = FRAME_WINDOW_MS,
): FrameWindow | null {
  if (!samples.length) return null;
  const start = now - windowMs;
  const inside = samples.filter((sample) => sample.at >= start);
  const scope = inside.length ? inside : samples.slice(-1);
  const durations = scope.map((sample) => sample.ms);
  const sorted = ascending(durations);
  let worstAt = scope[0].at;
  for (const sample of scope) if (sample.ms >= sorted[sorted.length - 1]) worstAt = sample.at;
  const span = Math.max(1, now - scope[0].at);
  return {
    count: scope.length,
    current: samples[samples.length - 1].ms,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1],
    overGoodMs: durations.filter((ms) => ms >= FRAME_GOOD_MS).length,
    worstAgoMs: Math.max(0, now - worstAt),
    fps: Math.min(240, (scope.length * 1000) / span),
  };
}

/** Long-task totals in the immediate window. */
export function blockedWindow(
  tasks: readonly LongTaskSample[],
  now: number,
  windowMs = BLOCKED_WINDOW_MS,
): BlockedWindow {
  const start = now - windowMs;
  let count = 0;
  let totalMs = 0;
  let maxMs = 0;
  for (const task of tasks) {
    if (task.at < start || task.at > now) continue;
    count += 1;
    totalMs += task.ms;
    maxMs = Math.max(maxMs, task.ms);
  }
  return { count, totalMs, maxMs };
}

/** One row per span, slowest p95 first, so the panel leads with the culprit. */
export function spanTable(
  samples: readonly SpanSample[],
  now: number,
  windowMs = FRAME_WINDOW_MS,
  details?: ReadonlyMap<SpanName, number>,
): SpanRow[] {
  if (!samples.length) return [];
  const start = now - windowMs;
  const groups = new Map<SpanName, number[]>();
  for (const sample of samples) {
    if (sample.at < start) continue;
    const list = groups.get(sample.name);
    if (list) list.push(sample.ms);
    else groups.set(sample.name, [sample.ms]);
  }
  const rows: SpanRow[] = [];
  for (const [name, durations] of groups) {
    const sorted = ascending(durations);
    rows.push({
      name,
      count: sorted.length,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      max: sorted[sorted.length - 1],
      detail: details?.get(name) ?? null,
    });
  }
  return rows.sort((a, b) => b.p95 - a.p95 || b.max - a.max || a.name.localeCompare(b.name));
}

/** Max frame time per bar, aligned so the newest bar is the current instant. */
export function sparkSeries(
  samples: readonly FrameSample[],
  now: number,
  windowMs = FRAME_WINDOW_MS,
  buckets = SPARK_BUCKETS,
): number[] {
  const series = new Array<number>(buckets).fill(0);
  const start = now - windowMs;
  const size = windowMs / buckets;
  for (const sample of samples) {
    if (sample.at < start || sample.at > now) continue;
    const index = Math.min(buckets - 1, Math.max(0, Math.floor((sample.at - start) / size)));
    if (sample.ms > series[index]) series[index] = sample.ms;
  }
  return series;
}

/** Marks still inside the window, for the timeline under the sparkline. */
export function recentMarks(
  marks: readonly EventMark[],
  now: number,
  windowMs = FRAME_WINDOW_MS,
): EventMark[] {
  const start = now - windowMs;
  return marks.filter((mark) => mark.at >= start);
}

export type FrameSeverity = "good" | "warn" | "bad";

export function frameSeverity(ms: number): FrameSeverity {
  if (ms >= FRAME_WARN_MS) return "bad";
  if (ms >= FRAME_GOOD_MS) return "warn";
  return "good";
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0 ms";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 100) return `${Math.round(ms)} ms`;
  return `${ms.toFixed(1)} ms`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const mib = bytes / (1024 * 1024);
  if (mib >= 1024) return `${(mib / 1024).toFixed(2)} GB`;
  if (mib >= 10) return `${Math.round(mib)} MB`;
  return `${mib.toFixed(1)} MB`;
}

export function percentOf(used: number, budget: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(budget) || budget <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / budget) * 100)));
}

/** Clamps a panel's top-left corner so its header stays inside the viewport. */
export function clampPanelPosition(
  position: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = PANEL_MARGIN,
): { x: number; y: number } {
  const maxX = Math.max(margin, viewport.width - size.width - margin);
  const maxY = Math.max(margin, viewport.height - size.height - margin);
  return {
    x: Math.min(Math.max(position.x, margin), maxX),
    y: Math.min(Math.max(position.y, margin), maxY),
  };
}

export interface SummaryInput {
  version: string;
  schemaVersion: number;
  platform: string;
  locale: string;
  desktop: boolean;
  history?: { entries: number; limit: number } | null;
}

/**
 * The support summary. It carries counts, durations and sizes only: no project
 * name, item label or file path, so it is safe to paste into a public issue.
 */
export function summaryText(snapshot: PerfSnapshot, input: SummaryInput): string {
  const lines: string[] = [];
  const heading = snapshot.recording ? "recording, 30 s window" : "recording off";
  lines.push(`Performance — ${heading}`);
  lines.push(
    `app ${input.version} · schema ${input.schemaVersion} · ${input.platform}${
      input.desktop ? " · desktop" : " · browser fallback"
    } · ${input.locale}`,
  );
  if (!snapshot.recording) return lines.join("\n");

  if (snapshot.frames) {
    const frames = snapshot.frames;
    lines.push(
      `frames  p50 ${formatMs(frames.p50)} · p95 ${formatMs(frames.p95)} · p99 ${formatMs(
        frames.p99,
      )} · max ${formatMs(frames.max)} (${formatMs(frames.worstAgoMs)} ago) · ${frames.fps.toFixed(
        0,
      )} fps`,
    );
  } else {
    lines.push("frames  no samples yet");
  }

  lines.push(
    `blocked ${formatMs(snapshot.blocked.totalMs)} in ${snapshot.blocked.count} long task(s), last 2 s`,
  );

  if (snapshot.heapBytes === null) {
    lines.push(
      `heap    not available on this platform (budget ${formatBytes(snapshot.heapBudgetBytes)})`,
    );
  } else {
    lines.push(
      `heap    ${formatBytes(snapshot.heapBytes)} / ${formatBytes(snapshot.heapBudgetBytes)} (${percentOf(
        snapshot.heapBytes,
        snapshot.heapBudgetBytes,
      )}%)`,
    );
  }

  if (snapshot.project) {
    const project = snapshot.project;
    lines.push(
      `project ${project.pages} page(s) · ${project.items} item(s) · ${project.documents} document(s) · ${formatBytes(
        project.embeddedBytes,
      )} embedded`,
    );
  } else {
    lines.push("project none open");
  }

  if (input.history) {
    lines.push(`undo    ${input.history.entries}/${input.history.limit} snapshot(s)`);
  }

  const top = snapshot.spans.slice(0, 5).map((row) => {
    const detail = row.detail === null ? "" : ` · ${formatBytes(row.detail)}`;
    return `${row.name} p50 ${formatMs(row.p50)} p95 ${formatMs(row.p95)}${detail}`;
  });
  lines.push(top.length ? `spans   ${top.join(" | ")}` : "spans   none recorded");

  return lines.join("\n");
}
