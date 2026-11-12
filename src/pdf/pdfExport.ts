import * as fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { embedFonts } from "./export/fonts";
import { embedImages } from "./export/images";
import { drawLegendPage } from "./export/legend";
import { createOptionalContent } from "./export/ocg";
import { optionalContentTree } from "./export/ocgTree";
import { normalizeCrop, normalizeExportPages } from "./export/options";
import { applyCrop } from "./export/page";
import { drawPageContent } from "./export/content";
import { pageIdAt } from "../model/pages";
import type { DrawingExportOptions } from "../model/export";
import { layoutPageLabels, pageLabelSources } from "../model/labelLayout";
import type { Project } from "../model/types";
import type { PdfRenderer } from "./pdfRenderer";

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
    ? createOptionalContent(pdf, optionalContentTree(project, selectedLayers, selectedPages))
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
    drawPageContent({
      page: pdfPage,
      pageNumber,
      viewport,
      project,
      pageId,
      layerIds: selectedLayers,
      fonts,
      labels,
      images,
      includeCalibration,
      includeAnnotations: options?.includeAnnotations === true,
      ocg,
    });
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
