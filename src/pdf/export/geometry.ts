import { LineCapStyle, rgb, type PDFPage, type RGB } from "pdf-lib";
import type { PageViewport } from "pdfjs-dist";
import type { cloudCurves } from "../../model/cloud";
import { midpoint, rotatePoint } from "../../model/geometry";
import type { MarkupItem, Point } from "../../model/types";
import type { PdfRect } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function toPdfPoint(viewport: PageViewport, point: Point): Point {
  const converted = viewport.convertToPdfPoint(point.x, point.y);
  return { x: converted[0], y: converted[1] };
}

export function pdfAngle(viewport: PageViewport, rotationDegrees: number): number {
  const radians = (rotationDegrees * Math.PI) / 180;
  const start = toPdfPoint(viewport, { x: 0, y: 0 });
  const end = toPdfPoint(viewport, { x: Math.cos(radians), y: Math.sin(radians) });
  return (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
}

export function svgPolygon(viewport: PageViewport, points: Point[]): string {
  const pdfPoints = points.map((point) => toPdfPoint(viewport, point));
  // drawSvgPath flips the SVG y-axis to PDF coordinates, so negate the PDF y
  // values here to keep area fills aligned with the separately drawn outline.
  return `${pdfPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${-point.y}`)
    .join(" ")} Z`;
}

export function pdfColor(hex: string): RGB {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((part) => part + part)
          .join("")
      : value;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int) || full.length !== 6) return rgb(0.93, 0.95, 0.96);
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

export function itemRectCorners(item: MarkupItem): Point[] {
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

export function pdfRectFromCorners(viewport: PageViewport, corners: Point[]): PdfRect {
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

export function roundedRectSvgPath(
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

export function drawPolyline(
  page: PDFPage,
  viewport: PageViewport,
  points: Point[],
  color: RGB,
  width: number,
  opacity: number,
  closed: boolean,
  lineCap: LineCapStyle = LineCapStyle.Round,
  dashArray?: number[],
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
      dashArray,
    });
  }
}

export function drawArrowHead(
  page: PDFPage,
  viewport: PageViewport,
  tip: Point,
  head: { wingA: Point; wingB: Point },
  color: RGB,
  opacity: number,
): void {
  const pdfTip = toPdfPoint(viewport, tip);
  const pdfA = toPdfPoint(viewport, head.wingA);
  const pdfB = toPdfPoint(viewport, head.wingB);
  // drawSvgPath flips the SVG y-axis, so negate the PDF y values.
  const path = `M ${pdfTip.x} ${-pdfTip.y} L ${pdfA.x} ${-pdfA.y} L ${pdfB.x} ${-pdfB.y} Z`;
  page.drawSvgPath(path, { x: 0, y: 0, color, opacity: clamp(opacity, 0, 1) });
}

export function cloudSvgPath(
  viewport: PageViewport,
  curves: ReturnType<typeof cloudCurves>,
): string {
  const point = (value: Point) => {
    const pdf = toPdfPoint(viewport, value);
    return `${pdf.x} ${-pdf.y}`;
  };
  const parts = [`M ${point(curves[0].start)}`];
  for (const curve of curves) {
    parts.push(`C ${point(curve.cp1)} ${point(curve.cp2)} ${point(curve.end)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}
