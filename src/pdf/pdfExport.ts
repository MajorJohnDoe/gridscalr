import * as fontkit from "@pdf-lib/fontkit";
import {
  degrees,
  LineCapStyle,
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import type { PageViewport } from "pdfjs-dist";
import regularFontUrl from "pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url";
import boldFontUrl from "pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?url";
import { itemCenter, midpoint, rotatePoint } from "../model/geometry";
import {
  labelAnchorForPoints,
  labelBox,
  LABEL_PRIMARY_SIZE,
  LABEL_SECONDARY_SIZE,
  measurementLabelParts,
} from "../model/label";
import { textItemLayout } from "../model/text";
import { formatNumber } from "../model/units";
import type { MarkupItem, Point, Project } from "../model/types";
import type { PdfRenderer } from "./pdfRenderer";

interface ExportFonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

const INK = rgb(0.933, 0.953, 0.961);
const LABEL_BG = rgb(0.047, 0.063, 0.071);

export async function exportProjectPdf(
  project: Project,
  renderer: PdfRenderer,
): Promise<Uint8Array> {
  const source = await renderer.document.getData();
  const pdf = await PDFDocument.load(source);
  pdf.registerFontkit(fontkit);
  const fonts = await embedFonts(pdf);

  const pages = pdf.getPages();
  for (let index = 0; index < pages.length; index++) {
    const pageNumber = index + 1;
    const pdfPage = pages[index];
    const pdfjsPage = await renderer.getPage(pageNumber);
    const viewport = pdfjsPage.getViewport({ scale: 1 });

    for (const layer of project.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      for (const item of layer.items) {
        if (item.page !== pageNumber || item.visible === false) continue;
        drawItem(pdfPage, viewport, item, layer.opacity, fonts, project);
      }
    }

    if (project.settings.showCalibration) {
      const calibration = project.pages[String(pageNumber)]?.calibration;
      if (calibration) {
        drawCalibrationLabel(pdfPage, viewport, calibration, fonts);
      }
    }
  }

  return pdf.save();
}

async function embedFonts(pdf: PDFDocument): Promise<ExportFonts> {
  try {
    const [regular, bold] = await Promise.all([
      fetch(regularFontUrl).then((response) => {
        if (!response.ok) throw new Error("Regular export font is unavailable.");
        return response.arrayBuffer();
      }),
      fetch(boldFontUrl).then((response) => {
        if (!response.ok) throw new Error("Bold export font is unavailable.");
        return response.arrayBuffer();
      }),
    ]);
    return {
      regular: await pdf.embedFont(new Uint8Array(regular), { subset: true }),
      bold: await pdf.embedFont(new Uint8Array(bold), { subset: true }),
    };
  } catch {
    return {
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    };
  }
}

function drawItem(
  page: PDFPage,
  viewport: PageViewport,
  item: MarkupItem,
  layerOpacity: number,
  fonts: ExportFonts,
  project: Project,
): void {
  const color = pdfColor(item.color);
  const width = Math.max(0.35, item.strokeWidth);
  const opacity = clamp(layerOpacity, 0, 1);

  switch (item.kind) {
    case "length":
      drawPolyline(page, viewport, item.points, color, width, opacity, false);
      drawEndpoints(page, viewport, item.points, color, opacity);
      break;
    case "area": {
      const path = svgPolygon(viewport, item.points);
      page.drawSvgPath(path, { x: 0, y: 0, color, opacity: opacity * 0.14 });
      drawPolyline(page, viewport, item.points, color, width, opacity, true);
      drawEndpoints(page, viewport, item.points, color, opacity);
      break;
    }
    case "pen":
      drawPolyline(page, viewport, item.points, color, width, opacity, false);
      break;
    case "highlight":
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
      break;
    case "line":
      if (item.points.length < 2) break;
      drawPolyline(page, viewport, item.points.slice(0, 2), color, width, opacity, false);
      drawEndpoints(page, viewport, item.points.slice(0, 2), color, opacity);
      break;
    case "arrow":
      if (item.points.length < 2) break;
      drawPolyline(page, viewport, item.points.slice(0, 2), color, width, opacity, false);
      drawArrowHead(page, viewport, item.points[0], item.points[1], color, width, opacity);
      break;
    case "rect":
      if (item.points.length < 2) break;
      drawRectItem(page, viewport, item, layerOpacity);
      break;
    case "ellipse":
      if (item.points.length < 2) break;
      drawEllipseItem(page, viewport, item, layerOpacity);
      break;
    case "text":
      drawTextItem(page, viewport, item, layerOpacity, fonts);
      break;
  }

  if (item.kind === "length" || item.kind === "area") {
    const parts = measurementLabelParts(item, project);
    if (parts) drawLabel(page, viewport, item, parts.text, parts.secondary, opacity, fonts);
  }
}

function drawTextItem(
  page: PDFPage,
  viewport: PageViewport,
  item: MarkupItem,
  layerOpacity: number,
  fonts: ExportFonts,
): void {
  const layout = textItemLayout(item);
  const anchor = item.points[0];
  if (!anchor || !item.text) return;
  const rotation = item.rotation ?? 0;
  const center = itemCenter(item);
  const angle = pdfAngle(viewport, rotation);
  const baseline = fonts.regular.heightAtSize(layout.fontSize, { descender: false });
  const color = pdfColor(item.color);

  layout.lines.forEach((line, index) => {
    if (!line) return;
    const start = rotatePoint(
      {
        x: anchor.x,
        y: anchor.y + baseline + index * layout.lineHeight,
      },
      center,
      rotation,
    );
    const pdfPoint = toPdfPoint(viewport, start);
    page.drawText(line, {
      x: pdfPoint.x,
      y: pdfPoint.y,
      size: layout.fontSize,
      font: fonts.regular,
      color,
      opacity: clamp(layerOpacity, 0, 1),
      rotate: degrees(angle),
    });
  });
}

function drawRectItem(
  page: PDFPage,
  viewport: PageViewport,
  item: MarkupItem,
  layerOpacity: number,
): void {
  const corners = itemRectCorners(item);
  const rect = pdfRectFromCorners(viewport, corners);
  const color = pdfColor(item.color);
  const fill = item.fillColor ? pdfColor(item.fillColor) : undefined;
  const opacity = clamp(layerOpacity, 0, 1);
  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    rotate: degrees(rect.angle),
    color: fill,
    opacity: fill ? opacity * (item.opacity ?? 0.15) : undefined,
    borderColor: color,
    borderWidth: Math.max(0.35, item.strokeWidth),
    borderOpacity: opacity,
  });
}

