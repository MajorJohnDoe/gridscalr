import { t } from "../i18n";
import type { MarkupItem, Project, RailRow } from "./types";

/** 5 mm between rail rows, in PDF points. */
export const RAIL_ROW_SPACING = (5 * 72) / 25.4;

export type RailPreset = "plc" | "duc";

/** Default rows for a new rail. Legends are editable project data afterwards. */
export function defaultRailRows(preset: RailPreset = "plc"): RailRow[] {
  const digitalIn = t("rail.legend.digitalIn");
  const analogIn = t("rail.legend.analogIn");
  const digitalOut = t("rail.legend.digitalOut");
  const analogOut = t("rail.legend.analogOut");

  if (preset === "duc") {
    return [
      { id: "mbus", label: "M-Bus", legend: "" },
      { id: "duc", label: "DUC", legend: "" },
      { id: "di", label: "DI", legend: digitalIn },
      { id: "ai", label: "AI", legend: analogIn },
      { id: "du", label: "DU", legend: digitalOut },
      { id: "au", label: "AU", legend: analogOut },
    ];
  }

  return [
    { id: "plc", label: "PLC", legend: "" },
    { id: "di", label: "DI", legend: digitalIn },
    { id: "ai", label: "AI", legend: analogIn },
    { id: "du", label: "DU", legend: digitalOut },
    { id: "au", label: "AU", legend: analogOut },
  ];
}

export interface RailRowGeometry extends RailRow {
  y: number;
}

export interface RailGeometry {
  left: number;
  right: number;
  top: number;
  rowSpacing: number;
  rows: RailRowGeometry[];
}

function clampSpacing(value: number): number {
  return Math.max(2, Math.min(60, value));
}

export function railGeometry(item: MarkupItem): RailGeometry | null {
  if (item.kind !== "rail" || item.points.length < 2) return null;
  const left = Math.min(item.points[0].x, item.points[1].x);
  const right = Math.max(item.points[0].x, item.points[1].x);
  const top = Math.min(item.points[0].y, item.points[1].y);
  if (right - left < 1) return null;
  const rowSpacing = clampSpacing(item.rowSpacing ?? RAIL_ROW_SPACING);
  const source = item.rows?.length ? item.rows : defaultRailRows();
  return {
    left,
    right,
    top,
    rowSpacing,
    rows: source.map((row, index) => ({ ...row, y: top + index * rowSpacing })),
  };
}

/** Baseline for the optional legend line below the last row. */
export function railLegendY(geometry: RailGeometry): number {
  const last = geometry.rows[geometry.rows.length - 1];
  return (last?.y ?? geometry.top) + geometry.rowSpacing;
}

export interface RailItemOptions {
  rows: readonly RailRow[];
  showBadges: boolean;
  showLegend: boolean;
}

/**
 * Replaces the rows and display switches of one I/O rail. Blank labels are
 * dropped, ids stay unique and a true switch is stored as absent so the
 * project file keeps its compact default. A rail with no usable row is refused.
 */
export function setRailItemOptions(
  project: Project,
  itemId: string,
  options: RailItemOptions,
): boolean {
  let target: MarkupItem | undefined;
  for (const layer of project.layers) {
    target = layer.items.find((entry) => entry.id === itemId);
    if (target) break;
  }
  if (!target || target.kind !== "rail") return false;
  const seen = new Set<string>();
  const rows: RailRow[] = [];
  options.rows.forEach((row, index) => {
    const label = String(row.label ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20);
    if (!label) return;
    let id = typeof row.id === "string" && row.id ? row.id : `row_${index + 1}`;
    while (seen.has(id)) id = `row_${index + 1}_${rows.length + 1}`;
    const legend = String(row.legend ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    rows.push({ id, label, ...(legend ? { legend } : {}) });
    seen.add(id);
  });
  if (!rows.length) return false;
  target.rows = rows;
  if (options.showBadges) delete target.showBadges;
  else target.showBadges = false;
  if (options.showLegend) delete target.showLegend;
  else target.showLegend = false;
  target.updatedAt = new Date().toISOString();
  return true;
}
