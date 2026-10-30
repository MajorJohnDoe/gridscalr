import * as fontkit from "@pdf-lib/fontkit";
import {
  appendBezierCurve,
  closePath,
  degrees,
  LineCapStyle,
  LineJoinStyle,
  lineTo,
  moveTo,
  PDFDocument,
  PDFOperator,
  PDFOperatorNames,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingColor,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import type { PageViewport } from "pdfjs-dist";
import regularFontUrl from "pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url";
import boldFontUrl from "pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?url";
import { countSymbol } from "../model/countSymbols";
import { countQuantityOf, countTypeGlyph } from "../features/countTypes/model";
import { areaShapeOf, rectangleCorners } from "../model/area";
import { cloudCurves, cloudRadiusForPoints } from "../model/cloud";
import {
  calloutLayout,
  cloudLabelLayout,
  closestPointOnBox,
  closestPointOnPolygon,
  deltaLayout,
  stampLayout,
  type TextBoxLayout,
} from "../model/annotations";
import { documentPageMaps } from "../model/documents";
import { isReferenceCalibration, pageCalibration } from "../model/calibration";
import {
  formatPageList,
  pageRectFromCrop,
  type DrawingExportOptions,
  type NormalizedCrop,
} from "../model/export";
import {
  angleArcPolyline,
  arcPolyline,
  arrowHeadGeometry,
  itemCenter,
  midpoint,
  radiusCircle,
  rotatePoint,
} from "../model/geometry";
import { imageOpacity } from "../model/images";
import { itemIsVisible, layerVisibleOnPage } from "../model/layers";
import type { LabelLayout } from "../model/labelLayout";
import { CALIBRATION_LABEL_ID, layoutPageLabels, pageLabelSources } from "../model/labelLayout";
import {
  TEXT_UNDERLINE_OFFSET,
  TEXT_UNDERLINE_WIDTH,
  textItemLayout,
  textLineX,
} from "../model/text";
import type { CountGlyph, CountType, ImageAsset, MarkupItem, Point, Project } from "../model/types";
import { MIN_EXPORT_STROKE_WIDTH } from "../model/style";
import {
  inspectionStatusColor,
  symbolCategoryColor,
  symbolFor,
  symbolRenderPlan,
  symbolSizeOf,
  type SymbolRenderShape,
} from "../model/symbols";
import { parseSymbolPath, transformSymbolCommands } from "../model/symbolPaths";
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
  options?: DrawingExportOptions,
): Promise<Uint8Array> {
  // Merge every source document into one working PDF so page numbers, crops and
  // labels keep referring to the same global page index as the canvas.
  const pdf = await PDFDocument.create();
  const pageMaps = documentPageMaps(project.documents);
  for (let index = 0; index < project.documents.length; index++) {
    const included = pageMaps[index] ?? [];
    if (!included.length) continue;
    const bytes = await renderer.getDocumentData(index);
    const source = await PDFDocument.load(bytes);
    const copied = await pdf.copyPages(
      source,
      included.map((page) => page - 1),
    );
    for (const page of copied) pdf.addPage(page);
  }
  pdf.registerFontkit(fontkit);
  const fonts = await embedFonts(pdf);

  const pages = pdf.getPages();
  const selectedPages = normalizeExportPages(options?.pages, pages.length);
  const selectedLayers = new Set(options?.layerIds ?? project.layers.map((layer) => layer.id));
  const includeLabels = options?.includeLabels !== false;
  const includeCalibration = options?.includeCalibration !== false;
  const includeLegend = options?.includeLegend === true;
  const crop = normalizeCrop(options?.crop);
  const images = await embedImages(pdf, project, selectedPages, selectedLayers);

  for (const pageNumber of selectedPages) {
    const pdfPage = pages[pageNumber - 1];
    const pdfjsPage = await renderer.getPage(pageNumber);
    const viewport = pdfjsPage.getViewport({ scale: 1 });
    const labels = layoutPageLabels(
      pageLabelSources(project, pageNumber, {
        layerIds: selectedLayers,
        includeLabels,
        includeCalibration,
      }),
      {
        pageSize: { width: viewport.width, height: viewport.height },
        measure: (text, size, weight) =>
          (weight === "bold" ? fonts.bold : fonts.regular).widthOfTextAtSize(text, size),
        labelSize: project.settings.labelSize,
      },
    );

    // Background images sit above the source page and below every markup.
    for (const layer of project.layers) {
      if (
        !layerVisibleOnPage(layer, pageNumber) ||
        layer.opacity <= 0 ||
        !selectedLayers.has(layer.id)
      )
        continue;
      for (const item of layer.items) {
        if (item.page !== pageNumber || !itemIsVisible(item, layer)) continue;
        if (item.kind !== "image" || item.image?.mode === "annotation") continue;
        drawItem(pdfPage, viewport, project, item, layer.opacity, fonts, labels, images);
      }
    }

    for (const layer of project.layers) {
      if (
        !layerVisibleOnPage(layer, pageNumber) ||
        layer.opacity <= 0 ||
        !selectedLayers.has(layer.id)
      )
        continue;
      for (const item of layer.items) {
        if (item.page !== pageNumber || !itemIsVisible(item, layer)) continue;
        if (item.kind === "image" && item.image?.mode !== "annotation") continue;
        drawItem(pdfPage, viewport, project, item, layer.opacity, fonts, labels, images);
      }
    }

    if (includeCalibration) {
      const calibration = pageCalibration(project, pageNumber);
      if (calibration && isReferenceCalibration(calibration)) {
        drawCalibrationLine(pdfPage, viewport, calibration.p1, calibration.p2);
        const calibrationLabel = labels.get(CALIBRATION_LABEL_ID);
        if (calibrationLabel) drawLabel(pdfPage, viewport, calibrationLabel, 1, fonts);
      }
    }

    if (crop) applyCrop(pdfPage, viewport, crop);
  }

  const keep = new Set(selectedPages);
  for (let index = pages.length - 1; index >= 0; index--) {
    if (!keep.has(index + 1)) pdf.removePage(index);
  }

  if (includeLegend) {
    drawLegendPage(pdf, fonts, project, selectedPages, selectedLayers);
  }

  return pdf.save();
}

