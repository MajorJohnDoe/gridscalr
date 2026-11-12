import { areaOutline, areaShapeOf } from "../model/area";
import { COUNT_SYMBOL_RADIUS } from "../model/countSymbols";
import {
  arcPolyline,
  expandRect,
  itemCorners,
  itemLocalToPage,
  itemSelectionCorners,
  midpoint,
  radiusCircle,
} from "../model/geometry";
import { findItem, isMeasurementKind, itemIsVisible, layerVisibleOnPage } from "../model/layers";
import { buildLayerHierarchy } from "../model/layerHierarchy";
import { resolveSelection } from "../model/selection";
import { selectionBounds } from "../model/transform";
import type { MarkupItem, Point } from "../model/types";
import { store } from "../state/store";
import { CALIBRATION_COLOR } from "./draftRenderer";
import { hexAlpha, roundRect, snapLabel } from "./geometry";
import { groupHandles } from "./pointer/groupHandles";
import { selectionHandles } from "./selectionHandles";
import type { MarqueeState } from "./pointer/pointerState";
import type { Draft } from "./draftRenderer";
import type { SnapResult } from "../model/snap";
import { TEXT_FONT_STACK } from "../model/text";

const ACCENT = "#35c2a1";
const FONT_STACK = TEXT_FONT_STACK;

export interface InteractionRenderContext {
  readOnly: boolean;
  page: number;
  zoom: number;
  toScreen: (point: Point) => Point;
  prepare: (ctx: CanvasRenderingContext2D) => void;
  cropDraw: (ctx: CanvasRenderingContext2D) => boolean;
  drawDraft: (ctx: CanvasRenderingContext2D) => void;
  labelResizePoint: (item: MarkupItem) => Point | null;
  hoverLabelResize: boolean;
  searchHits: {
    page: number;
    rects: Array<{ x: number; y: number; width: number; height: number }>;
  } | null;
  marquee: MarqueeState | null;
  draft: Draft | null;
  snap: SnapResult | null;
  pointerScreen: Point | null;
  dragActive: boolean;
  panActive: boolean;
}

