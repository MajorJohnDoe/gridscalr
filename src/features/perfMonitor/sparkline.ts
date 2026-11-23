/**
 * The panel's sparkline: 30 seconds of frame time as severity-coloured bars,
 * with an event mark under every page render, undo, save and autosave. Drawing
 * happens on one canvas at the panel's redraw rate, never per frame.
 */

import {
  FRAME_WARN_MS,
  FRAME_WINDOW_MS,
  frameSeverity,
  type PerfSnapshot,
  type EventMark,
} from "./model";

export const SPARK_HEIGHT = 46;

const SPARK_MARK_BAND = 6;

export interface SparkColors {
  good: string;
  warn: string;
  bad: string;
  mark: string;
}

/** Reads the theme tokens from the panel so every palette colours the spark. */
export function themeColors(root: HTMLElement): SparkColors {
  const style = getComputedStyle(root);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    good: read("--jade", "#3fb27f"),
    warn: read("--warning", "#d9a13b"),
    bad: read("--danger", "#e05252"),
    mark: read("--muted", "#8a949c"),
  };
}

export function drawSpark(
  canvas: HTMLCanvasElement,
  snapshot: PerfSnapshot,
  colors: SparkColors,
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(120, canvas.clientWidth || 300);
  if (canvas.width !== Math.round(width * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(SPARK_HEIGHT * dpr);
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, SPARK_HEIGHT);
  const plot = SPARK_HEIGHT - SPARK_MARK_BAND;
  const ceiling = Math.max(FRAME_WARN_MS * 1.5, snapshot.frames?.max ?? 0);
  const barWidth = width / Math.max(1, snapshot.spark.length);
  for (let index = 0; index < snapshot.spark.length; index += 1) {
    const ms = snapshot.spark[index];
    if (ms <= 0) continue;
    const height = Math.max(1, Math.min(1, ms / ceiling) * (plot - 2));
    const severity = frameSeverity(ms);
    context.fillStyle =
      severity === "bad" ? colors.bad : severity === "warn" ? colors.warn : colors.good;
    context.fillRect(index * barWidth, plot - height, Math.max(1, barWidth - 0.5), height);
  }
  for (const mark of snapshot.marks) {
    const x = markX(mark, snapshot.at);
    if (x === null) continue;
    context.fillStyle = colors.mark;
    context.fillRect(Math.min(width - 2, Math.max(0, x * width)), plot + 1, 2, SPARK_MARK_BAND - 2);
  }
}

/** Distinct mark names in the window, in the order they were recorded. */
export function markNames(marks: readonly EventMark[]): string[] {
  const names: string[] = [];
  for (const mark of marks) if (!names.includes(mark.name)) names.push(mark.name);
  return names;
}

/** Horizontal fraction of a mark inside the window, or null when it is outside. */
function markX(mark: EventMark, at: number): number | null {
  const fraction = 1 - (at - mark.at) / FRAME_WINDOW_MS;
  return fraction < 0 || fraction > 1 ? null : fraction;
}