function normalizeExportPages(pages: readonly number[] | undefined, pageCount: number): number[] {
  if (pageCount < 1) throw new Error("The source PDF has no pages.");
  if (!pages) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const selected = [
    ...new Set(
      pages
        .filter((page) => Number.isInteger(page) && page >= 1 && page <= pageCount)
        .map((page) => Math.round(page)),
    ),
  ].sort((a, b) => a - b);
  if (!selected.length) throw new Error("Select at least one page to export.");
  return selected;
}

function normalizeCrop(crop: NormalizedCrop | undefined): NormalizedCrop | undefined {
  if (!crop) return undefined;
  const values = [crop.x, crop.y, crop.width, crop.height];
  if (!values.every(Number.isFinite)) return undefined;
  const x = clamp(crop.x, 0, 1);
  const y = clamp(crop.y, 0, 1);
  const width = Math.min(clamp(crop.width, 0, 1), 1 - x);
  const height = Math.min(clamp(crop.height, 0, 1), 1 - y);
  if (width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

export interface PdfCropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Maps a relative view crop onto the page's PDF coordinate space, then clips it
 * against the existing CropBox so a source document can never reveal hidden
 * content. The viewport handles page rotation.
 */
export function pdfCropBoxForViewport(
  viewport: Pick<PageViewport, "width" | "height" | "rotation" | "convertToPdfPoint">,
  crop: NormalizedCrop,
  existingCrop: PdfCropBox,
): PdfCropBox {
  const rotationValue = Number.isFinite(viewport.rotation) ? viewport.rotation : 0;
  const rotation = ((rotationValue % 360) + 360) % 360;
  if (rotation % 90 !== 0) {
    throw new Error(
      "The page rotation is not a multiple of 90°, so the export area cannot be applied safely.",
    );
  }
  const rect = pageRectFromCrop(crop, {
    width: viewport.width,
    height: viewport.height,
  });
  const corners = [
    viewport.convertToPdfPoint(rect.x, rect.y),
    viewport.convertToPdfPoint(rect.x + rect.width, rect.y),
    viewport.convertToPdfPoint(rect.x, rect.y + rect.height),
    viewport.convertToPdfPoint(rect.x + rect.width, rect.y + rect.height),
  ];
  const xs = corners.map((point) => point[0]);
  const ys = corners.map((point) => point[1]);
  const box = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  const clipped = intersectBoxes(box, existingCrop);
  if (clipped.width < 1 || clipped.height < 1) {
    throw new Error(
      "The selected export area is too small or lies outside the page's visible area.",
    );
  }
  return clipped;
}

function applyCrop(page: PDFPage, viewport: PageViewport, crop: NormalizedCrop): void {
  const box = pdfCropBoxForViewport(viewport, crop, page.getCropBox());
  page.setCropBox(box.x, box.y, box.width, box.height);
  page.setMediaBox(box.x, box.y, box.width, box.height);
}

function intersectBoxes(first: PdfCropBox, second: PdfCropBox): PdfCropBox {
  const left = Math.max(first.x, second.x);
  const bottom = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const top = Math.min(first.y + first.height, second.y + second.height);
  return {
    x: left,
    y: bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, top - bottom),
  };
}

function drawCalibrationLine(page: PDFPage, viewport: PageViewport, p1: Point, p2: Point): void {
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

function drawLegendPage(
  pdf: PDFDocument,
  fonts: ExportFonts,
  project: Project,
  pages: readonly number[],
  selectedLayerIds: ReadonlySet<string>,
): void {
  const page = pdf.addPage([595.28, 841.89]);
  const margin = 48;
  const width = page.getWidth() - margin * 2;
  const ink = rgb(0.1, 0.13, 0.15);
  const muted = rgb(0.38, 0.45, 0.49);
  const rule = rgb(0.78, 0.82, 0.84);
  let y = page.getHeight() - margin;

  page.drawText("Drawing legend", {
    x: margin,
    y: y - 20,
    size: 22,
    font: fonts.bold,
    color: ink,
  });
  y -= 36;
  page.drawText(truncateText(fonts.regular, project.name, 10, width), {
    x: margin,
    y,
    size: 10,
    font: fonts.regular,
    color: muted,
  });
  y -= 14;
  page.drawText(
    `${pages.length === 1 ? "Page" : "Pages"} ${formatPageList(pages)} · only selected, visible content is included`,
    { x: margin, y, size: 9, font: fonts.regular, color: muted },
  );
  y -= 28;

  page.drawText("Layers", {
    x: margin,
    y,
    size: 12,
    font: fonts.bold,
    color: ink,
  });
  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: margin + width, y },
    thickness: 0.7,
    color: rule,
  });
  y -= 18;

  const layers = project.layers.filter(
    (layer) =>
      layer.opacity > 0 &&
      selectedLayerIds.has(layer.id) &&
      pages.some((page) => layerVisibleOnPage(layer, page)),
  );
  if (!layers.length) {
    page.drawText("No layers selected.", {
      x: margin,
      y,
      size: 10,
      font: fonts.regular,
      color: muted,
    });
    y -= 24;
  } else {
    for (const layer of layers) {
      page.drawRectangle({
        x: margin,
        y: y - 2,
        width: 11,
        height: 11,
        color: pdfColor(layer.color),
        opacity: clamp(layer.opacity, 0, 1),
        borderColor: rule,
        borderWidth: 0.5,
      });
      page.drawText(truncateText(fonts.bold, layer.name, 11, width - 120), {
        x: margin + 19,
        y,
        size: 11,
        font: fonts.bold,
        color: ink,
      });
      page.drawText(layer.kind === "measure" ? "Measurement layer" : "Drawing layer", {
        x: margin + width - 110,
        y,
        size: 9,
        font: fonts.regular,
        color: muted,
      });
      y -= 23;
    }
  }

  const counts = exportedCounts(project, pages, selectedLayerIds);
  if (counts.size) {
    y -= 14;
    page.drawText("Counted objects", {
      x: margin,
      y,
      size: 12,
      font: fonts.bold,
      color: ink,
    });
    y -= 8;
    page.drawLine({
      start: { x: margin, y },
      end: { x: margin + width, y },
      thickness: 0.7,
      color: rule,
    });
    y -= 18;
    for (const type of project.countTypes) {
      const total = counts.get(type.id) ?? 0;
      if (!total) continue;
      drawLegendCountGlyph(page, type.glyph, { x: margin + 6, y: y + 4 }, ink, 0.8);
      page.drawText(type.label, {
        x: margin + 20,
        y,
        size: 10.5,
        font: fonts.regular,
        color: ink,
      });
      page.drawText(`${total} pcs`, {
        x: margin + width - 80,
        y,
        size: 10.5,
        font: fonts.bold,
        color: ink,
      });
      y -= 20;
    }
  }
}

