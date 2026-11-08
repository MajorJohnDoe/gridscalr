import type { PDFPage, RGB } from "pdf-lib";
import { resolveItemColor } from "../../../model/layers";
import { MIN_EXPORT_STROKE_WIDTH } from "../../../model/style";
import type { MarkupItem } from "../../../model/types";
import { clamp, pdfColor } from "../geometry";
import type { ExportPageContext } from "../types";

export interface ItemContext extends ExportPageContext {
  page: PDFPage;
}

export interface ItemStroke {
  color: RGB;
  width: number;
  opacity: number;
}

export function itemStroke(item: MarkupItem, layerOpacity: number): ItemStroke {
  return {
    color: pdfColor(resolveItemColor(item)),
    width: Math.max(MIN_EXPORT_STROKE_WIDTH, item.strokeWidth),
    opacity: clamp(layerOpacity, 0, 1),
  };
}
