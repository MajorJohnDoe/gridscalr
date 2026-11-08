import { degrees, LineCapStyle, type PDFPage, type RGB } from "pdf-lib";
import type { PageViewport } from "pdfjs-dist";
import { canonicalColor, normalizeColor } from "../../../model/color";
import { resolveItemColor } from "../../../model/layers";
import {
  calloutLayout,
  cloudLabelLayout,
  closestPointOnBox,
  closestPointOnPolygon,
  deltaLayout,
  stampLayout,
  type TextBoxLayout,
} from "../../../model/annotations";
import { arrowHeadGeometry } from "../../../model/geometry";
import { cloudCurves, cloudRadiusForPoints } from "../../../model/cloud";
import { TEXT_UNDERLINE_OFFSET, TEXT_UNDERLINE_WIDTH, textLineX } from "../../../model/text";
import type { MarkupItem, Point } from "../../../model/types";
import type { ExportFonts } from "../types";
import {
  clamp,
  cloudSvgPath,
  drawArrowHead,
  drawPolyline,
  pdfAngle,
  pdfColor,
  roundedRectSvgPath,
  toPdfPoint,
} from "../geometry";
import { drawCenteredText, drawTrackedCenteredText, INK, LABEL_BG } from "../labels";
import type { ItemContext } from "./context";
import { itemStroke } from "./context";

/** Callouts, stamps, delta triangles and revision clouds with their labels. */
export function drawAnnotationItem(
  context: ItemContext,
  item: MarkupItem,
  layerOpacity: number,
): void {
  if (item.kind === "cloud") {
    drawCloudItem(context, item, layerOpacity);
    return;
  }
  const { color, width, opacity } = itemStroke(item, layerOpacity);
  if (item.kind === "callout") {
    drawCalloutItem(context, item, color, width, opacity);
    return;
  }
  if (item.kind === "stamp") {
    drawAnnotationPanel(
      context.page,
      context.viewport,
      stampLayout(item),
      item,
      context.fonts,
      opacity,
      "stamp",
    );
    return;
  }
  if (item.kind === "delta") {
    drawDelta(context.page, context.viewport, item, context.fonts, opacity, color, width);
  }
}

function drawCloudItem(context: ItemContext, item: MarkupItem, layerOpacity: number): void {
  const { page, viewport } = context;
  const { color, width, opacity } = itemStroke(item, layerOpacity);
  const curves = cloudCurves(item.points, item.cloudRadius ?? cloudRadiusForPoints(item.points));
  if (curves.length) {
    const path = cloudSvgPath(viewport, curves);
    const fillColor = canonicalColor(item.fillColor);
    page.drawSvgPath(path, {
      x: 0,
      y: 0,
      ...(fillColor
        ? {
            color: pdfColor(fillColor),
            opacity: clamp(opacity * (item.opacity ?? 0.12), 0, 1),
          }
        : {}),
      borderColor: color,
      borderWidth: width,
      borderOpacity: opacity,
    });
  }
  const label = cloudLabelLayout(item);
  if (!label) return;
  const target = closestPointOnPolygon(item.points, label.center);
  const box = {
    x: label.center.x - label.width / 2,
    y: label.center.y - label.height / 2,
    width: label.width,
    height: label.height,
  };
  const edge = closestPointOnBox(box, target);
  const head = arrowHeadGeometry(edge, target, 6);
  drawPolyline(
    page,
    viewport,
    [edge, head.shaftEnd],
    color,
    Math.max(0.5, width),
    opacity,
    false,
    LineCapStyle.Butt,
  );
  drawArrowHead(page, viewport, target, head, color, opacity);
  drawAnnotationPanel(page, viewport, label, item, context.fonts, opacity, "dark");
}

function drawCalloutItem(
  context: ItemContext,
  item: MarkupItem,
  color: ReturnType<typeof pdfColor>,
  width: number,
  opacity: number,
): void {
  const { page, viewport } = context;
  const layout = calloutLayout(item);
  const size = Math.max(8, width * 3.6);
  const head = arrowHeadGeometry(layout.leaderStart, layout.anchor, size);
  drawPolyline(
    page,
    viewport,
    [layout.leaderStart, head.shaftEnd],
    color,
    width,
    opacity,
    false,
    LineCapStyle.Butt,
  );
  drawArrowHead(page, viewport, layout.anchor, head, color, opacity);
  drawAnnotationPanel(page, viewport, layout, item, context.fonts, opacity, "dark");
}

