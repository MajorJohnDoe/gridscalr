import type { PDFPage } from "pdf-lib";
import type { PageViewport } from "pdfjs-dist";
import { isReferenceCalibration, pageCalibration } from "../../model/calibration";
import { CALIBRATION_LABEL_ID, type LabelLayout } from "../../model/labelLayout";
import { itemIsVisible, layerVisibleOnPage } from "../../model/layers";
import { buildLayerHierarchy } from "../../model/layerHierarchy";
import type { Layer, MarkupItem, PageId, Project } from "../../model/types";
import { t } from "../../i18n";
import {
  drawSheetFields,
  resolveSheetLabels,
  sheetTemplateFor,
  templateDocumentForPage,
} from "../../features/schematics";
import { addReviewAnnotation } from "./annotations";
import { drawItem } from "./items/dispatch";
import { drawLabel } from "./labels";
import type { OptionalContentWriter } from "./ocg";
import { drawCalibrationLine } from "./page";
import type { ExportFonts, ExportImages } from "./types";

export interface PageContentOptions {
  page: PDFPage;
  /** 1-based display page number used by the sheet templates. */
  pageNumber: number;
  viewport: PageViewport;
  project: Project;
  pageId: PageId;
  layerIds: ReadonlySet<string>;
  fonts: ExportFonts;
  labels: Map<string, LabelLayout>;
  images: ExportImages;
  includeCalibration: boolean;
  includeAnnotations: boolean;
  ocg: OptionalContentWriter | null;
}

/** Draws one exported page's layers, sheet fields and calibration line. */
export function drawPageContent(options: PageContentOptions): void {
  const { page, pageNumber, viewport, project, pageId, layerIds, fonts, labels, images, ocg } =
    options;
  const hierarchy = buildLayerHierarchy(project.layers);

  const drawLayer = (layer: Layer, background: boolean): void => {
    const drawable: MarkupItem[] = [];
    for (const item of layer.items) {
      if (item.pageId !== pageId || !itemIsVisible(item, layer, hierarchy)) continue;
      if (background) {
        if (item.kind !== "image" || item.image?.mode === "annotation") continue;
      } else if (item.kind === "image" && item.image?.mode !== "annotation") {
        continue;
      }
      drawable.push(item);
    }
    // An empty layer gets no optional-content group, so a reader never shows a
    // folder that contains nothing. See ADR 0014.
    if (!drawable.length) return;
    const marked = ocg?.begin(page, layer.id) ?? false;
    for (const item of drawable) {
      drawItem(page, viewport, project, item, layer.opacity, fonts, labels, images);
      if (options.includeAnnotations) addReviewAnnotation(page, viewport, project, item);
    }
    if (marked) ocg?.end(page);
  };

  // Background images sit above the source page and below every markup.
  for (const layer of project.layers) {
    if (
      !layerVisibleOnPage(layer, pageId, hierarchy) ||
      layer.opacity <= 0 ||
      !layerIds.has(layer.id)
    )
      continue;
    drawLayer(layer, true);
  }

  const sheet = templateDocumentForPage(project, pageNumber);
  if (sheet?.template) {
    const sheetSpec = sheetTemplateFor(
      sheet.template.id,
      sheet.template.paper,
      resolveSheetLabels((key) => t(key)),
    );
    if (sheetSpec) drawSheetFields(page, sheetSpec, sheet.template.fields, fonts);
  }

  for (const layer of project.layers) {
    if (
      !layerVisibleOnPage(layer, pageId, hierarchy) ||
      layer.opacity <= 0 ||
      !layerIds.has(layer.id)
    )
      continue;
    drawLayer(layer, false);
  }

  if (options.includeCalibration) {
    const calibration = pageCalibration(project, pageId);
    if (calibration && isReferenceCalibration(calibration)) {
      drawCalibrationLine(page, viewport, calibration.p1, calibration.p2);
      const calibrationLabel = labels.get(CALIBRATION_LABEL_ID);
      if (calibrationLabel) drawLabel(page, viewport, calibrationLabel, 1, fonts);
    }
  }
}
