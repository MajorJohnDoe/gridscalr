import {
  inspectionStatusColor,
  symbolCategoryColor,
  symbolFor,
  symbolRenderPlan,
  symbolShapeStrokeWidth,
  symbolSizeOf,
} from "../../features/schematics/symbols/registry";
import { itemCenter, itemRotation, rotatePoint } from "../../model/geometry";
import { SYMBOL_TAG_FONT_SIZE, symbolTagPosition } from "../../model/symbolTag";
import type { MarkupItem } from "../../model/types";
import { symbolPath } from "../symbolPath";
import { FONT_STACK, type ItemRenderState } from "./context";

export function drawSymbolItem(
  ctx: CanvasRenderingContext2D,
  item: MarkupItem,
  state: ItemRenderState,
): void {
  if (item.kind !== "symbol") return;
  const { points, zoom, color } = state;
  const anchor = points[0];
  if (!anchor) return;
  const definition = symbolFor(item.symbolId);
  const accent =
    definition.style === "schematic"
      ? "#111111"
      : definition.id === "unknown"
        ? color
        : symbolCategoryColor(definition.category);
  const plan = symbolRenderPlan(definition, accent);
  const size = symbolSizeOf(item);
  const scale = (size * zoom) / plan.viewBox;
  const half = plan.viewBox / 2;
  ctx.save();
  ctx.translate(anchor.x, anchor.y);
  ctx.scale(scale, scale);
  ctx.translate(-half, -half);
  for (const shape of plan.shapes) {
    ctx.save();
    if (shape.scale !== 1) {
      ctx.translate(half, half);
      ctx.scale(shape.scale, shape.scale);
      ctx.translate(-half, -half);
    }
    const path = symbolPath(shape.d);
    if (shape.fill) {
      ctx.fillStyle = shape.fill;
      ctx.fill(path, shape.fillRule);
    }
    if (shape.stroke) {
      ctx.strokeStyle = shape.stroke;
      // Page-space width converted to local units: the stroke scales with
      // zoom exactly like the PDF export and the rest of the canvas.
      ctx.lineWidth = (symbolShapeStrokeWidth(plan, shape, size) * plan.viewBox) / size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(path);
    }
    ctx.restore();
  }
  if (item.status) {
    ctx.beginPath();
    ctx.arc(plan.badge.x, plan.badge.y, plan.badge.r + 1.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(15, 19, 21, 0.85)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(plan.badge.x, plan.badge.y, plan.badge.r + 0.7, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(plan.badge.x, plan.badge.y, plan.badge.r, 0, Math.PI * 2);
    ctx.fillStyle = inspectionStatusColor(item.status);
    ctx.fill();
  }
  ctx.restore();
}

export function drawSymbolTag(
  ctx: CanvasRenderingContext2D,
  item: MarkupItem,
  state: ItemRenderState,
): void {
  if (item.kind !== "symbol" || !item.tag) return;
  // The tag stays horizontal while the glyph turns: rotate its anchor
  // position around the symbol centre, then draw plain screen text.
  const tagPosition = symbolTagPosition(item);
  if (!tagPosition) return;
  const { context, zoom } = state;
  const rotation = itemRotation(item);
  const point = rotation === 0 ? tagPosition : rotatePoint(tagPosition, itemCenter(item), rotation);
  const screen = context.toScreen(point);
  ctx.save();
  ctx.font = `400 ${Math.max(4, SYMBOL_TAG_FONT_SIZE * zoom)}px ${FONT_STACK}`;
  ctx.fillStyle = "#111111";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(item.tag, screen.x, screen.y);
  ctx.restore();
}
