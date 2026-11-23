/**
 * The movable, non-modal performance panel: the simple support view, the
 * expandable span table, the 30 s sparkline with event marks, and the copy
 * action. It reads the recorder only; it never imports the store, so the host
 * passes the project shape in and the feature stays a leaf module.
 */

import { copyPlainText } from "../../io/clipboardText";
import { isTauri } from "../../io/platform";
import { SCHEMA_VERSION } from "../../model/types";
import { t } from "../../i18n";
import { button, el } from "../../ui/dom";
import { toast } from "../../ui/toast";
import { detectPlatform } from "../../ui/windowChrome";
import {
  PANEL_DRAW_INTERVAL_MS,
  PANEL_Z_INDEX,
  clampPanelPosition,
  formatBytes,
  formatMs,
  frameSeverity,
  percentOf,
  summaryText,
  type FrameSeverity,
  type PerfSnapshot,
  type ProjectShape,
} from "./model";
import { perfSnapshot } from "./recorder";
import { drawSpark, markNames, themeColors } from "./sparkline";
import { renderSpanTable } from "./table";

export interface PerfPanelOptions {
  /** Counts and sizes only; the host maps `projectStats()` onto this shape. */
  projectShape: () => ProjectShape | null;
  /** Fired only for a user action inside the panel, never for a programmatic open. */
  onVisibilityChange?: (open: boolean) => void;
}

const ROW_KEYS = ["frameNow", "worst", "blocked", "heap", "project"] as const;

const COLUMN_KEYS = ["name", "count", "p50", "p95", "max"] as const;

const HEAP_WARN_PERCENT = 60;
const HEAP_BAD_PERCENT = 85;
const BLOCKED_BAD_MS = 200;

type RowKey = (typeof ROW_KEYS)[number];

interface RowRefs {
  label: HTMLElement;
  value: HTMLElement;
}

let options: PerfPanelOptions | null = null;
let root: HTMLElement | null = null;
let titleNode: HTMLElement | null = null;
let holdButton: HTMLButtonElement | null = null;
let copyButton: HTMLButtonElement | null = null;
let detailsButton: HTMLButtonElement | null = null;
let sparkCanvas: HTMLCanvasElement | null = null;
let legendNode: HTMLElement | null = null;
let tableBody: HTMLElement | null = null;
let tableWrap: HTMLElement | null = null;
let timer: number | null = null;
let held: PerfSnapshot | null = null;
let detailsOpen = false;
let position = { x: 0, y: 0 };
let dragOffset: { x: number; y: number } | null = null;
const rows = new Map<RowKey, RowRefs>();

export function mountPerfPanel(next: PerfPanelOptions): void {
  options = next;
}

export function isPerfPanelOpen(): boolean {
  return root !== null;
}

/** Programmatic open/close. Does not fire `onVisibilityChange`. */
export function setPerfPanelOpen(open: boolean): void {
  if (open === (root !== null)) return;
  if (open) createPanel();
  else destroyPanel();
}

export function togglePerfPanel(): void {
  setPerfPanelOpen(root === null);
}

/** Re-applies the active language and redraws once. */
export function refreshPerfPanel(): void {
  if (!root) return;
  relabel();
  draw();
}

