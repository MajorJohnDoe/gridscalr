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
import type { LabelLayout } from "../model/labelLayout";
import {
  CALIBRATION_LABEL_ID,
  layoutPageLabels,
  pageLabelSources,
} from "../model/labelLayout";
import { textItemLayout } from "../model/text";
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
    const labels = layoutPageLabels(pageLabelSources(project, pageNumber), {
      pageSize: { width: viewport.width, height: viewport.height },
      measure: (text, size, weight) =>
        (weight === "bold" ? fonts.bold : fonts.regular).widthOfTextAtSize(text, size),
    });

    for (const layer of project.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      for (const item of layer.items) {
        if (item.page !== pageNumber || item.visible === false) continue;
        drawItem(pdfPage, viewport, item, layer.opacity, fonts, labels);
      }
    }

    const calibrationLabel = labels.get(CALIBRATION_LABEL_ID);
    if (calibrationLabel) {
      drawLabel(pdfPage, viewport, calibrationLabel, 1, fonts);
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
  labels: Map<string, LabelLayout>,
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

  const label = labels.get(item.id);
  if (label) drawLabel(page, viewport, label, opacity, fonts);
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
    thickness: layout.metrics.leaderWidth,
    color: pdfColor(layout.color),
    opacity: clamp(opacity * 0.55, 0, 1),
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

function roundedRectSvgPath(
  viewport: PageViewport,
  box: { x: number; y: number; width: number; height: number },
  radius: number,
): string {
  const r = Math.max(0, Math.min(radius, box.width / 2, box.height / 2));
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const k = r * 0.5522847498;
  const point = (x: number, y: number) => {
    const pdfPoint = toPdfPoint(viewport, { x, y });
    return `${pdfPoint.x} ${-pdfPoint.y}`;
  };
  return [
    `M ${point(box.x + r, box.y)}`,
    `L ${point(right - r, box.y)}`,
    `C ${point(right - r + k, box.y)} ${point(right, box.y + r - k)} ${point(right, box.y + r)}`,
    `L ${point(right, bottom - r)}`,
    `C ${point(right, bottom - r + k)} ${point(right - r + k, bottom)} ${point(right - r, bottom)}`,
    `L ${point(box.x + r, bottom)}`,
    `C ${point(box.x + r - k, bottom)} ${point(box.x, bottom - r + k)} ${point(box.x, bottom - r)}`,
    `L ${point(box.x, box.y + r)}`,
    `C ${point(box.x, box.y + r - k)} ${point(box.x + r - k, box.y)} ${point(box.x + r, box.y)}`,
    "Z",
  ].join(" ");
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