function exportedCounts(
  project: Project,
  pages: readonly number[],
  selectedLayerIds: ReadonlySet<string>,
): Map<CountType, number> {
  const pageSet = new Set(pages);
  const counts = new Map<CountType, number>();
  for (const layer of project.layers) {
    if (layer.opacity <= 0 || !selectedLayerIds.has(layer.id)) continue;
    for (const item of layer.items) {
      if (item.kind !== "count" || !itemIsVisible(item, layer) || !pageSet.has(item.page)) continue;
      const type = item.countType ?? "other";
      counts.set(type, (counts.get(type) ?? 0) + countQuantityOf(item));
    }
  }
  return counts;
}

function truncateText(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let value = text;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}…`, size) > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value}…`;
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

async function embedImages(
  pdf: PDFDocument,
  project: Project,
  pages: readonly number[],
  selectedLayers: ReadonlySet<string>,
): Promise<Map<string, PDFImage>> {
  const selectedPages = new Set(pages);
  const embedded = new Map<string, PDFImage>();
  const assets = new Map<string, ImageAsset>();
  for (const layer of project.layers) {
    if (!selectedLayers.has(layer.id)) continue;
    for (const item of layer.items) {
      if (item.kind !== "image" || !item.image || !itemIsVisible(item, layer)) continue;
      if (!selectedPages.has(item.page)) continue;
      const asset = project.assets[item.image.assetId];
      if (asset) assets.set(asset.id, asset);
    }
  }
  for (const asset of assets.values()) {
    if (!asset.data) continue;
    try {
      embedded.set(
        asset.id,
        asset.mime === "image/png"
          ? await pdf.embedPng(asset.data)
          : await pdf.embedJpg(asset.data),
      );
    } catch {
      // A corrupt image must not abort the rest of the drawing export.
    }
  }
  return embedded;
}