function createPanel(): void {
  if (root) return;
  const panel = el("div", "perf-panel");
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", t("perf.title"));
  panel.style.zIndex = String(PANEL_Z_INDEX);
  root = panel;

  const header = el("div", "perf-panel-header");
  const dot = el("span", "perf-dot");
  dot.setAttribute("aria-hidden", "true");
  titleNode = el("span", "perf-title", t("perf.title"));
  header.append(dot, titleNode);

  holdButton = labelledButton("perf-button", t("perf.hold"), () => toggleHold());
  copyButton = labelledButton("perf-button", t("perf.copy"), () => void copySummary());
  const closeButton = button("perf-button perf-button-close", t("perf.close"), () =>
    closeFromPanel(),
  );
  closeButton.textContent = "×";
  header.append(holdButton, copyButton, closeButton);

  const body = el("div", "perf-body");
  for (const key of ROW_KEYS) {
    const row = el("div", "perf-row");
    const label = el("span", "perf-label", t(`perf.row.${key}`));
    const value = el("span", "perf-value", "—");
    row.append(label, value);
    body.append(row);
    rows.set(key, { label, value });
  }

  sparkCanvas = el("canvas", "perf-spark");
  sparkCanvas.setAttribute("role", "img");
  sparkCanvas.setAttribute("aria-label", t("perf.sparkAria"));
  legendNode = el("div", "perf-legend");
  body.append(sparkCanvas, legendNode);

  detailsButton = labelledButton("perf-button perf-button-wide", t("perf.details"), () => {
    detailsOpen = !detailsOpen;
    draw();
  });

  tableWrap = el("div", "perf-table-wrap");
  const table = el("table", "perf-table");
  const head = el("thead");
  const headRow = el("tr");
  for (const key of COLUMN_KEYS) headRow.append(el("th", "", t(`perf.column.${key}`)));
  headRow.firstElementChild?.classList.add("perf-table-name");
  head.append(headRow);
  tableBody = el("tbody");
  table.append(head, tableBody);
  tableWrap.append(table);

  panel.append(header, body, detailsButton, tableWrap);
  document.body.append(panel);

  position = {
    x: window.innerWidth - panel.offsetWidth - 16,
    y: Math.max(56, window.innerHeight - panel.offsetHeight - 96),
  };
  applyPosition();
  header.addEventListener("pointerdown", onDragStart);
  header.addEventListener("pointermove", onDragMove);
  header.addEventListener("pointerup", onDragEnd);
  header.addEventListener("pointercancel", onDragEnd);
  window.addEventListener("resize", onResize);
  timer = window.setInterval(draw, PANEL_DRAW_INTERVAL_MS);
  draw();
  // The first draw runs before any frame has been sampled; one early redraw
  // fills the rows instead of showing an empty panel for half a second.
  window.setTimeout(draw, 150);
}

function labelledButton(className: string, label: string, run: () => void): HTMLButtonElement {
  const node = button(className, label, run);
  node.textContent = label;
  return node;
}

function destroyPanel(): void {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  window.removeEventListener("resize", onResize);
  root?.remove();
  root = null;
  titleNode = null;
  holdButton = null;
  copyButton = null;
  detailsButton = null;
  sparkCanvas = null;
  legendNode = null;
  tableBody = null;
  tableWrap = null;
  rows.clear();
  held = null;
  detailsOpen = false;
  dragOffset = null;
}

function closeFromPanel(): void {
  setPerfPanelOpen(false);
  options?.onVisibilityChange?.(false);
}

function currentSnapshot(): PerfSnapshot {
  return held ?? perfSnapshot(options?.projectShape() ?? null);
}

function toggleHold(): void {
  held = held ? null : currentSnapshot();
  draw();
}

function relabel(): void {
  if (!root) return;
  root.setAttribute("aria-label", t("perf.title"));
  if (titleNode) titleNode.textContent = t("perf.title");
  if (holdButton) holdButton.textContent = held ? t("perf.resume") : t("perf.hold");
  if (copyButton) copyButton.textContent = t("perf.copy");
  if (detailsButton) {
    detailsButton.textContent = detailsOpen ? t("perf.detailsHide") : t("perf.details");
  }
  if (sparkCanvas) sparkCanvas.setAttribute("aria-label", t("perf.sparkAria"));
  for (const [key, refs] of rows) refs.label.textContent = t(`perf.row.${key}`);
}

function agoLabel(ms: number): string {
  if (ms < 1000) return t("perf.agoNow");
  return t("perf.agoSeconds", { count: Math.round(ms / 1000) });
}

function setValue(key: RowKey, text: string, severity?: FrameSeverity): void {
  const refs = rows.get(key);
  if (!refs) return;
  refs.value.textContent = text;
  refs.value.className = severity ? `perf-value perf-${severity}` : "perf-value";
}

