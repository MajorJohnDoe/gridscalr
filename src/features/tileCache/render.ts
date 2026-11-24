/**
 * The render adapter: one PDF.js raster for a page-space rect, with the same
 * clipped viewport and density cap that `PdfRenderer.renderCrop()` used before
 * the tile cache. The tile controller and the full-page fallback share it, so a
 * tile and the crop it replaces describe exactly the same pixels.
 */

import type { PDFPageProxy } from "pdfjs-dist";
import type { TileRect } from "./model";

export interface RasterTask {
  promise: Promise<void>;
  cancel(): void;
}

export interface PageRaster {
  canvas: HTMLCanvasElement;
  rect: TileRect;
  scale: number;
  task: RasterTask;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Renders `rect` (page coordinates) into a fresh canvas. The rect is clamped to
 * the page and the requested scale is capped exactly like the pre-tile
 * `renderCrop()`, so a tile never asks PDF.js for a different density.
 */
export function renderPageRaster(
  page: PDFPageProxy,
  rect: TileRect,
  requestedScale: number,
): PageRaster {
  const base = page.getViewport({ scale: 1 });
  const pageWidth = base.width;
  const pageHeight = base.height;

  const x = clamp(rect.x, 0, pageWidth - 0.5);
  const y = clamp(rect.y, 0, pageHeight - 0.5);
  const width = clamp(rect.width, 0.5, pageWidth - x);
  const height = clamp(rect.height, 0.5, pageHeight - y);

  const maxDimension = 4096;
  const maxPixels = 8_000_000;
  let scale = Math.min(
    requestedScale,
    maxDimension / Math.max(width, 1),
    maxDimension / Math.max(height, 1),
  );
  if (width * height * scale * scale > maxPixels) {
    scale = Math.sqrt(maxPixels / (width * height));
  }
  scale = Math.max(0.05, scale);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));

  const viewport = base.clone({
    scale,
    offsetX: -x * scale,
    offsetY: -y * scale,
  });
  const task = page.render({
    canvas,
    viewport,
    background: "#ffffff",
    intent: "display",
  }) as unknown as RasterTask;
  return { canvas, rect: { x, y, width, height }, scale, task };
}