function drawItem(
  page: PDFPage,
  viewport: PageViewport,
  project: Project,
  item: MarkupItem,
  layerOpacity: number,
  fonts: ExportFonts,
  labels: Map<string, LabelLayout>,
  images: Map<string, PDFImage>,
): void {
  const color = pdfColor(item.color);
  const width = Math.max(MIN_EXPORT_STROKE_WIDTH, item.strokeWidth);
  const opacity = clamp(layerOpacity, 0, 1);

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
        item.lineStyle === "dashed" ? [Math.max(3, width * 3), Math.max(2, width * 2)] : undefined,
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
        item.lineStyle === "dashed" ? [Math.max(3, width * 3), Math.max(2, width * 2)] : undefined,
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
        item.lineStyle === "dashed" ? [Math.max(3, width * 3), Math.max(2, width * 2)] : undefined,
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
    case "count":
      drawCountSymbol(page, viewport, item, project, color, width, opacity);
      break;
    case "symbol":
      drawSymbolItem(page, viewport, item, opacity);
      break;
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
      drawPolyline(page, viewport, item.points.slice(0, 2), color, width, opacity, false);
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
      drawRectItem(page, viewport, item, layerOpacity);
      break;
    case "ellipse":
      if (item.points.length < 2) break;
      drawEllipseItem(page, viewport, item, layerOpacity);
      break;
    case "cloud": {
      const curves = cloudCurves(
        item.points,
        item.cloudRadius ?? cloudRadiusForPoints(item.points),
      );
      if (curves.length) {
        const path = cloudSvgPath(viewport, curves);
        page.drawSvgPath(path, {
          x: 0,
          y: 0,
          ...(item.fillColor
            ? {
                color: pdfColor(item.fillColor),
                opacity: clamp(opacity * (item.opacity ?? 0.12), 0, 1),
              }
            : {}),
          borderColor: color,
          borderWidth: width,
          borderOpacity: opacity,
        });
      }
      const label = cloudLabelLayout(item);
      if (label) {
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
        drawAnnotationPanel(page, viewport, label, item, fonts, opacity, "dark");
      }
      break;
    }
    case "callout": {
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
      drawAnnotationPanel(page, viewport, layout, item, fonts, opacity, "dark");
      break;
    }
    case "stamp":
      drawAnnotationPanel(page, viewport, stampLayout(item), item, fonts, opacity, "stamp");
      break;
    case "delta":
      drawDelta(page, viewport, item, fonts, opacity, color, width);
      break;
    case "text":
      drawTextItem(page, viewport, item, layerOpacity, fonts);
      break;
    case "image": {
      if (item.points.length < 2 || !item.image) break;
      const image = images.get(item.image.assetId);
      if (!image) break;
      const rect = pdfRectFromCorners(viewport, itemRectCorners(item));
      page.drawImage(image, {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        rotate: degrees(rect.angle),
        opacity: clamp(layerOpacity * imageOpacity(item), 0, 1),
      });
      break;
    }
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
  const font = item.textBold ? fonts.bold : fonts.regular;
  const align = item.textAlign ?? "left";
  const baseline = font.heightAtSize(layout.fontSize, { descender: false });
  const color = pdfColor(item.color);
  const opacity = clamp(layerOpacity, 0, 1);
  const lineWidths = layout.lines.map((line) => font.widthOfTextAtSize(line, layout.fontSize));
  // Align lines against the block width, matching the canvas layout.
  const blockWidth = Math.max(0, ...lineWidths);

  layout.lines.forEach((line, index) => {
    if (!line) return;
    const lineWidth = lineWidths[index];
    const offsetX = textLineX(align, 0, blockWidth, lineWidth);
    const baselineY = anchor.y + baseline + index * layout.lineHeight;
    const start = rotatePoint(
      {
        x: anchor.x + offsetX,
        y: baselineY,
      },
      center,
      rotation,
    );
    const pdfPoint = toPdfPoint(viewport, start);
    page.drawText(line, {
      x: pdfPoint.x,
      y: pdfPoint.y,
      size: layout.fontSize,
      font,
      color,
      opacity,
      rotate: degrees(angle),
    });
    if (item.textUnderline) {
      const underlineY = baselineY + layout.fontSize * TEXT_UNDERLINE_OFFSET;
      const from = rotatePoint({ x: anchor.x + offsetX, y: underlineY }, center, rotation);
      const to = rotatePoint(
        { x: anchor.x + offsetX + lineWidth, y: underlineY },
        center,
        rotation,
      );
      page.drawLine({
        start: toPdfPoint(viewport, from),
        end: toPdfPoint(viewport, to),
        thickness: Math.max(0.35, layout.fontSize * TEXT_UNDERLINE_WIDTH),
        color,
        opacity,
      });
    }
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

function drawCountSymbol(
  page: PDFPage,
  viewport: PageViewport,
  item: MarkupItem,
  project: Project,
  color: RGB,
  width: number,
  opacity: number,
): void {
  const anchor = item.points[0];
  if (!anchor) return;
  const symbol = countSymbol(countTypeGlyph(project, item.countType));
  for (const path of symbol.paths) {
    const points = path.points.map((point) => ({
      x: anchor.x + point.x,
      y: anchor.y + point.y,
    }));
    drawPolyline(page, viewport, points, color, width, opacity, path.closed);
  }
  for (const dot of symbol.dots) {
    const center = toPdfPoint(viewport, {
      x: anchor.x + dot.center.x,
      y: anchor.y + dot.center.y,
    });
    page.drawCircle({
      x: center.x,
      y: center.y,
      size: dot.radius,
      color,
      opacity: clamp(opacity, 0, 1),
    });
  }
}

function drawLegendCountGlyph(
  page: PDFPage,
  glyph: CountGlyph,
  anchor: Point,
  color: RGB,
  width: number,
): void {
  const symbol = countSymbol(glyph);
  for (const path of symbol.paths) {
    for (let index = 1; index < path.points.length; index += 1) {
      const previous = path.points[index - 1];
      const current = path.points[index];
      page.drawLine({
        start: { x: anchor.x + previous.x, y: anchor.y + previous.y },
        end: { x: anchor.x + current.x, y: anchor.y + current.y },
        thickness: width,
        color,
      });
    }
    if (path.closed && path.points.length > 1) {
      const first = path.points[0];
      const last = path.points[path.points.length - 1];
      page.drawLine({
        start: { x: anchor.x + last.x, y: anchor.y + last.y },
        end: { x: anchor.x + first.x, y: anchor.y + first.y },
        thickness: width,
        color,
      });
    }
  }
  for (const dot of symbol.dots) {
    page.drawCircle({
      x: anchor.x + dot.center.x,
      y: anchor.y + dot.center.y,
      size: dot.radius,
      color,
    });
  }
}

function symbolCommandsToPdfOps(
  shape: SymbolRenderShape,
  toPage: (point: Point) => Point,
  viewport: PageViewport,
): PDFOperator[] {
  // pdf-lib's drawSvgPath only fills with the non-zero rule and rotates around
  // the path origin. Symbol artwork needs even-odd holes and rotation around the
  // item anchor, so the shared parsed commands are emitted directly instead.
  const commands = transformSymbolCommands(parseSymbolPath(shape.d), (point) => {
    const scaled = {
      x: 32 + (point.x - 32) * shape.scale,
      y: 32 + (point.y - 32) * shape.scale,
    };
    return toPdfPoint(viewport, toPage(scaled));
  });
  const ops: PDFOperator[] = [];
  for (const command of commands) {
    switch (command.type) {
      case "M":
        ops.push(moveTo(command.x, command.y));
        break;
      case "L":
        ops.push(lineTo(command.x, command.y));
        break;
      case "C":
        ops.push(
          appendBezierCurve(command.x1, command.y1, command.x2, command.y2, command.x, command.y),
        );
        break;
      case "Z":
        ops.push(closePath());
        break;
    }
  }
  return ops;
}

function drawSymbolItem(
  page: PDFPage,
  viewport: PageViewport,
  item: MarkupItem,
  opacity: number,
): void {
  const anchor = item.points[0];
  if (!anchor) return;
  const definition = symbolFor(item.symbolId);
  const accentHex =
    definition.id === "unknown" ? item.color : symbolCategoryColor(definition.category);
  const rotation = item.rotation ?? 0;
  const plan = symbolRenderPlan(definition, accentHex);
  const scale = symbolSizeOf(item) / plan.viewBox;
  const half = plan.viewBox / 2;
  const toPage = (point: Point): Point =>
    rotatePoint(
      {
        x: anchor.x + (point.x - half) * scale,
        y: anchor.y + (point.y - half) * scale,
      },
      anchor,
      rotation,
    );
  const gsKey =
    opacity < 0.999
      ? page.node.newExtGState(
          "GS",
          page.doc.context.obj({ Type: "ExtGState", ca: opacity, CA: opacity }),
        )
      : undefined;
  const fillOpcode = (shape: SymbolRenderShape): PDFOperatorNames => {
    if (shape.fill && shape.stroke) {
      return shape.fillRule === "evenodd"
        ? PDFOperatorNames.FillEvenOddAndStroke
        : PDFOperatorNames.FillNonZeroAndStroke;
    }
    if (shape.fill) {
      return shape.fillRule === "evenodd"
        ? PDFOperatorNames.FillEvenOdd
        : PDFOperatorNames.FillNonZero;
    }
    return PDFOperatorNames.StrokePath;
  };
  for (const shape of plan.shapes) {
    const operators: PDFOperator[] = [pushGraphicsState()];
    if (gsKey) operators.push(setGraphicsState(gsKey));
    if (shape.fill) operators.push(setFillingColor(pdfColor(shape.fill)));
    if (shape.stroke) {
      operators.push(
        setStrokingColor(pdfColor(shape.stroke)),
        setLineWidth(Math.max(0.2, shape.strokeWidth * shape.scale * scale)),
        setLineCap(LineCapStyle.Round),
        setLineJoin(LineJoinStyle.Round),
      );
    }
    operators.push(...symbolCommandsToPdfOps(shape, toPage, viewport));
    operators.push(PDFOperator.of(fillOpcode(shape)), popGraphicsState());
    page.pushOperators(...operators);
  }
  if (item.status) {
    const marker = toPdfPoint(viewport, toPage(plan.badge));
    const size = plan.badge.r * scale;
    page.drawCircle({
      x: marker.x,
      y: marker.y,
      size: size + 1.4 * scale,
      color: rgb(0.059, 0.075, 0.082),
      opacity: clamp(opacity * 0.85, 0, 1),
    });
    page.drawCircle({
      x: marker.x,
      y: marker.y,
      size: size + 0.7 * scale,
      color: rgb(1, 1, 1),
      opacity: clamp(opacity, 0, 1),
    });
    page.drawCircle({
      x: marker.x,
      y: marker.y,
      size,
      color: pdfColor(inspectionStatusColor(item.status)),
      opacity: clamp(opacity, 0, 1),
    });
  }
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

function drawArrowHead(
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

function cloudSvgPath(viewport: PageViewport, curves: ReturnType<typeof cloudCurves>): string {
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
  const border = pdfColor(item.color);
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
  const textColor = item.textColor ? pdfColor(item.textColor) : style === "dark" ? INK : border;
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

function drawTrackedCenteredText(
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
  const textColor = item.textColor ? pdfColor(item.textColor) : color;
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

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
