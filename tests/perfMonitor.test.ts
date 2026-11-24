import { describe, expect, it } from "vitest";
import {
  BLOCKED_WINDOW_MS,
  FRAME_WINDOW_MS,
  RingBuffer,
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
  sparkSeries,
  spanTable,
  summaryText,
  type FrameSample,
  type PerfSnapshot,
  type SpanSample,
} from "../src/features/perfMonitor/model";

function frames(values: number[], start = 0, step = 16.7): FrameSample[] {
  return values.map((ms, index) => ({ at: start + index * step, ms }));
}

function snapshot(patch: Partial<PerfSnapshot> = {}): PerfSnapshot {
  return {
    recording: true,
    at: 30_000,
    frames: null,
    blocked: { count: 0, totalMs: 0, maxMs: 0 },
    spans: [],
    marks: [],
    spark: [],
    heapBytes: 512 * 1024 * 1024,
    heapBudgetBytes: 2 * 1024 * 1024 * 1024,
    project: null,
    ...patch,
  };
}

describe("performance sample buffer", () => {
  it("keeps the draw and PDF spans the canvas and renderer record", () => {
    for (const name of ["draw-base", "draw-items", "pdf-render"] as const) {
      expect(SPAN_NAMES).toContain(name);
    }
  });

  it("drops the oldest sample at capacity", () => {
    const buffer = new RingBuffer<number>(3);
    for (const value of [1, 2, 3, 4]) buffer.push(value);
    expect(buffer.values()).toEqual([2, 3, 4]);
    expect(buffer.size).toBe(3);
  });

  it("returns a copy, so callers cannot mutate the buffer", () => {
    const buffer = new RingBuffer<number>(3);
    buffer.push(1);
    buffer.values().push(2);
    expect(buffer.values()).toEqual([1]);
  });
});

describe("frame statistics", () => {
  it("uses nearest-rank percentiles", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 0.5)).toBe(5);
    expect(percentile(sorted, 0.95)).toBe(10);
    expect(percentile([], 0.95)).toBe(0);
  });

  it("reports the window p50, p95, max and how long ago the worst frame was", () => {
    const samples = frames([10, 10, 10, 200], 0, 100);
    const stats = frameWindow(samples, 300);
    expect(stats).not.toBeNull();
    expect(stats?.count).toBe(4);
    expect(stats?.current).toBe(200);
    expect(stats?.p50).toBe(10);
    expect(stats?.max).toBe(200);
    expect(stats?.worstAgoMs).toBe(0);
  });

  it("counts the frames that no longer fit a 60 Hz frame", () => {
    const samples = frames([16.7, 16.7, 20, 21.5, 50], 0, 100);
    const stats = frameWindow(samples, 500);
    expect(stats?.count).toBe(5);
    expect(stats?.overGoodMs).toBe(3);
    expect(frameWindow(frames([10, 10], 0, 100), 200)?.overGoodMs).toBe(0);
  });

  it("ignores samples older than the window but keeps the current frame", () => {
    const samples = frames([500], 0, 100).concat(frames([16], FRAME_WINDOW_MS + 100, 16));
    const stats = frameWindow(samples, FRAME_WINDOW_MS + 200);
    expect(stats?.max).toBe(16);
    expect(stats?.current).toBe(16);
  });

  it("returns null before the first frame", () => {
    expect(frameWindow([], 1000)).toBeNull();
  });

  it("classifies a frame against the documented thresholds", () => {
    expect(frameSeverity(10)).toBe("good");
    expect(frameSeverity(25)).toBe("warn");
    expect(frameSeverity(120)).toBe("bad");
  });
});

describe("long-task window", () => {
  it("counts only tasks inside the immediate window", () => {
    const tasks = [
      { at: 100, ms: 60 },
      { at: 900, ms: 120 },
      { at: 5_000, ms: 300 },
    ];
    const window = blockedWindow(tasks, BLOCKED_WINDOW_MS, BLOCKED_WINDOW_MS);
    expect(window.count).toBe(2);
    expect(window.totalMs).toBe(180);
    expect(window.maxMs).toBe(120);
  });
});