function drawEllipseItem(
  page: PDFPage,
  viewport: PageViewport,
  item: MarkupItem,
  layerOpacity: number,
): void {
  const corners = itemRectCorners(item);
  const center = midpoint(corners[0], corners[2]);
  const centerPdf = toPdfPoint(viewport, center);
  const rect = pdfRectFromCorners(viewport, corners);
  const color = pdfColor(item.color);
  const fill = item.fillColor ? pdfColor(item.fillColor) : undefined;
  const opacity = clamp(layerOpacity, 0, 1);
  page.drawEllipse({
    x: centerPdf.x,
    y: centerPdf.y,
    xScale: Math.max(0.1, rect.width / 2),
    yScale: Math.max(0.1, rect.height / 2),
    rotate: degrees(rect.angle),
    color: fill,
    opacity: fill ? opacity * (item.opacity ?? 0.15) : undefined,
    borderColor: color,
    borderWidth: Math.max(0.35, item.strokeWidth),
    borderOpacity: opacity,
  });
}

function drawLabel(
  page: PDFPage,
  viewport: PageViewport,
  item: MarkupItem,
  text: string,
  secondary: string | undefined,
  opacity: number,
  fonts: ExportFonts,
): void {
  const anchor = labelAnchorForPoints(item, item.points);
  const primaryWidth = fonts.bold.widthOfTextAtSize(text, LABEL_PRIMARY_SIZE);
  const secondaryWidth = secondary
    ? fonts.regular.widthOfTextAtSize(secondary, LABEL_SECONDARY_SIZE)
    : 0;
  const box = labelBox(anchor, primaryWidth, secondaryWidth, secondary);
  drawLabelBackground(page, viewport, box, item.color, opacity);

  drawCenteredText(
    page,
    viewport,
    text,
    { x: anchor.x, y: box.primaryY },
    LABEL_PRIMARY_SIZE,
    fonts.bold,
    INK,
    opacity,
  );
  if (secondary) {
    drawCenteredText(
      page,
      viewport,
      secondary,
      { x: anchor.x, y: box.secondaryY ?? box.y + 24 },
      LABEL_SECONDARY_SIZE,
      fonts.regular,
      rgb(0.824, 0.871, 0.89),
      opacity * 0.72,
    );
  }
}

function drawCalibrationLabel(
  page: PDFPage,
  viewport: PageViewport,
  calibration: { p1: Point; p2: Point; knownLength: number; unit: string },
  fonts: ExportFonts,
): void {
  const mid = midpoint(calibration.p1, calibration.p2);
  const anchor = { x: mid.x, y: mid.y - 16 };
  const text = `${formatNumber(calibration.knownLength, 2)} ${calibration.unit} reference`;
  const width = fonts.bold.widthOfTextAtSize(text, LABEL_PRIMARY_SIZE);
  const box = labelBox(anchor, width, 0);
  drawLabelBackground(page, viewport, box, "#a78bfa", 1);
  drawCenteredText(
    page,
    viewport,
    text,
    { x: anchor.x, y: box.primaryY },
    LABEL_PRIMARY_SIZE,
    fonts.bold,
    INK,
    1,
  );
}

