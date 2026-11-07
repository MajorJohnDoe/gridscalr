import * as fontkit from "@pdf-lib/fontkit";
import { degrees, PDFDocument, type PDFPage } from "pdf-lib";
import type { PageViewport } from "pdfjs-dist";
import { clamp, itemRectCorners, pdfColor, pdfRectFromCorners } from "./export/geometry";
import { embedFonts } from "./export/fonts";
import { embedImages } from "./export/images";
import { drawAnnotationItem } from "./export/items/annotations";
import { drawCountItem } from "./export/items/counts";
import { drawLabel } from "./export/labels";
import { drawLegendPage } from "./export/legend";
import { drawMeasurementItem } from "./export/items/measurement";
import { drawSymbolItem } from "./export/items/symbols";
import { drawShapeItem } from "./export/items/shapes";
import { drawTextFamilyItem } from "./export/items/text";
import { normalizeCrop, normalizeExportPages } from "./export/options";
import { applyCrop, drawCalibrationLine } from "./export/page";
import type { ExportFonts, ExportImages } from "./export/types";
import { documentPageMaps } from "../model/documents";
import { isReferenceCalibration, pageCalibration } from "../model/calibration";
import type { DrawingExportOptions } from "../model/export";
import { imageOpacity } from "../model/images";
import { itemIsVisible, layerVisibleOnPage } from "../model/layers";
import type { LabelLayout } from "../model/labelLayout";
import { CALIBRATION_LABEL_ID, layoutPageLabels, pageLabelSources } from "../model/labelLayout";
import type { MarkupItem, Project } from "../model/types";
import { MIN_EXPORT_STROKE_WIDTH } from "../model/style";
import type { PdfRenderer } from "./pdfRenderer";
import { t } from "../i18n";
import { templateDocumentForPage } from "../features/schematics/model/sheetDocument";
import { resolveSheetLabels, sheetTemplateFor } from "../features/schematics/model/sheetTemplate";
import { drawSheetFields } from "../features/schematics/render/sheetPdf";

export { pdfCropBoxForViewport } from "./export/options";
export type { PdfCropBox } from "./export/options";

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
      drawCountItem(
        { page, viewport, project, fonts, labels, images },
        item,
        project,
        color,
        width,
        opacity,
      );
      break;
    case "symbol":
      drawSymbolItem({ page, viewport, project, fonts, labels, images }, item, opacity);
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
    case "cloud":
    case "callout":
    case "stamp":
    case "delta":
      drawAnnotationItem({ page, viewport, project, fonts, labels, images }, item, layerOpacity);
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
