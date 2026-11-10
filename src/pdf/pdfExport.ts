import * as fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFPage } from "pdf-lib";
import { embedFonts } from "./export/fonts";
import { embedImages } from "./export/images";
import { drawItem } from "./export/items/dispatch";
import { drawLabel } from "./export/labels";
import { drawLegendPage } from "./export/legend";
import { createOptionalContent, type OptionalContentWriter } from "./export/ocg";
import { normalizeCrop, normalizeExportPages } from "./export/options";
import { applyCrop, drawCalibrationLine } from "./export/page";
import { pageIdAt } from "../model/pages";
import { isReferenceCalibration, pageCalibration } from "../model/calibration";
import type { DrawingExportOptions } from "../model/export";
import { itemIsVisible, layerVisibleOnPage } from "../model/layers";
import { CALIBRATION_LABEL_ID, layoutPageLabels, pageLabelSources } from "../model/labelLayout";
import type { Project } from "../model/types";
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
  const sources = await Promise.all(
    project.documents.map(async (_, index) => {
      try {
        return await PDFDocument.load(await renderer.getDocumentData(index));
      } catch {
        return null;
      }
    }),
  );
  const documentIndices = new Map(project.documents.map((document, index) => [document.id, index]));
  for (const record of project.pages) {
    const source = sources[documentIndices.get(record.documentId) ?? -1];
    if (!source || record.localPage < 1 || record.localPage > source.getPageCount()) continue;
    const [copied] = await pdf.copyPages(source, [record.localPage - 1]);
    pdf.addPage(copied);
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
  const ocg = options?.includeOcg
    ? createOptionalContent(
        pdf,
        project.layers.filter(
          (layer) =>
            selectedLayers.has(layer.id) &&
            layer.opacity > 0 &&
            selectedPages.some((pageNumber) => {
              const pageId = pageIdAt(project, pageNumber);
              return pageId ? layerVisibleOnPage(layer, pageId) : false;
            }),
        ),
      )
    : null;

  for (const pageNumber of selectedPages) {
    const pdfPage = pages[pageNumber - 1];
    const pageId = pageIdAt(project, pageNumber);
    if (!pdfPage || !pageId) continue;
    const pdfjsPage = await renderer.getPage(pageNumber);
    const viewport = pdfjsPage.getViewport({ scale: 1 });
    const labels = layoutPageLabels(
      pageLabelSources(project, pageId, {
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
      if (!layerVisibleOnPage(layer, pageId) || layer.opacity <= 0 || !selectedLayers.has(layer.id))
        continue;
      drawLayer(
        pdfPage,
        () => {
          for (const item of layer.items) {
            if (item.pageId !== pageId || !itemIsVisible(item, layer)) continue;
            if (item.kind !== "image" || item.image?.mode === "annotation") continue;
            drawItem(pdfPage, viewport, project, item, layer.opacity, fonts, labels, images);
          }
        },
        layer.id,
        ocg,
      );
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
      if (!layerVisibleOnPage(layer, pageId) || layer.opacity <= 0 || !selectedLayers.has(layer.id))
        continue;
      drawLayer(
        pdfPage,
        () => {
          for (const item of layer.items) {
            if (item.pageId !== pageId || !itemIsVisible(item, layer)) continue;
            if (item.kind === "image" && item.image?.mode !== "annotation") continue;
            drawItem(pdfPage, viewport, project, item, layer.opacity, fonts, labels, images);
          }
        },
        layer.id,
        ocg,
      );
    }

    if (includeCalibration) {
      const calibration = pageCalibration(project, pageId);
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

  ocg?.finalize();
  return pdf.save();
}

/** Runs one layer's drawing inside an OCG marked-content sequence when enabled. */
function drawLayer(
  page: PDFPage,
  draw: () => void,
  layerId: string,
  ocg: OptionalContentWriter | null,
): void {
  const marked = ocg?.begin(page, layerId) ?? false;
  draw();
  if (marked) ocg?.end(page);
}
