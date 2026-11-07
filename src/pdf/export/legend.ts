import { rgb, type PDFDocument, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { countQuantityOf, countTypeLabel } from "../../features/countTypes/model";
import { countSymbol } from "../../model/countSymbols";
import { formatPageList } from "../../model/export";
import { itemIsVisible, layerVisibleOnPage } from "../../model/layers";
import type { CountGlyph, CountType, Point, Project } from "../../model/types";
import { t } from "../../i18n";
import { clamp, pdfColor } from "./geometry";
import type { ExportFonts } from "./types";

export function drawLegendPage(
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
