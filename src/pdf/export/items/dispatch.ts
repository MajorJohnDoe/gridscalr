import { degrees, type PDFPage } from "pdf-lib";
import type { PageViewport } from "pdfjs-dist";
import { imageOpacity } from "../../../model/images";
import { resolveItemColor } from "../../../model/layers";
import { MIN_EXPORT_STROKE_WIDTH } from "../../../model/style";
import type { LabelLayout } from "../../../model/labelLayout";
import type { MarkupItem, Project } from "../../../model/types";
import { clamp, itemRectCorners, pdfColor, pdfRectFromCorners } from "../geometry";
import { drawLabel } from "../labels";
import type { ExportFonts, ExportImages } from "../types";
import { drawAnnotationItem } from "./annotations";
import { drawCountItem } from "./counts";
import { drawMeasurementItem } from "./measurement";
import { drawShapeItem } from "./shapes";
import { drawSymbolItem } from "./symbols";
import { drawTextFamilyItem } from "./text";

/** Family switch shared by every exported page. */
export function drawItem(
  page: PDFPage,
  viewport: PageViewport,
  project: Project,
  item: MarkupItem,
  layerOpacity: number,
  fonts: ExportFonts,
  labels: Map<string, LabelLayout>,
  images: ExportImages,
): void {
  const color = pdfColor(resolveItemColor(item));
  const width = Math.max(MIN_EXPORT_STROKE_WIDTH, item.strokeWidth);
  const opacity = clamp(layerOpacity, 0, 1);
  const context = { page, viewport, project, fonts, labels, images };

  switch (item.kind) {
    case "length":
    case "angle":
    case "slope":
    case "radius":
    case "diameter":
    case "arc":
    case "area":
    case "volume":
      drawMeasurementItem(context, item, layerOpacity);
      break;
    case "count":
      drawCountItem(context, item, project, color, width, opacity);
      break;
    case "symbol":
      drawSymbolItem(context, item, opacity);
      break;
    case "pen":
    case "highlight":
    case "line":
    case "arrow":
    case "rect":
    case "ellipse":
    case "polyline":
    case "rail":
      drawShapeItem(context, item, layerOpacity);
      break;
    case "cloud":
    case "callout":
    case "stamp":
    case "delta":
      drawAnnotationItem(context, item, layerOpacity);
      break;
    case "text":
    case "textbox":
      drawTextFamilyItem(context, item, layerOpacity);
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
