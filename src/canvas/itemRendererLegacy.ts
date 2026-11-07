import { countTypeGlyph } from "../features/countTypes/model";
import {
  inspectionStatusColor,
  symbolCategoryColor,
  symbolFor,
  symbolRenderPlan,
  symbolShapeStrokeWidth,
  symbolSizeOf,
} from "../features/schematics/symbols/registry";
import { calloutLayout, cloudLabelLayout, deltaLayout, stampLayout } from "../model/annotations";
import { cloudCurves, cloudRadiusForPoints } from "../model/cloud";
import { countSymbol } from "../model/countSymbols";
import { arrowHeadGeometry, expandRect } from "../model/geometry";
import { imageAssetForItem, imageOpacity } from "../model/images";
import { TEXT_FONT_STACK } from "../model/text";
import type { MarkupItem } from "../model/types";
import { drawArrowHead, hexAlpha } from "./geometry";
import { symbolPath } from "./symbolPath";
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
  const { context, points, zoom, lineWidth, drawPanel } = state;

  // Temporary partial switch while the remaining families are extracted.
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- partial family switch
  switch (item.kind) {
    case "count": {
      const anchorPage = item.points[0];
      if (!anchorPage) break;
      const project = context.project;
      if (!project) break;
      const symbol = countSymbol(countTypeGlyph(project, item.countType));
      for (const path of symbol.paths) {
        ctx.beginPath();
        path.points.forEach((point, index) => {
          const screen = context.toScreen({ x: anchorPage.x + point.x, y: anchorPage.y + point.y });
          if (index === 0) ctx.moveTo(screen.x, screen.y);
          else ctx.lineTo(screen.x, screen.y);
        });
        if (path.closed) ctx.closePath();
        ctx.stroke();
      }
      for (const dot of symbol.dots) {
        const center = context.toScreen({
          x: anchorPage.x + dot.center.x,
          y: anchorPage.y + dot.center.y,
        });
        ctx.beginPath();
        ctx.arc(center.x, center.y, Math.max(0.6, dot.radius * zoom), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "symbol": {
      const anchor = points[0];
      if (!anchor) break;
      const definition = symbolFor(item.symbolId);
      const accent =
        definition.style === "schematic"
          ? "#111111"
          : definition.id === "unknown"
            ? item.color
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
      break;
    }
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
    case "image": {
      if (points.length < 2) break;
      const project = context.project;
      const asset = project ? imageAssetForItem(project, item) : undefined;
      if (!asset) break;
      const image = context.imageElement(asset);
      if (!image) break;
      const rect = expandRect(points[0], points[1]);
      ctx.save();
      ctx.globalAlpha *= imageOpacity(item);
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
      break;
    }
  }
}
