import { makeId } from "../../model/calibration";
import { layerLockedOnPage, layerVisibleOnPage, createLayer } from "../../model/layers";
import { buildLayerHierarchy } from "../../model/layerHierarchy";
import type { Layer, MarkupItem, PageId, Point, Project } from "../../model/types";
import { computeSchedule } from "./model/compute";
import { findSchedule } from "./model/definition";
import type { ScheduleResult } from "./model/types";
import {
  TABLE_FONT_SIZE,
  layoutScheduleTable,
  type MeasureText,
  type ScheduleTableLayout,
} from "./layout";

/**
 * The placement lifecycle. A placed table is an ordinary drawing item of kind
 * `schedule`; it stores intent only (schedule id, row range and box), so the
 * table content is recomputed at render time. Every mutation is caller-owned,
 * which keeps one user action as one undo step.
 */

export interface PlacementBox {
  origin: Point;
  width: number;
  height: number;
}

export interface PlacementRequest {
  scheduleId: string;
  pageId: PageId;
  /** Explicit draw layer; missing selects or creates one (see `placementLayer`). */
  layerId?: string;
  /** Box width in page points. */
  width?: number;
  /** Box height in page points. Missing derives a default from the row count. */
  height?: number;
  rowStart?: number;
  rowLimit?: number | null;
  showHeader?: boolean;
  showTotals?: boolean;
  position?: Point;
  pageSize?: { width: number; height: number };
  /** Localized name for a draw layer created on demand. */
  layerName?: string;
  color?: string;
}

export interface PlacementResult {
  item: MarkupItem;
  layerId: string;
}

const MARGIN = 24;
const MIN_BOX = 80;
const CONTINUATION_GAP = 14;

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeRowRange(
  rowStart?: number,
  rowLimit?: number | null,
): {
  rowStart: number;
  rowLimit: number | null;
} {
  const start =
    typeof rowStart === "number" && Number.isFinite(rowStart)
      ? clampValue(Math.floor(rowStart), 0, 100000)
      : 0;
  const limit =
    typeof rowLimit === "number" && Number.isFinite(rowLimit) && rowLimit > 0
      ? clampValue(Math.floor(rowLimit), 1, 10000)
      : null;
  return { rowStart: start, rowLimit: limit };
}

/**
 * A schedule table belongs on a draw layer. The active layer wins when it is a
 * draw layer; otherwise the first draw layer is selected, or one is created
 * with the caller's localized name.
 */
export function placementLayer(
  project: Project,
  pageId: PageId,
  options: { layerId?: string; layerName?: string } = {},
): Layer {
  if (options.layerId) {
    const requested = project.layers.find((layer) => layer.id === options.layerId);
    if (requested?.kind === "draw") {
      project.activeLayerId = requested.id;
      return requested;
    }
  }
  const active = project.layers.find((layer) => layer.id === project.activeLayerId);
  if (active?.kind === "draw") return active;
  const hierarchy = buildLayerHierarchy(project.layers);
  const drawLayers = project.layers.filter((layer) => layer.kind === "draw");
  const existing =
    drawLayers.find(
      (layer) =>
        layerVisibleOnPage(layer, pageId, hierarchy) &&
        !layerLockedOnPage(layer, pageId, hierarchy),
    ) ?? drawLayers[0];
  if (existing) {
    project.activeLayerId = existing.id;
    return existing;
  }
  const created = createLayer("draw", options.layerName, undefined, pageId);
  project.layers.unshift(created);
  project.activeLayerId = created.id;
  return created;
}

function textBoxHeight(rows: number, pageHeight: number): number {
  return clampValue(
    MARGIN * 2 + Math.min(Math.max(rows, 1), 30) * TABLE_FONT_SIZE * 1.55,
    60,
    pageHeight - MARGIN * 2,
  );
}

/**
 * The default box for a new placement. A second placement on the same page is
 * offset so two tables never land exactly on top of each other.
 */
export function defaultPlacementBox(
  project: Project,
  request: Pick<PlacementRequest, "pageId" | "width" | "height" | "position" | "pageSize">,
  rowCount = 12,
): PlacementBox {
  const pageWidth = request.pageSize?.width ?? 842;
  const pageHeight = request.pageSize?.height ?? 595;
  const width = clampValue(
    request.width ?? Math.min(360, pageWidth - MARGIN * 2),
    MIN_BOX,
    Math.max(MIN_BOX, pageWidth - MARGIN * 2),
  );
  const height = clampValue(
    request.height ?? textBoxHeight(rowCount, pageHeight),
    MIN_BOX / 2,
    Math.max(MIN_BOX / 2, pageHeight - MARGIN * 2),
  );
  const placed = project.layers.reduce(
    (count, layer) =>
      count +
      layer.items.filter((item) => item.kind === "schedule" && item.pageId === request.pageId)
        .length,
    0,
  );
  const offset = (placed % 6) * CONTINUATION_GAP;
  const origin = request.position ?? { x: MARGIN + offset, y: MARGIN + offset };
  return {
    origin: { x: origin.x, y: origin.y },
    width,
    height,
  };
}

export function placementBox(item: MarkupItem): PlacementBox {
  const a = item.points[0] ?? { x: 0, y: 0 };
  const b = item.points[1] ?? a;
  return {
    origin: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    width: Math.max(1, Math.abs(b.x - a.x)),
    height: Math.max(1, Math.abs(b.y - a.y)),
  };
}

