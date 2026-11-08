import { rectangleCorners } from "../../model/area";
import { cloudCurves, cloudRadiusForPoints } from "../../model/cloud";
import { canonicalColor } from "../../model/color";
import { arrowHeadGeometry, expandRect } from "../../model/geometry";
import { railGeometry, railLegendY } from "../../model/rail";
import type { MarkupItem } from "../../model/types";
import { drawArrowHead, roundRect } from "../geometry";
import { drawEndpoints } from "../annotationDraw";
import { FONT_STACK, type ItemRenderState } from "./context";

export function drawShapeItem(
  ctx: CanvasRenderingContext2D,
  item: MarkupItem,
  state: ItemRenderState,
): void {
  const { context, points, zoom, lineWidth, color } = state;

  // Shape cases only; other item kinds are handled by their own family module.
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- partial family switch
  switch (item.kind) {
    case "pen": {
      ctx.beginPath();
      points.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      break;
    }
    case "highlight": {
      if (item.highlightShape && item.highlightShape !== "stroke") {
        const outline =
          item.highlightShape === "rectangle" ? rectangleCorners([points[0], points[1]]) : points;
        ctx.save();
        ctx.globalAlpha *= item.opacity ?? 0.3;
        ctx.fillStyle = color;
        ctx.beginPath();
        outline.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      ctx.save();
      ctx.globalAlpha *= 0.38;
      ctx.lineWidth = lineWidth * 4.2;
      ctx.lineCap = "butt";
      ctx.beginPath();
      points.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "line": {
      if (points.length < 2) break;
      if (item.lineStyle === "dashed") {
        ctx.setLineDash([Math.max(3, lineWidth * 3), Math.max(2, lineWidth * 2)]);
      }
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
      ctx.setLineDash([]);
      drawEndpoints(ctx, points, color, lineWidth);
      break;
    }
    case "arrow": {
      if (points.length < 2) break;
      const size = Math.max(8, lineWidth * 3.6);
      const head = arrowHeadGeometry(points[0], points[1], size);
      const startHead =
        item.arrowHeads === "both" ? arrowHeadGeometry(points[1], points[0], size) : null;
      ctx.save();
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo((startHead?.shaftEnd ?? points[0]).x, (startHead?.shaftEnd ?? points[0]).y);
      ctx.lineTo(head.shaftEnd.x, head.shaftEnd.y);
      ctx.stroke();
      ctx.restore();
      if (startHead) drawArrowHead(ctx, points[0], startHead, color);
      drawArrowHead(ctx, points[1], head, color);
      break;
    }
    case "rect": {
      if (points.length < 2) break;
      const rect = expandRect(points[0], points[1]);
      const fill = canonicalColor(item.fillColor);
      if (fill) {
        ctx.save();
        ctx.globalAlpha *= item.opacity ?? 0.15;
        ctx.fillStyle = fill;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.restore();
      }
      if (item.lineStyle === "dashed") {
        ctx.setLineDash([Math.max(4, lineWidth * 3), Math.max(3, lineWidth * 2)]);
      }
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      ctx.setLineDash([]);
      break;
    }
    case "ellipse": {
      if (points.length < 2) break;
      const rect = expandRect(points[0], points[1]);
      ctx.beginPath();
      ctx.ellipse(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
        Math.max(0.5, rect.width / 2),
        Math.max(0.5, rect.height / 2),
        0,
        0,
        Math.PI * 2,
      );
      const fill = canonicalColor(item.fillColor);
      if (fill) {
        ctx.save();
        ctx.globalAlpha *= item.opacity ?? 0.15;
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.restore();
      }
      if (item.lineStyle === "dashed") {
        ctx.setLineDash([Math.max(4, lineWidth * 3), Math.max(3, lineWidth * 2)]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "polyline": {
      ctx.beginPath();
      points.forEach((point, index) =>
        index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
      );
      if (item.lineStyle === "dashed") {
        ctx.setLineDash([Math.max(4, lineWidth * 3), Math.max(3, lineWidth * 2)]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "rail": {
      const geometry = railGeometry(item);
      if (!geometry) break;
      const left = context.toScreen({ x: geometry.left, y: geometry.top });
      const right = context.toScreen({ x: geometry.right, y: geometry.top });
      const width = Math.max(0.5, item.strokeWidth * zoom);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;

      for (const row of geometry.rows) {
        const y = context.toScreen({ x: geometry.left, y: row.y }).y;
        ctx.beginPath();
        ctx.moveTo(left.x, y);
        ctx.lineTo(right.x, y);
        ctx.stroke();

        if (item.showBadges !== false) {
          const fontSize = Math.max(5, 6.5 * zoom);
          const badgeHeight = Math.max(8, geometry.rowSpacing * zoom * 0.82);
          const padding = Math.max(2, 3 * zoom);
          ctx.font = `600 ${fontSize}px ${FONT_STACK}`;
          const textWidth = ctx.measureText(row.label).width;
          const badgeWidth = textWidth + padding * 2;
          ctx.save();
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(0.6, 0.8 * zoom);
          roundRect(ctx, left.x, y - badgeHeight / 2, badgeWidth, badgeHeight, badgeHeight / 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          ctx.fillStyle = "#1a2024";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(row.label, left.x + padding, y);
        }
      }

      const legends = geometry.rows.filter((row) => row.legend?.trim());
      if (item.showLegend !== false && legends.length) {
        const y = context.toScreen({ x: geometry.left, y: railLegendY(geometry) }).y;
        const step = (right.x - left.x) / Math.max(1, legends.length);
        const fontSize = Math.max(5, 6 * zoom);
        ctx.font = `400 ${fontSize}px ${FONT_STACK}`;
        ctx.fillStyle = "#1a2024";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        legends.forEach((row, index) => {
          ctx.fillText(`${row.label}= ${row.legend}`, left.x + index * step, y);
        });
      }
      break;
    }
    default:
      break;
  }
}

export function drawCloudShape(
  ctx: CanvasRenderingContext2D,
  item: MarkupItem,
  state: ItemRenderState,
): void {
  if (item.kind !== "cloud") return;
  const { context } = state;
  const curves = cloudCurves(item.points, item.cloudRadius ?? cloudRadiusForPoints(item.points));
  if (!curves.length) return;
  const pathStart = context.toScreen(curves[0].start);
  ctx.save();
  const fill = canonicalColor(item.fillColor);
  if (fill) {
    ctx.save();
    ctx.globalAlpha *= item.opacity ?? 0.12;
    ctx.fillStyle = fill;
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
}
