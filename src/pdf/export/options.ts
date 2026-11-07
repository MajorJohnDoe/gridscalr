import type { PageViewport } from "pdfjs-dist";
import { pageRectFromCrop, type NormalizedCrop } from "../../model/export";
import { t } from "../../i18n";
import { clamp } from "./geometry";

export interface PdfCropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeExportPages(
  pages: readonly number[] | undefined,
  pageCount: number,
): number[] {
  if (pageCount < 1) throw new Error(t("pdfExport.noPages"));
  if (!pages) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const selected = [
    ...new Set(
      pages
        .filter((page) => Number.isInteger(page) && page >= 1 && page <= pageCount)
        .map((page) => Math.round(page)),
    ),
  ].sort((a, b) => a - b);
  if (!selected.length) throw new Error(t("pdfExport.selectPages"));
  return selected;
}

export function normalizeCrop(crop: NormalizedCrop | undefined): NormalizedCrop | undefined {
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
    throw new Error(t("pdfExport.rotationUnsupported"));
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
    throw new Error(t("pdfExport.areaInvalid"));
  }
  return clipped;
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
