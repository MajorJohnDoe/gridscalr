import { LineCapStyle, rgb, type PDFPage } from "pdf-lib";
import type { PageViewport } from "pdfjs-dist";
import type { NormalizedCrop } from "../../model/export";
import type { Point } from "../../model/types";
import { pdfColor, toPdfPoint } from "./geometry";
import { pdfCropBoxForViewport } from "./options";

export function applyCrop(page: PDFPage, viewport: PageViewport, crop: NormalizedCrop): void {
  const box = pdfCropBoxForViewport(viewport, crop, page.getCropBox());
  page.setCropBox(box.x, box.y, box.width, box.height);
  page.setMediaBox(box.x, box.y, box.width, box.height);
}

export function drawCalibrationLine(
  page: PDFPage,
  viewport: PageViewport,
  p1: Point,
  p2: Point,
): void {
  const color = pdfColor("#a78bfa");
  const start = toPdfPoint(viewport, p1);
  const end = toPdfPoint(viewport, p2);
  page.drawLine({
    start,
    end,
    thickness: 1.5,
    color,
    opacity: 1,
    dashArray: [6, 4],
    lineCap: LineCapStyle.Round,
  });
  for (const point of [start, end]) {
    page.drawCircle({
      x: point.x,
      y: point.y,
      size: 4.5,
      color: rgb(0.102, 0.125, 0.141),
      borderColor: color,
      borderWidth: 1,
    });
  }
}