describe("span table", () => {
  it("groups by name and leads with the slowest p95", () => {
    const samples: SpanSample[] = [
      { name: "serialize", at: 100, ms: 40 },
      { name: "serialize", at: 200, ms: 90 },
      { name: "pdf-raster", at: 150, ms: 300 },
      { name: "canvas-redraw", at: 160, ms: 5 },
    ];
    const rows = spanTable(samples, 400);
    expect(rows.map((row) => row.name)).toEqual(["pdf-raster", "serialize", "canvas-redraw"]);
    const serialize = rows.find((row) => row.name === "serialize");
    expect(serialize?.count).toBe(2);
    expect(serialize?.max).toBe(90);
  });

  it("carries the last detail for a span and returns no rows for no samples", () => {
    const details = new Map([["serialize" as const, 8_400_000]]);
    const rows = spanTable([{ name: "serialize", at: 10, ms: 12 }], 20, FRAME_WINDOW_MS, details);
    expect(rows[0].detail).toBe(8_400_000);
    expect(spanTable([], 20)).toEqual([]);
  });
});

describe("sparkline and marks", () => {
  it("keeps the worst frame per bucket", () => {
    const samples = frames([16, 80, 16, 16], 0, 500);
    const series = sparkSeries(samples, 2000, 2000, 4);
    expect(series).toEqual([16, 80, 16, 16]);
  });

  it("filters marks to the window", () => {
    const marks = [
      { name: "undo" as const, at: 100 },
      { name: "save" as const, at: 29_000 },
    ];
    expect(recentMarks(marks, 30_000).map((mark) => mark.name)).toEqual(["undo", "save"]);
    expect(recentMarks(marks, 60_000)).toEqual([]);
  });
});

describe("panel formatting", () => {
  it("formats durations in the unit a reader expects", () => {
    expect(formatMs(16.66)).toBe("16.7 ms");
    expect(formatMs(312.4)).toBe("312 ms");
    expect(formatMs(2_400)).toBe("2.40 s");
  });

  it("formats bytes against the working-set budget", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512 * 1024 * 1024)).toBe("512 MB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.00 GB");
    expect(percentOf(1024 * 1024 * 1024, 2 * 1024 * 1024 * 1024)).toBe(50);
    expect(percentOf(4, 0)).toBe(0);
  });

  it("keeps the panel inside the viewport", () => {
    expect(
      clampPanelPosition(
        { x: -40, y: 9_000 },
        { width: 300, height: 200 },
        { width: 1_000, height: 800 },
      ),
    ).toEqual({
      x: 8,
      y: 592,
    });
  });
});

describe("support summary", () => {
  const input = {
    version: "0.31.0",
    schemaVersion: 28,
    platform: "windows",
    locale: "sv-SE",
    desktop: true,
  };

  it("reports the window, blocking, heap and project shape", () => {
    const text = summaryText(
      snapshot({
        frames: frameWindow(frames([16, 16, 40]), 2_000),
        blocked: { count: 2, totalMs: 310, maxMs: 200 },
        heapBytes: 1024 * 1024 * 1024,
        project: { documents: 1, pages: 12, items: 3_421, embeddedBytes: 4 * 1024 * 1024 },
        spans: [{ name: "serialize", count: 4, p50: 20, p95: 90, max: 120, detail: 8_400_000 }],
      }),
      input,
    );
    expect(text).toContain("Performance — recording, 30 s window");
    expect(text).toContain("app 0.31.0 · schema 28 · windows · desktop · sv-SE");
    expect(text).toContain("blocked 310 ms in 2 long task(s)");
    expect(text).toContain("heap    1.00 GB / 2.00 GB (50%)");
    expect(text).toContain("project 12 page(s) · 3421 item(s) · 1 document(s)");
    expect(text).toContain("serialize p50 20.0 ms p95 90.0 ms · 8.0 MB");
  });

  it("stays a header only while recording is off", () => {
    const text = summaryText(snapshot({ recording: false }), input);
    expect(text.split("\n")).toHaveLength(2);
    expect(text).toContain("recording off");
  });

  it("names no path, so it is safe to paste into a public issue", () => {
    const text = summaryText(
      snapshot({
        frames: frameWindow(frames([16, 900]), 2_000),
        project: { documents: 2, pages: 40, items: 15_000, embeddedBytes: 1024 },
      }),
      input,
    );
    // A project shape is counts and sizes, so nothing path-like can reach the
    // summary by construction.
    expect(text).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(text).not.toContain("\\\\");
    expect(text).not.toMatch(/\/(Users|home|tmp|var)\//);
  });

  it("says so when heap is not available", () => {
    const text = summaryText(snapshot({ heapBytes: null }), input);
    expect(text).toContain("heap    not available on this platform");
  });
});
