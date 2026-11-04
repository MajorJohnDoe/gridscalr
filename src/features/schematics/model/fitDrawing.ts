import { itemBounds, type Bounds } from "../../../model/geometry";
import {
  itemIsLocked,
  itemIsVisible,
  layerLockedOnPage,
  layerVisibleOnPage,
} from "../../../model/layers";
import type { MarkupItem, Project } from "../../../model/types";
import { t } from "../../../i18n";
import { templateDocumentForPage } from "./sheetDocument";
import { resolveSheetLabels, sheetTemplateFor } from "./sheetTemplate";

export interface DrawingArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The drawing area of the template sheet on this page, if the page is a sheet. */
export function drawingAreaForPage(project: Project, page: number): DrawingArea | null {
  const document = templateDocumentForPage(project, page);
  if (!document?.template) return null;
  const spec = sheetTemplateFor(
    document.template.id,
    document.template.paper,
    resolveSheetLabels((key) => t(key)),
  );
  if (!spec) return null;
  return { ...spec.drawingArea };
}

function visibleBounds(project: Project, page: number): Bounds | null {
  let bounds: Bounds | null = null;
  for (const layer of project.layers) {
    if (!layerVisibleOnPage(layer, page)) continue;
    for (const item of layer.items) {
      if (item.page !== page || !itemIsVisible(item, layer)) continue;
      const next = itemBounds(item);
      bounds = bounds
        ? {
            min: { x: Math.min(bounds.min.x, next.min.x), y: Math.min(bounds.min.y, next.min.y) },
            max: { x: Math.max(bounds.max.x, next.max.x), y: Math.max(bounds.max.y, next.max.y) },
          }
        : next;
    }
  }
  return bounds;
}

/** True when visible items extend past the sheet's drawing area. */
export function drawingOverflowsArea(project: Project, page: number): boolean {
  const area = drawingAreaForPage(project, page);
  const bounds = area ? visibleBounds(project, page) : null;
  if (!area || !bounds) return false;
  return (
    bounds.min.x < area.x - 0.5 ||
    bounds.min.y < area.y - 0.5 ||
    bounds.max.x > area.x + area.width + 0.5 ||
    bounds.max.y > area.y + area.height + 0.5
  );
}

/** True when the page overflows and at least one item can be moved. */
export function canFitDrawingToArea(project: Project, page: number): boolean {
  if (!drawingOverflowsArea(project, page)) return false;
  return project.layers.some(
    (layer) =>
      layerVisibleOnPage(layer, page) &&
      !layerLockedOnPage(layer, page) &&
      layer.items.some(
        (item) => item.page === page && itemIsVisible(item, layer) && !itemIsLocked(item, layer),
      ),
  );
}

function scaleItem(
  item: MarkupItem,
  scale: number,
  sourceCenter: { x: number; y: number },
  targetCenter: { x: number; y: number },
): void {
  const mapX = (x: number) => targetCenter.x + (x - sourceCenter.x) * scale;
  const mapY = (y: number) => targetCenter.y + (y - sourceCenter.y) * scale;
  item.points = item.points.map((point) => ({ x: mapX(point.x), y: mapY(point.y) }));
  if (item.symbolSize !== undefined) item.symbolSize *= scale;
  if (item.fontSize !== undefined) item.fontSize = Math.max(0.5, item.fontSize * scale);
  if (item.labelSize !== undefined) item.labelSize = Math.max(0.5, item.labelSize * scale);
  if (item.padding !== undefined) item.padding = Math.max(0, item.padding * scale);
  if (item.textBoxWidth !== undefined) item.textBoxWidth = Math.max(20, item.textBoxWidth * scale);
  if (item.textBoxHeight !== undefined)
    item.textBoxHeight = Math.max(15, item.textBoxHeight * scale);
  if (item.rowSpacing !== undefined) item.rowSpacing = Math.max(2, item.rowSpacing * scale);
  for (const key of ["textOffset", "labelOffset", "tagOffset"] as const) {
    const offset = item[key];
    if (offset) {
      item[key] = { x: offset.x * scale, y: offset.y * scale };
    }
  }
  if (item.runs?.length) {
    item.runs = item.runs.map((run) => ({
      ...run,
      ...(run.size === undefined ? {} : { size: Math.max(0.5, run.size * scale) }),
    }));
  }
  item.updatedAt = new Date().toISOString();
}

/**
 * Scales and centres every unlocked, visible item on a template page so the
 * drawing fits its drawing area. One store mutation makes the whole action one
 * undo step. Returns true when something moved.
 */
export function fitDrawingToArea(project: Project, page: number): boolean {
  const area = drawingAreaForPage(project, page);
  const bounds = area ? visibleBounds(project, page) : null;
  if (!area || !bounds) return false;
  if (!drawingOverflowsArea(project, page)) return false;
  const width = Math.max(0.01, bounds.max.x - bounds.min.x);
  const height = Math.max(0.01, bounds.max.y - bounds.min.y);
  const scale = Math.min(1, area.width / width, area.height / height);
  if (!Number.isFinite(scale) || scale <= 0) return false;
  const sourceCenter = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
  };
  const targetCenter = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
  let moved = false;
  for (const layer of project.layers) {
    if (!layerVisibleOnPage(layer, page) || layerLockedOnPage(layer, page)) continue;
    for (const item of layer.items) {
      if (item.page !== page || !itemIsVisible(item, layer) || itemIsLocked(item, layer)) continue;
      scaleItem(item, scale, sourceCenter, targetCenter);
      moved = true;
    }
  }
  return moved;
}