function heapSeverity(percent: number): FrameSeverity {
  if (percent >= HEAP_BAD_PERCENT) return "bad";
  if (percent >= HEAP_WARN_PERCENT) return "warn";
  return "good";
}

function draw(): void {
  if (!root) return;
  const snapshot = currentSnapshot();
  const frames = snapshot.frames;
  setValue(
    "frameNow",
    frames ? formatMs(frames.current) : t("perf.noSamples"),
    frames ? frameSeverity(frames.current) : undefined,
  );
  setValue(
    "worst",
    frames
      ? t("perf.worstValue", { value: formatMs(frames.max), ago: agoLabel(frames.worstAgoMs) })
      : t("perf.noSamples"),
    frames ? frameSeverity(frames.max) : undefined,
  );
  setValue(
    "blocked",
    t("perf.blockedValue", {
      value: formatMs(snapshot.blocked.totalMs),
      count: snapshot.blocked.count,
    }),
    snapshot.blocked.totalMs >= BLOCKED_BAD_MS ? "bad" : snapshot.blocked.count ? "warn" : "good",
  );
  const heapPercent =
    snapshot.heapBytes === null ? null : percentOf(snapshot.heapBytes, snapshot.heapBudgetBytes);
  setValue(
    "heap",
    heapPercent === null
      ? t("perf.heapUnavailable")
      : t("perf.heapValue", {
          used: formatBytes(snapshot.heapBytes ?? 0),
          total: formatBytes(snapshot.heapBudgetBytes),
          percent: heapPercent,
        }),
    heapPercent === null ? undefined : heapSeverity(heapPercent),
  );
  setValue(
    "project",
    snapshot.project
      ? t("perf.projectValue", {
          pages: snapshot.project.pages,
          items: snapshot.project.items,
          embedded: formatBytes(snapshot.project.embeddedBytes),
        })
      : t("perf.projectNone"),
  );
  if (holdButton) holdButton.textContent = held ? t("perf.resume") : t("perf.hold");
  if (detailsButton) {
    detailsButton.textContent = detailsOpen ? t("perf.detailsHide") : t("perf.details");
  }
  if (sparkCanvas) drawSpark(sparkCanvas, snapshot, themeColors(root));
  if (legendNode) {
    legendNode.replaceChildren(
      ...markNames(snapshot.marks).map((name) => el("span", "perf-legend-item", name)),
    );
  }
  if (tableWrap) tableWrap.hidden = !detailsOpen;
  if (tableBody && detailsOpen) {
    renderSpanTable(tableBody, snapshot.spans, t("perf.noSamples"));
  }
}

async function copySummary(): Promise<void> {
  const text = summaryText(currentSnapshot(), {
    version: __APP_VERSION__,
    schemaVersion: SCHEMA_VERSION,
    platform: detectPlatform(),
    locale: navigator.language,
    desktop: isTauri,
  });
  const copied = await copyPlainText(text);
  toast(copied ? t("perf.copied") : t("perf.copyFailed"), copied ? "success" : "warning");
}

function applyPosition(): void {
  if (!root) return;
  root.style.left = `${Math.round(position.x)}px`;
  root.style.top = `${Math.round(position.y)}px`;
}

function onDragStart(event: PointerEvent): void {
  if (!root) return;
  if ((event.target as HTMLElement).closest("button")) return;
  dragOffset = { x: event.clientX - position.x, y: event.clientY - position.y };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onDragMove(event: PointerEvent): void {
  if (!dragOffset || !root) return;
  const rect = root.getBoundingClientRect();
  position = clampPanelPosition(
    { x: event.clientX - dragOffset.x, y: event.clientY - dragOffset.y },
    { width: rect.width, height: rect.height },
    { width: window.innerWidth, height: window.innerHeight },
  );
  applyPosition();
}

function onDragEnd(event: PointerEvent): void {
  dragOffset = null;
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
}

function onResize(): void {
  if (!root) return;
  const rect = root.getBoundingClientRect();
  position = clampPanelPosition(
    position,
    { width: rect.width, height: rect.height },
    { width: window.innerWidth, height: window.innerHeight },
  );
  applyPosition();
}
