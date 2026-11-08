import { degrees, LineCapStyle, rgb } from "pdf-lib";
import { rectangleCorners } from "../../../model/area";
import { canonicalColor } from "../../../model/color";
import { arrowHeadGeometry, midpoint } from "../../../model/geometry";
import { resolveItemColor } from "../../../model/layers";
import { railGeometry, railLegendY } from "../../../model/rail";
import type { MarkupItem } from "../../../model/types";
import {
  clamp,
  drawArrowHead,
  drawPolyline,
  itemRectCorners,
  pdfColor,
  pdfRectFromCorners,
  svgPolygon,
  toPdfPoint,
} from "../geometry";
import type { ItemContext } from "./context";
import { itemStroke } from "./context";

/** Pen, highlight, line, arrow, rectangle, ellipse, polyline and rail families. */
export function drawShapeItem(context: ItemContext, item: MarkupItem, layerOpacity: number): void {
  const { page, viewport } = context;
  const { color, width, opacity } = itemStroke(item, layerOpacity);

  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- partial family switch
  switch (item.kind) {
    case "pen":
      drawPolyline(page, viewport, item.points, color, width, opacity, false);
      break;
    case "highlight": {
      if (item.highlightShape && item.highlightShape !== "stroke") {
        const points =
          item.highlightShape === "rectangle"
            ? rectangleCorners(item.points.slice(0, 2))
            : item.points;
        const path = svgPolygon(viewport, points);
        page.drawSvgPath(path, {
          x: 0,
          y: 0,
          color,
          opacity: clamp(opacity * (item.opacity ?? 0.3), 0, 1),
        });
      } else {
        drawPolyline(
          page,
          viewport,
          item.points,
          color,
          width * 4.2,
          opacity * 0.38,
          false,
          LineCapStyle.Butt,
        );
      }
      break;
    }
    case "line":
      if (item.points.length < 2) break;
      drawPolyline(
        page,
        viewport,
        item.points.slice(0, 2),
        color,
        width,
        opacity,
        false,
        LineCapStyle.Butt,
        item.lineStyle === "dashed" ? [5, 3] : undefined,
      );
      break;
    case "arrow": {
      if (item.points.length < 2) break;
      const start = item.points[0];
      const end = item.points[1];
      const size = Math.max(8, width * 3.6);
      const head = arrowHeadGeometry(start, end, size);
      const startHead = item.arrowHeads === "both" ? arrowHeadGeometry(end, start, size) : null;
      drawPolyline(
        page,
        viewport,
        [startHead?.shaftEnd ?? start, head.shaftEnd],
        color,
        width,
        opacity,
        false,
        LineCapStyle.Butt,
      );
      if (startHead) drawArrowHead(page, viewport, start, startHead, color, opacity);
      drawArrowHead(page, viewport, end, head, color, opacity);
      break;
    }
    case "rect":
      if (item.points.length < 2) break;
      drawRectItem(context, item, layerOpacity);
      break;
    case "ellipse":
      if (item.points.length < 2) break;
      drawEllipseItem(context, item, layerOpacity);
      break;
    case "polyline":
      drawPolyline(
        page,
        viewport,
        item.points,
        color,
        Math.max(0.35, item.strokeWidth),
        opacity,
        false,
        LineCapStyle.Butt,
        item.lineStyle === "dashed" ? [5, 3] : undefined,
      );
      break;
    case "rail":
      drawRailItem(context, item, layerOpacity);
      break;
    default:
      break;
  }
}

