import { degrees, LineCapStyle } from "pdf-lib";
import { areaShapeOf } from "../../../model/area";
import { angleArcPolyline, arcPolyline, midpoint, radiusCircle } from "../../../model/geometry";
import type { MarkupItem } from "../../../model/types";
import {
  drawPolyline,
  itemRectCorners,
  pdfRectFromCorners,
  svgPolygon,
  toPdfPoint,
} from "../geometry";
import type { ItemContext } from "./context";
import { itemStroke } from "./context";

/** Length, angle, slope, radius, diameter, arc, area and volume families. */
export function drawMeasurementItem(
  context: ItemContext,
  item: MarkupItem,
  layerOpacity: number,
): void {
  const { page, viewport } = context;
  const { color, width, opacity } = itemStroke(item, layerOpacity);
  const dashed =
    item.lineStyle === "dashed" ? [Math.max(3, width * 3), Math.max(2, width * 2)] : undefined;

  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- partial family switch
  switch (item.kind) {
    case "length":
      drawPolyline(
        page,
        viewport,
        item.points,
        color,
        width,
        opacity,
        false,
        LineCapStyle.Round,
        dashed,
      );
      break;
    case "angle": {
      const [start, vertex, end] = item.points;
      if (!start || !vertex || !end) break;
      drawPolyline(page, viewport, [vertex, start], color, width, opacity, false);
      drawPolyline(page, viewport, [vertex, end], color, width, opacity, false);
      drawPolyline(page, viewport, angleArcPolyline(item), color, width, opacity, false);
      break;
    }
    case "slope":
      drawPolyline(page, viewport, item.points, color, width, opacity, false);
      break;
    case "radius":
    case "diameter": {
      const circle = radiusCircle(item);
      if (!circle) break;
      const center = toPdfPoint(viewport, circle.center);
      page.drawCircle({
        x: center.x,
        y: center.y,
        size: circle.radius * viewport.scale,
        borderColor: color,
        borderWidth: width,
        borderOpacity: opacity,
      });
      drawPolyline(
        page,
        viewport,
        item.kind === "diameter"
          ? [
              {
                x: circle.center.x - (circle.edge.x - circle.center.x),
                y: circle.center.y - (circle.edge.y - circle.center.y),
              },
              circle.edge,
            ]
          : [circle.center, circle.edge],
        color,
        width,
        opacity,
        false,
        LineCapStyle.Round,
        dashed,
      );
      break;
    }
    case "arc":
      drawPolyline(
        page,
        viewport,
        arcPolyline(item),
        color,
        width,
        opacity,
        false,
        LineCapStyle.Round,
        dashed,
      );
      break;
    case "area":
    case "volume": {
      const shape = areaShapeOf(item);
      if (shape === "rectangle") {
        const corners = itemRectCorners(item);
        const rect = pdfRectFromCorners(viewport, corners);
        page.drawRectangle({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          rotate: degrees(rect.angle),
          color,
          opacity: opacity * 0.14,
          borderColor: color,
          borderWidth: width,
          borderOpacity: opacity,
        });
      } else if (shape === "ellipse") {
        const corners = itemRectCorners(item);
        const center = midpoint(corners[0], corners[2]);
        const centerPdf = toPdfPoint(viewport, center);
        const rect = pdfRectFromCorners(viewport, corners);
        page.drawEllipse({
          x: centerPdf.x,
          y: centerPdf.y,
          xScale: Math.max(0.1, rect.width / 2),
          yScale: Math.max(0.1, rect.height / 2),
          rotate: degrees(rect.angle),
          color,
          opacity: opacity * 0.14,
          borderColor: color,
          borderWidth: width,
          borderOpacity: opacity,
        });
      } else {
        const path = svgPolygon(viewport, item.points);
        page.drawSvgPath(path, {
          x: 0,
          y: 0,
          color,
          opacity: opacity * 0.14,
          borderColor: color,
          borderWidth: width,
          borderOpacity: opacity,
        });
      }
      break;
    }
    default:
      break;
  }
}
