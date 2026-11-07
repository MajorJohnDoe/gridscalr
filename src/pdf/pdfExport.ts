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
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import type { PageViewport } from "pdfjs-dist";
import {
  clamp,
  cloudSvgPath,
  drawArrowHead,
  drawPolyline,
  itemRectCorners,
  pdfAngle,
  pdfColor,
  pdfRectFromCorners,
  roundedRectSvgPath,
  toPdfPoint,
} from "./export/geometry";
import { embedFonts } from "./export/fonts";
import { embedImages } from "./export/images";
import { drawMeasurementItem } from "./export/items/measurement";
import { drawShapeItem } from "./export/items/shapes";
import { drawTextFamilyItem } from "./export/items/text";
import { normalizeCrop, normalizeExportPages } from "./export/options";
import { applyCrop, drawCalibrationLine } from "./export/page";
import type { ExportFonts, ExportImages } from "./export/types";
import { countSymbol } from "../model/countSymbols";
import { countQuantityOf, countTypeGlyph, countTypeLabel } from "../features/countTypes/model";
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
import { formatPageList, type DrawingExportOptions } from "../model/export";
import { arrowHeadGeometry, rotatePoint } from "../model/geometry";
import { imageOpacity } from "../model/images";
import { itemIsVisible, layerVisibleOnPage } from "../model/layers";
import type { LabelLayout } from "../model/labelLayout";
import { CALIBRATION_LABEL_ID, layoutPageLabels, pageLabelSources } from "../model/labelLayout";
import { TEXT_UNDERLINE_OFFSET, TEXT_UNDERLINE_WIDTH, textLineX } from "../model/text";
import type { CountGlyph, CountType, MarkupItem, Point, Project } from "../model/types";
import { MIN_EXPORT_STROKE_WIDTH } from "../model/style";
import {
  inspectionStatusColor,
  symbolCategoryColor,
  symbolFor,
  symbolRenderPlan,
  symbolShapeStrokeWidth,
  symbolSizeOf,
  type SymbolRenderShape,
} from "../features/schematics/symbols/registry";
import { parseSymbolPath, transformSymbolCommands } from "../model/symbolPaths";
import { SYMBOL_TAG_FONT_SIZE, symbolTagPosition } from "../model/symbolTag";
import type { PdfRenderer } from "./pdfRenderer";
import { t } from "../i18n";
import { templateDocumentForPage } from "../features/schematics/model/sheetDocument";
import { resolveSheetLabels, sheetTemplateFor } from "../features/schematics/model/sheetTemplate";
import { drawSheetFields } from "../features/schematics/render/sheetPdf";

export { pdfCropBoxForViewport } from "./export/options";
export type { PdfCropBox } from "./export/options";

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

    const sheetDocument = templateDocumentForPage(project, pageNumber);
    if (sheetDocument?.template) {
      const sheetSpec = sheetTemplateFor(
        sheetDocument.template.id,
        sheetDocument.template.paper,
        resolveSheetLabels((key) => t(key)),
      );
      if (sheetSpec) {
        drawSheetFields(pdfPage, sheetSpec, sheetDocument.template.fields, fonts);
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

  page.drawText(t("pdfExport.legend"), {
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
    page.drawText(t("pdfExport.noLayers"), {
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
      page.drawText(
        layer.kind === "measure" ? t("pdfExport.measurementLayer") : t("pdfExport.drawingLayer"),
        {
          x: margin + width - 110,
          y,
          size: 9,
          font: fonts.regular,
          color: muted,
        },
      );
      y -= 23;
    }
  }

  const counts = exportedCounts(project, pages, selectedLayerIds);
  if (counts.size) {
    y -= 14;
    page.drawText(t("pdfExport.countedObjects"), {
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
      page.drawText(countTypeLabel(project, type.id), {
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

function drawItem(
  page: PDFPage,
  viewport: PageViewport,
  project: Project,
  item: MarkupItem,
  layerOpacity: number,
  fonts: ExportFonts,
  labels: Map<string, LabelLayout>,
  images: ExportImages,
): void {
  const color = pdfColor(item.color);
  const width = Math.max(MIN_EXPORT_STROKE_WIDTH, item.strokeWidth);
  const opacity = clamp(layerOpacity, 0, 1);

  switch (item.kind) {
    case "length":
    case "angle":
    case "slope":
    case "radius":
    case "diameter":
    case "arc":
    case "area":
    case "volume":
      drawMeasurementItem({ page, viewport, project, fonts, labels, images }, item, layerOpacity);
      break;
    case "count":
      drawCountSymbol(page, viewport, item, project, color, width, opacity);
      break;
    case "symbol":
      drawSymbolItem(page, viewport, item, opacity, fonts);
      break;
    case "pen":
    case "highlight":
    case "line":
    case "arrow":
    case "rect":
    case "ellipse":
    case "polyline":
    case "rail":
      drawShapeItem({ page, viewport, project, fonts, labels, images }, item, layerOpacity);
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
    case "textbox":
      drawTextFamilyItem({ page, viewport, project, fonts, labels, images }, item, layerOpacity);
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
  fonts: ExportFonts,
): void {
  const anchor = item.points[0];
  if (!anchor) return;
  const definition = symbolFor(item.symbolId);
  const accentHex =
    definition.style === "schematic"
      ? "#111111"
      : definition.id === "unknown"
        ? item.color
        : symbolCategoryColor(definition.category);
  const rotation = item.rotation ?? 0;
  const plan = symbolRenderPlan(definition, accentHex);
  const size = symbolSizeOf(item);
  const scale = size / plan.viewBox;
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
        setLineWidth(Math.max(0.2, symbolShapeStrokeWidth(plan, shape, size))),
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
  if (item.tag) {
    const tagPosition = symbolTagPosition(item);
    if (tagPosition) {
      const rotated = rotation === 0 ? tagPosition : rotatePoint(tagPosition, anchor, rotation);
      const point = toPdfPoint(viewport, rotated);
      page.drawText(item.tag, {
        x: point.x,
        y: point.y - SYMBOL_TAG_FONT_SIZE,
        size: SYMBOL_TAG_FONT_SIZE,
        font: fonts.regular,
        color: rgb(0.067, 0.075, 0.082),
        opacity: clamp(opacity, 0, 1),
      });
    }
  }
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