function drawLabelBackground(
  page: PDFPage,
  viewport: PageViewport,
  box: ReturnType<typeof labelBox>,
  color: string,
  opacity: number,
): void {
  const rect = pdfRectFromCorners(viewport, [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ]);
  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    rotate: degrees(rect.angle),
    color: LABEL_BG,
    opacity: opacity * 0.88,
    borderColor: pdfColor(color),
    borderWidth: 1,
    borderOpacity: opacity * 0.6,
  });
}

function drawCenteredText(
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

function drawPolyline(
  page: PDFPage,
  viewport: PageViewport,
  points: Point[],
  color: RGB,
  width: number,
  opacity: number,
  closed: boolean,
  lineCap: LineCapStyle = LineCapStyle.Round,
): void {
  if (points.length < 2) return;
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index++) {
    const start = toPdfPoint(viewport, points[index]);
    const endPoint = points[(index + 1) % points.length];
    const end = toPdfPoint(viewport, endPoint);
    page.drawLine({
      start,
      end,
      thickness: width,
      color,
      opacity: clamp(opacity, 0, 1),
      lineCap,
    });
  }
}

function drawEndpoints(
  page: PDFPage,
  viewport: PageViewport,
  points: Point[],
  color: RGB,
  opacity: number,
): void {
  if (points.length > 26) return;
  for (const point of points) {
    page.drawCircle({
      x: toPdfPoint(viewport, point).x,
      y: toPdfPoint(viewport, point).y,
      size: 2.2,
      color: rgb(0.063, 0.082, 0.094),
      borderColor: color,
      borderWidth: 1,
      borderOpacity: clamp(opacity, 0, 1),
      opacity: clamp(opacity, 0, 1),
    });
  }
}

function drawArrowHead(
  page: PDFPage,
  viewport: PageViewport,
  start: Point,
  end: Point,
  color: RGB,
  width: number,
  opacity: number,
): void {
  const size = Math.max(8, width * 3.6);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const wingA = {
    x: end.x - size * Math.cos(angle - Math.PI / 7),
    y: end.y - size * Math.sin(angle - Math.PI / 7),
  };
  const wingB = {
    x: end.x - size * Math.cos(angle + Math.PI / 7),
    y: end.y - size * Math.sin(angle + Math.PI / 7),
  };
  for (const wing of [wingA, wingB]) {
    page.drawLine({
      start: toPdfPoint(viewport, end),
      end: toPdfPoint(viewport, wing),
      thickness: width,
      color,
      opacity: clamp(opacity, 0, 1),
      lineCap: LineCapStyle.Round,
    });
  }
}

function itemRectCorners(item: MarkupItem): Point[] {
  const a = item.points[0];
  const b = item.points[1] ?? item.points[0];
  const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  const center = midpoint(min, max);
  const rotation = item.rotation ?? 0;
  return [
    rotatePoint(min, center, rotation),
    rotatePoint({ x: max.x, y: min.y }, center, rotation),
    rotatePoint(max, center, rotation),
    rotatePoint({ x: min.x, y: max.y }, center, rotation),
  ];
}

function pdfRectFromCorners(viewport: PageViewport, corners: Point[]): PdfRect {
  const pdfCorners = corners.map((point) => toPdfPoint(viewport, point));
  const widthA = subtract(pdfCorners[1], pdfCorners[0]);
  const heightA = subtract(pdfCorners[3], pdfCorners[0]);
  const cross = widthA.x * heightA.y - widthA.y * heightA.x;
  let anchor = pdfCorners[0];
  let widthVector = widthA;
  let heightVector = heightA;
  if (cross <= 0) {
    anchor = pdfCorners[3];
    widthVector = subtract(pdfCorners[2], pdfCorners[3]);
    heightVector = subtract(pdfCorners[0], pdfCorners[3]);
  }
  return {
    x: anchor.x,
    y: anchor.y,
    width: Math.max(0.1, Math.hypot(widthVector.x, widthVector.y)),
    height: Math.max(0.1, Math.hypot(heightVector.x, heightVector.y)),
    angle: (Math.atan2(widthVector.y, widthVector.x) * 180) / Math.PI,
  };
}

function toPdfPoint(viewport: PageViewport, point: Point): Point {
  const converted = viewport.convertToPdfPoint(point.x, point.y);
  return { x: converted[0], y: converted[1] };
}

function pdfAngle(viewport: PageViewport, rotationDegrees: number): number {
  const radians = (rotationDegrees * Math.PI) / 180;
  const start = toPdfPoint(viewport, { x: 0, y: 0 });
  const end = toPdfPoint(viewport, { x: Math.cos(radians), y: Math.sin(radians) });
  return (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
}

function svgPolygon(viewport: PageViewport, points: Point[]): string {
  const pdfPoints = points.map((point) => toPdfPoint(viewport, point));
  // drawSvgPath flips the SVG y-axis to PDF coordinates, so negate the PDF y
  // values here to keep area fills aligned with the separately drawn outline.
  return `${pdfPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${-point.y}`)
    .join(" ")} Z`;
}

function pdfColor(hex: string): RGB {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int) || full.length !== 6) return rgb(0.93, 0.95, 0.96);
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