function drawAnnotationPanel(
  page: PDFPage,
  viewport: PageViewport,
  layout: Omit<TextBoxLayout, "center"> & { center: Point },
  item: MarkupItem,
  fonts: ExportFonts,
  opacity: number,
  style: "dark" | "stamp" | "rgba",
): void {
  const box = {
    x: layout.center.x - layout.width / 2,
    y: layout.center.y - layout.height / 2,
    width: layout.width,
    height: layout.height,
  };
  const path = roundedRectSvgPath(viewport, box, Math.min(5, layout.height / 4));
  const border = pdfColor(resolveItemColor(item));
  if (style === "dark") {
    page.drawSvgPath(path, {
      x: 0,
      y: 0,
      color: LABEL_BG,
      opacity: clamp(opacity * 0.92, 0, 1),
      borderColor: border,
      borderWidth: Math.max(0.5, item.strokeWidth),
      borderOpacity: opacity,
    });
  } else if (style === "stamp") {
    page.drawSvgPath(path, {
      x: 0,
      y: 0,
      color: border,
      opacity: clamp(opacity * (item.opacity ?? 0.12), 0, 1),
      borderColor: border,
      borderWidth: Math.max(0.5, item.strokeWidth),
      borderOpacity: opacity,
    });
  }
  const isStamp = style === "stamp";
  const font = isStamp || item.textBold === true ? fonts.bold : fonts.regular;
  const textColor = item.textColor
    ? pdfColor(
        normalizeColor(item.textColor, style === "dark" ? "#f7fbfc" : resolveItemColor(item)),
      )
    : style === "dark"
      ? INK
      : border;
  const lineHeight = layout.lineHeight;
  const align = isStamp ? "center" : (item.textAlign ?? "center");
  const contentLeft = box.x + layout.padding;
  const contentWidth = Math.max(0, box.width - layout.padding * 2);
  const ascent = font.heightAtSize(layout.fontSize, { descender: false });
  layout.lines.forEach((line, index) => {
    if (!line) return;
    const center = {
      x: layout.center.x,
      y: layout.center.y + (index - (layout.lines.length - 1) / 2) * lineHeight,
    };
    if (isStamp) {
      drawTrackedCenteredText(
        page,
        viewport,
        line,
        center,
        layout.fontSize,
        font,
        textColor,
        opacity,
        layout.fontSize * 0.08,
      );
      return;
    }
    const lineWidth = font.widthOfTextAtSize(line, layout.fontSize);
    const x = contentLeft + textLineX(align, 0, contentWidth, lineWidth);
    const baselineY = center.y + ascent * 0.36;
    const textPoint = toPdfPoint(viewport, { x, y: baselineY });
    page.drawText(line, {
      x: textPoint.x,
      y: textPoint.y,
      size: layout.fontSize,
      font,
      color: textColor,
      opacity: clamp(opacity, 0, 1),
      rotate: degrees(pdfAngle(viewport, 0)),
    });
    if (item.textUnderline) {
      const underlineY = baselineY + layout.fontSize * TEXT_UNDERLINE_OFFSET;
      page.drawLine({
        start: toPdfPoint(viewport, { x, y: underlineY }),
        end: toPdfPoint(viewport, { x: x + lineWidth, y: underlineY }),
        thickness: Math.max(0.35, layout.fontSize * TEXT_UNDERLINE_WIDTH),
        color: textColor,
        opacity: clamp(opacity, 0, 1),
      });
    }
  });
}

function drawDelta(
  page: PDFPage,
  viewport: PageViewport,
  item: MarkupItem,
  fonts: ExportFonts,
  opacity: number,
  color: RGB,
  width: number,
): void {
  const layout = deltaLayout(item);
  const half = layout.size / 2;
  const tip = { x: layout.center.x, y: layout.center.y - half };
  const left = { x: layout.center.x - half, y: layout.center.y + half };
  const right = { x: layout.center.x + half, y: layout.center.y + half };
  const point = (value: Point) => {
    const pdf = toPdfPoint(viewport, value);
    return `${pdf.x} ${-pdf.y}`;
  };
  const path = `M ${point(tip)} L ${point(right)} L ${point(left)} Z`;
  page.drawSvgPath(path, {
    x: 0,
    y: 0,
    color,
    opacity: clamp(opacity * (item.opacity ?? 0.16), 0, 1),
    borderColor: color,
    borderWidth: Math.max(0.5, width),
    borderOpacity: opacity,
  });
  const textColor = item.textColor
    ? pdfColor(normalizeColor(item.textColor, resolveItemColor(item)))
    : color;
  if (item.text) {
    drawCenteredText(
      page,
      viewport,
      item.text,
      { x: layout.center.x, y: layout.center.y + layout.size * 0.12 },
      Math.max(4, (item.fontSize ?? 14) * 0.7),
      fonts.bold,
      textColor,
      opacity,
    );
  }
  if (item.label) {
    drawCenteredText(
      page,
      viewport,
      item.label,
      { x: layout.center.x, y: layout.center.y + layout.size * 0.62 },
      Math.max(3, (item.fontSize ?? 14) * 0.38),
      fonts.regular,
      textColor,
      opacity,
    );
  }
}