export function createPlacement(
  project: Project,
  request: PlacementRequest,
): PlacementResult | null {
  const schedule = findSchedule(project, request.scheduleId);
  if (!schedule) return null;
  const layer = placementLayer(project, request.pageId, {
    layerId: request.layerId,
    layerName: request.layerName,
  });
  const rowCount = computeSchedule(project, schedule).rowCount;
  const box = defaultPlacementBox(project, request, rowCount);
  const range = normalizeRowRange(request.rowStart, request.rowLimit);
  const now = new Date().toISOString();
  const item: MarkupItem = {
    id: makeId("item"),
    pageId: request.pageId,
    kind: "schedule",
    points: [
      { x: box.origin.x, y: box.origin.y },
      { x: box.origin.x + box.width, y: box.origin.y + box.height },
    ],
    color: request.color ?? layer.color,
    strokeWidth: 1,
    scheduleId: request.scheduleId,
    rowStart: range.rowStart,
    ...(range.rowLimit !== null ? { rowLimit: range.rowLimit } : {}),
    showHeader: request.showHeader !== false,
    showTotals: request.showTotals === true,
    createdAt: now,
    updatedAt: now,
  };
  layer.items.push(item);
  return { item, layerId: layer.id };
}

export interface PlacementPatch {
  rowStart?: number;
  rowLimit?: number | null;
  showHeader?: boolean;
  showTotals?: boolean;
  fontSize?: number;
}

export function updatePlacement(project: Project, itemId: string, patch: PlacementPatch): boolean {
  for (const layer of project.layers) {
    const item = layer.items.find((entry) => entry.id === itemId && entry.kind === "schedule");
    if (!item) continue;
    if (patch.rowStart !== undefined || patch.rowLimit !== undefined) {
      const current = normalizeRowRange(item.rowStart, item.rowLimit);
      const next = normalizeRowRange(
        patch.rowStart ?? current.rowStart,
        patch.rowLimit !== undefined ? patch.rowLimit : current.rowLimit,
      );
      item.rowStart = next.rowStart;
      if (next.rowLimit !== null) item.rowLimit = next.rowLimit;
      else delete item.rowLimit;
    }
    if (patch.showHeader !== undefined) item.showHeader = patch.showHeader;
    if (patch.showTotals !== undefined) item.showTotals = patch.showTotals;
    if (patch.fontSize !== undefined && Number.isFinite(patch.fontSize)) {
      item.fontSize = clampValue(patch.fontSize, TABLE_FONT_SIZE / 2, 24);
    }
    item.updatedAt = new Date().toISOString();
    return true;
  }
  return false;
}

export function deletePlacement(project: Project, itemId: string): boolean {
  for (const layer of project.layers) {
    const index = layer.items.findIndex(
      (entry) => entry.id === itemId && entry.kind === "schedule",
    );
    if (index < 0) continue;
    layer.items.splice(index, 1);
    return true;
  }
  return false;
}

export function placementCount(project: Project, scheduleId: string): number {
  return project.layers.reduce(
    (count, layer) =>
      count +
      layer.items.filter((item) => item.kind === "schedule" && item.scheduleId === scheduleId)
        .length,
    0,
  );
}

/** Removes every placement of one schedule; the caller deletes the schedule next. */
export function deletePlacementsForSchedule(project: Project, scheduleId: string): number {
  let removed = 0;
  for (const layer of project.layers) {
    const before = layer.items.length;
    layer.items = layer.items.filter(
      (item) => !(item.kind === "schedule" && item.scheduleId === scheduleId),
    );
    removed += before - layer.items.length;
  }
  return removed;
}

/**
 * Creates the next table for a range that did not fit. Placement keeps the
 * same width, row limit, header/total choice and schedule, and sits directly
 * below the source table.
 */
export function continuePlacement(
  project: Project,
  itemId: string,
  rowStart: number,
  options: { layerName?: string } = {},
): PlacementResult | null {
  for (const layer of project.layers) {
    const source = layer.items.find((entry) => entry.id === itemId && entry.kind === "schedule");
    if (!source?.scheduleId) continue;
    const box = placementBox(source);
    const now = new Date().toISOString();
    const item: MarkupItem = {
      ...source,
      id: makeId("item"),
      points: [
        { x: box.origin.x, y: box.origin.y + box.height + CONTINUATION_GAP },
        {
          x: box.origin.x + box.width,
          y: box.origin.y + box.height * 2 + CONTINUATION_GAP,
        },
      ],
      rowStart: Math.max(0, Math.floor(rowStart)),
      createdAt: now,
      updatedAt: now,
    };
    // The continuation is always on a draw layer; moving it to another layer
    // would leave the table on a measurement layer.
    if (layer.kind !== "draw") {
      const target = placementLayer(project, source.pageId, { layerName: options.layerName });
      target.items.push(item);
      return { item, layerId: target.id };
    }
    layer.items.push(item);
    return { item, layerId: layer.id };
  }
  return null;
}

/** Layout for a stored placement from an already computed schedule result. */
export function layoutForItem(
  result: ScheduleResult,
  item: MarkupItem,
  measure: MeasureText,
): ScheduleTableLayout {
  const box = placementBox(item);
  return layoutScheduleTable({
    result,
    width: box.width,
    height: box.height,
    measure,
    fontSize: item.fontSize,
    rowStart: item.rowStart ?? 0,
    rowLimit: item.rowLimit ?? null,
    showHeader: item.showHeader !== false,
    showTotals: item.showTotals === true,
  });
}

/**
 * Layout a placement from the project. A missing schedule returns null so the
 * caller can draw the placeholder instead of an empty table.
 */
export function scheduleTableFor(
  project: Project,
  item: MarkupItem,
  measure: MeasureText,
): ScheduleTableLayout | null {
  if (item.kind !== "schedule") return null;
  const schedule = findSchedule(project, item.scheduleId);
  if (!schedule) return null;
  return layoutForItem(computeSchedule(project, schedule), item, measure);
}