export function drawInteraction(
  ctx: CanvasRenderingContext2D,
  context: InteractionRenderContext,
): void {
  context.prepare(ctx);
  if (context.readOnly || !store.project) return;
  if (context.cropDraw(ctx)) return;
  if (context.searchHits && context.searchHits.page === context.page) {
    ctx.save();
    ctx.fillStyle = "rgba(242, 169, 59, 0.22)";
    ctx.strokeStyle = "rgba(242, 169, 59, 0.9)";
    ctx.lineWidth = 1.2;
    for (const rect of context.searchHits.rects) {
      const topLeft = context.toScreen({ x: rect.x, y: rect.y });
      const width = rect.width * context.zoom;
      const height = rect.height * context.zoom;
      ctx.fillRect(topLeft.x, topLeft.y, width, height);
      ctx.strokeRect(topLeft.x + 0.5, topLeft.y + 0.5, width - 1, height - 1);
    }
    ctx.restore();
  }
  const hierarchy = buildLayerHierarchy(store.project.layers);
  const selected = resolveSelection(store.project, store.ui.selection).filter(
    (entry) =>
      layerVisibleOnPage(entry.layer, entry.item.pageId, hierarchy) &&
      itemIsVisible(entry.item, entry.layer, hierarchy),
  );

  if (selected.length) {
    for (const entry of selected) {
      ctx.save();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      traceItemOutline(ctx, entry.item, context);
      ctx.stroke();
      ctx.restore();
    }

    if (selected.length === 1 && !selected[0].locked) {
      const item = selected[0].item;
      const measured = isMeasurementKind(item.kind);
      const handles = selectionHandles(item, (page) => context.toScreen(page));
      const rotation = handles.find((handle) => handle.role === "rotate");
      ctx.save();
      if (rotation && !measured) {
        const corners = itemCorners(item).map((p) => context.toScreen(p));
        const top = midpoint(corners[0], corners[1]);
        ctx.strokeStyle = hexAlpha(ACCENT, 0.55);
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(rotation.point.x, rotation.point.y);
        ctx.stroke();
      }
      for (const handle of handles) {
        ctx.fillStyle = handle.role === "rotate" ? "#101619" : "#f7fbfc";
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1.5;
        if (handle.role === "rotate") {
          ctx.beginPath();
          ctx.arc(handle.point.x, handle.point.y, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(handle.point.x, handle.point.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = ACCENT;
          ctx.fill();
        } else if (handle.role === "label") {
          ctx.beginPath();
          ctx.arc(handle.point.x, handle.point.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = ACCENT;
          ctx.fill();
          ctx.strokeStyle = "#101619";
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.rect(handle.point.x - 4, handle.point.y - 4, 8, 8);
          ctx.fill();
          ctx.stroke();
        }
      }
      if (measured) {
        const resizePoint = context.labelResizePoint(item);
        if (resizePoint) {
          ctx.fillStyle = context.hoverLabelResize ? ACCENT : "#101619";
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.rect(resizePoint.x - 4, resizePoint.y - 4, 8, 8);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = context.hoverLabelResize ? "#101619" : ACCENT;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(resizePoint.x - 1.5, resizePoint.y + 1.5);
          ctx.lineTo(resizePoint.x + 1.5, resizePoint.y - 1.5);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    if (selected.length > 1) {
      const bounds = selectionBounds(store.project, store.ui.selection);
      if (bounds) {
        const topLeft = context.toScreen({ x: bounds.min.x, y: bounds.min.y });
        const bottomRight = context.toScreen({ x: bounds.max.x, y: bounds.max.y });
        ctx.save();
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(
          topLeft.x,
          topLeft.y,
          Math.max(1, bottomRight.x - topLeft.x),
          Math.max(1, bottomRight.y - topLeft.y),
        );
        ctx.setLineDash([]);
        for (const handle of groupHandles(bounds, (point) => context.toScreen(point))) {
          ctx.fillStyle = "#f7fbfc";
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.rect(handle.point.x - 4, handle.point.y - 4, 8, 8);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  } else if (store.ui.hover) {
    const found = findItem(store.project, store.ui.hover.itemId);
    if (found && found.item.visible !== false) {
      ctx.save();
      ctx.strokeStyle = hexAlpha(ACCENT, 0.55);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      traceItemOutline(ctx, found.item, context);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (context.marquee) {
    const start = context.toScreen(context.marquee.start);
    const end = context.toScreen(context.marquee.current);
    const rect = expandRect(start, end);
    ctx.save();
    ctx.fillStyle = "rgba(53, 194, 161, 0.10)";
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width, rect.height);
    ctx.restore();
  }

  if (context.draft) context.drawDraft(ctx);

  if (context.snap) {
    const p = context.toScreen(context.snap.point);
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.fillStyle = "rgba(53,194,161,0.18)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 10, p.y);
    ctx.lineTo(p.x + 10, p.y);
    ctx.moveTo(p.x, p.y - 10);
    ctx.lineTo(p.x, p.y + 10);
    ctx.stroke();

    const label = snapLabel(context.snap.kind);
    ctx.font = `600 10px ${FONT_STACK}`;
    const width = ctx.measureText(label).width + 10;
    const x = p.x + 12;
    const y = p.y - 26;
    ctx.fillStyle = "rgba(12,16,18,0.9)";
    ctx.strokeStyle = hexAlpha(ACCENT, 0.65);
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, width, 17, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#edf3f5";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 5, y + 8.5);
    ctx.restore();
  }

  if (
    context.pointerScreen &&
    !context.dragActive &&
    !context.panActive &&
    store.ui.activeTool !== "select" &&
    store.ui.activeTool !== "pan" &&
    store.ui.activeTool !== "text"
  ) {
    const p = context.pointerScreen;
    const color = context.draft && context.draft.kind === "calibrate" ? CALIBRATION_COLOR : ACCENT;
    ctx.save();
    ctx.strokeStyle = hexAlpha(color, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x - 5, p.y);
    ctx.lineTo(p.x + 5, p.y);
    ctx.moveTo(p.x, p.y - 5);
    ctx.lineTo(p.x, p.y + 5);
    ctx.stroke();
    ctx.restore();
  }
}
function traceItemOutline(
  ctx: CanvasRenderingContext2D,
  item: MarkupItem,
  context: InteractionRenderContext,
): void {
  ctx.beginPath();
  if (item.kind === "count") {
    const anchor = item.points[0];
    if (!anchor) return;
    const screen = context.toScreen(anchor);
    ctx.arc(
      screen.x,
      screen.y,
      Math.max(6, (COUNT_SYMBOL_RADIUS + 2) * context.zoom),
      0,
      Math.PI * 2,
    );
    return;
  }
  if (item.kind === "radius" || item.kind === "diameter") {
    const circle = radiusCircle(item);
    if (!circle) return;
    const center = context.toScreen(circle.center);
    ctx.arc(center.x, center.y, circle.radius * context.zoom, 0, Math.PI * 2);
    return;
  }
  if (item.kind === "arc") {
    arcPolyline(item).forEach((point, index) => {
      const screen = context.toScreen(point);
      if (index === 0) ctx.moveTo(screen.x, screen.y);
      else ctx.lineTo(screen.x, screen.y);
    });
    return;
  }
  if (item.kind === "length") {
    item.points.forEach((point, index) => {
      const screen = context.toScreen(itemLocalToPage(item, point));
      if (index === 0) ctx.moveTo(screen.x, screen.y);
      else ctx.lineTo(screen.x, screen.y);
    });
    return;
  }
  if (item.kind === "angle") {
    const [startPage, vertexPage, endPage] = item.points;
    if (!startPage || !vertexPage || !endPage) return;
    const start = context.toScreen(startPage);
    const vertex = context.toScreen(vertexPage);
    const end = context.toScreen(endPage);
    ctx.moveTo(vertex.x, vertex.y);
    ctx.lineTo(start.x, start.y);
    ctx.moveTo(vertex.x, vertex.y);
    ctx.lineTo(end.x, end.y);
    return;
  }
  if (item.kind === "slope") {
    const [startPage, endPage] = item.points;
    if (!startPage || !endPage) return;
    const start = context.toScreen(startPage);
    const end = context.toScreen(endPage);
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    return;
  }
  if (item.kind === "area" || item.kind === "volume") {
    areaOutline(item.points, areaShapeOf(item)).forEach((point, index) => {
      const screen = context.toScreen(itemLocalToPage(item, point));
      if (index === 0) ctx.moveTo(screen.x, screen.y);
      else ctx.lineTo(screen.x, screen.y);
    });
    ctx.closePath();
    return;
  }
  const corners = itemSelectionCorners(item).map((point) => context.toScreen(point));
  corners.forEach((corner, index) => {
    if (index === 0) ctx.moveTo(corner.x, corner.y);
    else ctx.lineTo(corner.x, corner.y);
  });
  ctx.closePath();
}
