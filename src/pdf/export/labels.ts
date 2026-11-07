import { degrees, LineCapStyle, rgb, type PDFPage, type PDFFont, type RGB } from "pdf-lib";
import type { PageViewport } from "pdfjs-dist";
import type { LabelLayout } from "../../model/labelLayout";
import type { Point } from "../../model/types";
import { clamp, pdfAngle, pdfColor, roundedRectSvgPath, toPdfPoint } from "./geometry";
import type { ExportFonts } from "./types";

export const INK = rgb(0.933, 0.953, 0.961);
export const LABEL_BG = rgb(0.047, 0.063, 0.071);

export function drawLabel(
  page: PDFPage,
  viewport: PageViewport,
  layout: LabelLayout,
  opacity: number,
  fonts: ExportFonts,
): void {
  const centerX = layout.box.x + layout.box.width / 2;
  drawLeader(page, viewport, layout, opacity);
  drawLabelBackground(page, viewport, layout, opacity);

  drawCenteredText(
    page,
    viewport,
    layout.text,
    { x: centerX, y: layout.box.primaryCenterY },
    layout.metrics.primarySize,
    fonts.bold,
    INK,
    opacity,
  );
  if (layout.secondary) {
    drawCenteredText(
      page,
      viewport,
      layout.secondary,
      { x: centerX, y: layout.box.secondaryCenterY ?? layout.box.primaryCenterY },
      layout.metrics.secondarySize,
      fonts.regular,
      rgb(0.824, 0.871, 0.89),
      opacity * 0.68,
    );
  }
}

function drawLeader(
  page: PDFPage,
  viewport: PageViewport,
  layout: LabelLayout,
  opacity: number,
): void {
  if (!layout.leader) return;
  page.drawLine({
    start: toPdfPoint(viewport, layout.leader.from),
    end: toPdfPoint(viewport, layout.leader.to),
    thickness: Math.max(0.6, layout.metrics.leaderWidth),
    color: pdfColor(layout.color),
    opacity: clamp(opacity * 0.82, 0, 1),
    lineCap: LineCapStyle.Round,
  });
}

function drawLabelBackground(
  page: PDFPage,
  viewport: PageViewport,
  layout: LabelLayout,
  opacity: number,
): void {
  const path = roundedRectSvgPath(viewport, layout.box, layout.metrics.radius);
  page.drawSvgPath(path, {
    x: 0,
    y: 0,
    color: LABEL_BG,
    opacity: opacity * 0.82,
    borderColor: pdfColor(layout.color),
    borderWidth: layout.metrics.borderWidth,
    borderOpacity: opacity * 0.5,
  });
}

export function drawCenteredText(
  page: PDFPage,
  viewport: PageViewport,
  text: string,
  center: Point,
  size: number,
  font: PDFFont,
  color: RGB,
  opacity: number,
): void {
  const width = font.widthOfTextAtSize(text, size);
  const baseline = font.heightAtSize(size, { descender: false });
  const start = {
    x: center.x - width / 2,
    y: center.y + baseline * 0.36,
  };
  const pdfPoint = toPdfPoint(viewport, start);
  page.drawText(text, {
    x: pdfPoint.x,
    y: pdfPoint.y,
    size,
    font,
    color,
    opacity: clamp(opacity, 0, 1),
    rotate: degrees(pdfAngle(viewport, 0)),
  });
}

export function drawTrackedCenteredText(
  page: PDFPage,
  viewport: PageViewport,
  text: string,
  center: Point,
  size: number,
  font: PDFFont,
  color: RGB,
  opacity: number,
  tracking: number,
): void {
  const characters = [...text];
  const widths = characters.map((character) => font.widthOfTextAtSize(character, size));
  const total =
    widths.reduce((sum, width) => sum + width, 0) + tracking * Math.max(0, characters.length - 1);
  const baseline = font.heightAtSize(size, { descender: false });
  let x = center.x - total / 2;
  for (let index = 0; index < characters.length; index += 1) {
    const point = toPdfPoint(viewport, { x, y: center.y + baseline * 0.36 });
    page.drawText(characters[index], {
      x: point.x,
      y: point.y,
      size,
      font,
      color,
      opacity: clamp(opacity, 0, 1),
      rotate: degrees(pdfAngle(viewport, 0)),
    });
    x += widths[index] + tracking;
  }
}
