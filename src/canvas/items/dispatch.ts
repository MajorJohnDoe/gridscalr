import { itemCenter, itemRotation } from "../../model/geometry";
import type { LabelLayout } from "../../model/labelLayout";
import { isMeasurementKind, resolveItemColor } from "../../model/layers";
import type { MarkupItem } from "../../model/types";
import {
  createDrawPanel,
  drawLabel,
  type ItemRenderContext,
  type ItemRenderState,
} from "./context";
import { drawAnnotationItem, drawCloudLabel } from "./annotations";
import { drawCountItem } from "./counts";
import { drawImageItem } from "./images";
import { drawMeasurementItem } from "./measurement";
import { drawCloudShape, drawShapeItem } from "./shapes";
import { drawSymbolItem, drawSymbolTag } from "./symbols";
import { drawTextItem } from "./text";

export function dispatchItem(
  ctx: CanvasRenderingContext2D,
  item: MarkupItem,
  labels: Map<string, LabelLayout>,
  context: ItemRenderContext,
): void {
  if (
    context.editors.editingItemId === item.id &&
    item.kind !== "cloud" &&
    item.kind !== "callout"
  ) {
    return;
  }
  const zoom = context.zoom;
  const points = item.points.map((p) => context.toScreen(p));
  if (points.length === 0) return;
  const lineWidth = Math.max(1, item.strokeWidth * zoom);
  const rotation = itemRotation(item);
  const rotatesInPlace =
    rotation !== 0 &&
    (item.kind === "text" ||
      item.kind === "textbox" ||
      item.kind === "rect" ||
      item.kind === "ellipse" ||
      item.kind === "image" ||
      item.kind === "symbol");
  const center = rotatesInPlace ? context.toScreen(itemCenter(item)) : null;
  const color = resolveItemColor(item);
  const state: ItemRenderState = {
    context,
    zoom,
    points,
    lineWidth,
    color,
    drawPanel: createDrawPanel(context),
  };

  ctx.save();
  if (center) {
    ctx.translate(center.x, center.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-center.x, -center.y);
  }
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (item.kind) {
    case "length":
    case "angle":
    case "slope":
    case "radius":
    case "diameter":
    case "arc":
    case "area":
    case "volume":
      drawMeasurementItem(ctx, item, state);
      break;
    case "count":
      drawCountItem(ctx, item, state);
      break;
    case "symbol":
      drawSymbolItem(ctx, item, state);
      break;
    case "pen":
    case "highlight":
    case "line":
    case "arrow":
    case "rect":
    case "ellipse":
      drawShapeItem(ctx, item, state);
      break;
    case "cloud":
      drawCloudShape(ctx, item, state);
      drawCloudLabel(ctx, item, state);
      break;
    case "callout":
    case "stamp":
    case "delta":
      drawAnnotationItem(ctx, item, state);
      break;
    case "polyline":
    case "rail":
      drawShapeItem(ctx, item, state);
      break;
    case "textbox":
    case "text":
      drawTextItem(ctx, item, state);
      break;
    case "image":
      drawImageItem(ctx, item, state);
      break;
  }
  ctx.restore();

  if (item.kind === "symbol" && item.tag) {
    drawSymbolTag(ctx, item, state);
  }

  if (isMeasurementKind(item.kind)) {
    const layout = labels.get(item.id);
    if (layout && context.editors.editingLabelId !== item.id) {
      drawLabel(ctx, layout, context);
    }
  }
}
