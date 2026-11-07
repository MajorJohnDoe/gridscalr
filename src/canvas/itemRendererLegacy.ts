import { calloutLayout, cloudLabelLayout, deltaLayout, stampLayout } from "../model/annotations";
import { cloudCurves, cloudRadiusForPoints } from "../model/cloud";
import { arrowHeadGeometry } from "../model/geometry";
import { TEXT_FONT_STACK } from "../model/text";
import type { MarkupItem } from "../model/types";
import { drawArrowHead, hexAlpha } from "./geometry";
import type { ItemRenderState } from "./items/context";

/**
 * Temporary holder for the item families that have not been moved into
 * `src/canvas/items/` yet. Removed by item-renderer step I6.
 */
export function drawRemainingItem(
  ctx: CanvasRenderingContext2D,
  item: MarkupItem,
  state: ItemRenderState,
): void {
  const { context, zoom, lineWidth, drawPanel } = state;

  // Temporary partial switch while the remaining families are extracted.
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- partial family switch
  switch (item.kind) {
    case "cloud": {
      const curves = cloudCurves(
        item.points,
        item.cloudRadius ?? cloudRadiusForPoints(item.points),
      );
      if (!curves.length) break;
      const pathStart = context.toScreen(curves[0].start);
      ctx.save();
      if (item.fillColor) {
        ctx.save();
        ctx.globalAlpha *= item.opacity ?? 0.12;
        ctx.fillStyle = item.fillColor;
        ctx.beginPath();
        ctx.moveTo(pathStart.x, pathStart.y);
        for (const curve of curves) {
          const cp1 = context.toScreen(curve.cp1);
          const cp2 = context.toScreen(curve.cp2);
          const end = context.toScreen(curve.end);
          ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.moveTo(pathStart.x, pathStart.y);
      for (const curve of curves) {
        const cp1 = context.toScreen(curve.cp1);
        const cp2 = context.toScreen(curve.cp2);
        const end = context.toScreen(curve.end);
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      const label = cloudLabelLayout(item);
      if (label && context.editors.editingItemId !== item.id) {
        drawPanel(ctx, label, item, "rgba(12, 16, 18, 0.9)", item.textColor ?? "#f7fbfc", true);
      }
      break;
    }
    case "callout": {
      const liveCallout =
        context.editors.textSession &&
        context.editors.textSession.itemId === item.id &&
        context.editors.textSession.mode === "callout"
          ? {
              ...item,
              text: context.editors.textSession.text,
              fontSize: context.editors.textSession.fontSize,
              textBoxWidth: context.editors.textSession.boxWidth,
              textBoxHeight: context.editors.textSession.boxHeight,
            }
          : item;
      const layout = calloutLayout(liveCallout);
      const anchor = context.toScreen(layout.anchor);
      const leaderStart = context.toScreen(layout.leaderStart);
      const size = Math.max(8, lineWidth * 3.6);
      const head = arrowHeadGeometry(leaderStart, anchor, size);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(leaderStart.x, leaderStart.y);
      ctx.lineTo(head.shaftEnd.x, head.shaftEnd.y);
      ctx.stroke();
      drawArrowHead(ctx, anchor, head, item.color);
      ctx.restore();
      if (context.editors.editingItemId !== item.id) {
        drawPanel(
          ctx,
          {
            ...layout,
            center: {
              x: layout.box.x + layout.box.width / 2,
              y: layout.box.y + layout.box.height / 2,
            },
          },
          item,
          "rgba(12, 16, 18, 0.92)",
          item.textColor ?? "#f7fbfc",
          false,
        );
      }
      break;
    }
    case "stamp": {
      const layout = stampLayout(item);
      drawPanel(
        ctx,
        layout,
        item,
        hexAlpha(item.color, Math.max(0.12, item.opacity ?? 0.12)),
        item.textColor ?? item.color,
        true,
        "stamp",
      );
      break;
    }
    case "delta": {
      const layout = deltaLayout(item);
      const size = layout.size * zoom;
      const center = context.toScreen(layout.center);
      ctx.save();
      ctx.save();
      ctx.globalAlpha *= item.opacity ?? 0.16;
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - size / 2);
      ctx.lineTo(center.x + size / 2, center.y + size / 2);
      ctx.lineTo(center.x - size / 2, center.y + size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - size / 2);
      ctx.lineTo(center.x + size / 2, center.y + size / 2);
      ctx.lineTo(center.x - size / 2, center.y + size / 2);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = item.textColor ?? item.color;
      ctx.font = `700 ${Math.max(7, (item.fontSize ?? 14) * zoom * 0.7)}px ${TEXT_FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.text || "", center.x, center.y + size * 0.12);
      if (item.label) {
        ctx.font = `500 ${Math.max(6, (item.fontSize ?? 14) * zoom * 0.38)}px ${TEXT_FONT_STACK}`;
        ctx.fillText(item.label, center.x, center.y + size * 0.62);
      }
      ctx.restore();
      break;
    }
  }
}