function drawRailItem(context: ItemContext, item: MarkupItem, layerOpacity: number): void {
  const { page, viewport, fonts } = context;
  const geometry = railGeometry(item);
  if (!geometry) return;
  const color = pdfColor(resolveItemColor(item));
  const textColor = pdfColor("#1a2024");
  const opacity = clamp(layerOpacity, 0, 1);
  const width = Math.max(0.35, item.strokeWidth);

  for (const row of geometry.rows) {
    page.drawLine({
      start: toPdfPoint(viewport, { x: geometry.left, y: row.y }),
      end: toPdfPoint(viewport, { x: geometry.right, y: row.y }),
      thickness: width,
      color,
      opacity,
    });

    if (item.showBadges === false) continue;
    const fontSize = 6.5;
    const padding = 3;
    const badgeHeight = Math.max(8, geometry.rowSpacing * 0.82);
    const textWidth = fonts.regular.widthOfTextAtSize(row.label, fontSize);
    const badgeWidth = textWidth + padding * 2;
    const center = toPdfPoint(viewport, { x: geometry.left, y: row.y });
    page.drawRectangle({
      x: center.x,
      y: center.y - badgeHeight / 2,
      width: badgeWidth,
      height: badgeHeight,
      borderWidth: 0.7,
      borderColor: color,
      color: rgb(1, 1, 1),
      opacity,
    });
    page.drawText(row.label, {
      x: center.x + padding,
      y: center.y - fontSize * 0.35,
      size: fontSize,
      font: fonts.regular,
      color: textColor,
      opacity,
    });
  }

  const legends = geometry.rows.filter((row) => row.legend?.trim());
  if (item.showLegend === false || !legends.length) return;
  const baseline = toPdfPoint(viewport, { x: geometry.left, y: railLegendY(geometry) });
  const right = toPdfPoint(viewport, { x: geometry.right, y: railLegendY(geometry) });
  const step = (right.x - baseline.x) / legends.length;
  legends.forEach((row, index) => {
    page.drawText(`${row.label}= ${row.legend}`, {
      x: baseline.x + index * step,
      y: baseline.y,
      size: 6,
      font: fonts.regular,
      color: textColor,
      opacity,
    });
  });
}

function drawRectItem(context: ItemContext, item: MarkupItem, layerOpacity: number): void {
  const { page, viewport } = context;
  const corners = itemRectCorners(item);
  const rect = pdfRectFromCorners(viewport, corners);
  const color = pdfColor(resolveItemColor(item));
  const fillColor = canonicalColor(item.fillColor);
  const fill = fillColor ? pdfColor(fillColor) : undefined;
  const opacity = clamp(layerOpacity, 0, 1);
  const width = Math.max(0.35, item.strokeWidth);
  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    rotate: degrees(rect.angle),
    color: fill,
    opacity: fill ? opacity * (item.opacity ?? 0.15) : undefined,
    borderColor: color,
    borderWidth: width,
    borderOpacity: opacity,
    borderDashArray:
      item.lineStyle === "dashed" ? [Math.max(3, width * 3), Math.max(2, width * 2)] : undefined,
  });
}

function drawEllipseItem(context: ItemContext, item: MarkupItem, layerOpacity: number): void {
  const { page, viewport } = context;
  const corners = itemRectCorners(item);
  const center = midpoint(corners[0], corners[2]);
  const centerPdf = toPdfPoint(viewport, center);
  const rect = pdfRectFromCorners(viewport, corners);
  const color = pdfColor(resolveItemColor(item));
  const fillColor = canonicalColor(item.fillColor);
  const fill = fillColor ? pdfColor(fillColor) : undefined;
  const opacity = clamp(layerOpacity, 0, 1);
  const width = Math.max(0.35, item.strokeWidth);
  page.drawEllipse({
    x: centerPdf.x,
    y: centerPdf.y,
    xScale: Math.max(0.1, rect.width / 2),
    yScale: Math.max(0.1, rect.height / 2),
    rotate: degrees(rect.angle),
    color: fill,
    opacity: fill ? opacity * (item.opacity ?? 0.15) : undefined,
    borderColor: color,
    borderWidth: width,
    borderOpacity: opacity,
    borderDashArray:
      item.lineStyle === "dashed" ? [Math.max(3, width * 3), Math.max(2, width * 2)] : undefined,
  });
}
