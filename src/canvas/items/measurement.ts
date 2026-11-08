import { areaOutline, areaShapeOf } from "../../model/area";
import { angleArcPolyline, arcPolyline, itemLocalToPage, radiusCircle } from "../../model/geometry";
import type { MarkupItem } from "../../model/types";
import { drawEndpoints } from "../annotationDraw";
import type { ItemRenderState } from "./context";

export function drawMeasurementItem(
  ctx: CanvasRenderingContext2D,
  item: MarkupItem,
  state: ItemRenderState,
): void {
  const { context, points, zoom, lineWidth, color } = state;

  // Measurement cases only; other item kinds are handled by their own family module.
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- partial family switch
  switch (item.kind) {
    case "length": {
      ctx.beginPath();
      points.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      if (item.lineStyle === "dashed") {
        ctx.setLineDash([Math.max(4, lineWidth * 3), Math.max(3, lineWidth * 2)]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      drawEndpoints(ctx, points, color, lineWidth);
      break;
    }
    case "angle": {
      const [startPage, vertexPage, endPage] = item.points;
      if (!startPage || !vertexPage || !endPage) break;
      const start = context.toScreen(startPage);
      const vertex = context.toScreen(vertexPage);
      const end = context.toScreen(endPage);
      ctx.beginPath();
      ctx.moveTo(vertex.x, vertex.y);
      ctx.lineTo(start.x, start.y);
      ctx.moveTo(vertex.x, vertex.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      const curve = angleArcPolyline(item).map((point) => context.toScreen(point));
      if (curve.length > 1) {
        ctx.beginPath();
        curve.forEach((point, index) =>
          index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
        );
        ctx.stroke();
      }
      drawEndpoints(ctx, [start, vertex, end], color, lineWidth);
      break;
    }
    case "slope": {
      const [startPage, endPage] = item.points;
      if (!startPage || !endPage) break;
      const start = context.toScreen(startPage);
      const end = context.toScreen(endPage);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      drawEndpoints(ctx, [start, end], color, lineWidth);
      break;
    }
    case "radius":
    case "diameter": {
      const circle = radiusCircle(item);
      if (!circle) break;
      const center = context.toScreen(circle.center);
      const edge = context.toScreen(circle.edge);
      const opposite = context.toScreen({
        x: circle.center.x - (circle.edge.x - circle.center.x),
        y: circle.center.y - (circle.edge.y - circle.center.y),
      });
      ctx.beginPath();
      if (item.lineStyle === "dashed") {
        ctx.setLineDash([Math.max(4, lineWidth * 3), Math.max(3, lineWidth * 2)]);
      }
      ctx.arc(center.x, center.y, circle.radius * zoom, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      if (item.kind === "diameter") {
        ctx.moveTo(opposite.x, opposite.y);
        ctx.lineTo(edge.x, edge.y);
      } else {
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(edge.x, edge.y);
      }
      ctx.stroke();
      drawEndpoints(
        ctx,
        item.kind === "diameter" ? [opposite, edge] : [center, edge],
        color,
        lineWidth,
      );
      break;
    }
    case "arc": {
      const curve = arcPolyline(item).map((point) => context.toScreen(point));
      ctx.beginPath();
      curve.forEach((point, index) =>
        index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
      );
      if (item.lineStyle === "dashed") {
        ctx.setLineDash([Math.max(4, lineWidth * 3), Math.max(3, lineWidth * 2)]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      drawEndpoints(ctx, [curve[0], curve[curve.length - 1]].filter(Boolean), color, lineWidth);
      break;
    }
    case "area":
    case "volume": {
      const shape = areaShapeOf(item);
      const outline = areaOutline(item.points, shape).map((point) =>
        context.toScreen(itemLocalToPage(item, point)),
      );
      ctx.save();
      ctx.globalAlpha *= 0.14;
      ctx.beginPath();
      outline.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      outline.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
      if (shape !== "ellipse") drawEndpoints(ctx, outline, color, lineWidth);
      break;
    }
    default:
      break;
  }
}
