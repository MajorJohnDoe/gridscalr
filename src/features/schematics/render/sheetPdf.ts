import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Rect, SheetTemplateSpec, TextAlign, VerticalAlign } from "../model/sheetTemplate";

const INK = rgb(0, 0, 0);

/** The subset of pdf-lib's PDFFont that text fitting needs. */
export interface TextMeasurer {
  widthOfTextAtSize(text: string, size: number): number;
}

export interface FittedText {
  text: string;
  size: number;
}

/**
 * Shrinks text until it fits the available width, then ellipsizes. The full
 * value stays in the project; this only controls what is drawn.
 */
export function fitText(
  text: string,
  measurer: TextMeasurer,
  size: number,
  maxWidth: number,
  minSize = 4,
): FittedText {
  const value = text.trim();
  const floor = Math.min(minSize, size);
  if (!value || maxWidth <= 0) return { text: "", size };
  if (measurer.widthOfTextAtSize(value, size) <= maxWidth) return { text: value, size };

  let currentSize = size;
  while (currentSize > floor && measurer.widthOfTextAtSize(value, currentSize) > maxWidth) {
    currentSize = Math.max(floor, currentSize - 0.25);
  }
  if (measurer.widthOfTextAtSize(value, currentSize) <= maxWidth) {
    return { text: value, size: currentSize };
  }

  const suffix = "...";
  if (measurer.widthOfTextAtSize(suffix, currentSize) > maxWidth) {
    return { text: "", size: currentSize };
  }
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${value.slice(0, middle).trimEnd()}${suffix}`;
    if (measurer.widthOfTextAtSize(candidate, currentSize) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return { text: `${value.slice(0, low).trimEnd()}${suffix}`, size: currentSize };
}

/** Converts a top-left rectangle into pdf-lib's bottom-left page space. */
export function toPdfRect(pageHeight: number, rect: Rect): Rect {
  return {
    x: rect.x,
    y: pageHeight - rect.y - rect.height,
    width: rect.width,
    height: rect.height,
  };
}

/** Baseline in pdf-lib page space for text inside a top-left rectangle. */
export function baselineY(
  pageHeight: number,
  rect: Rect,
  fontSize: number,
  verticalAlign: VerticalAlign,
  padding: number,
): number {
  let top: number;
  if (verticalAlign === "top") {
    top = rect.y + padding + fontSize * 0.8;
  } else if (verticalAlign === "bottom") {
    top = rect.y + rect.height - padding - fontSize * 0.2;
  } else {
    top = rect.y + rect.height / 2 + fontSize * 0.35;
  }
  return pageHeight - top;
}

interface SheetFonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface TextOptions {
  size: number;
  bold?: boolean;
  align: TextAlign;
  verticalAlign: VerticalAlign;
  padding: number;
  shrink: boolean;
}

function drawTextInRect(
  page: PDFPage,
  fonts: SheetFonts,
  text: string,
  rect: Rect,
  options: TextOptions,
): void {
  if (!text) return;
  const font = options.bold ? fonts.bold : fonts.regular;
  const maxWidth = Math.max(1, rect.width - options.padding * 2);
  const fitted = fitText(text, font, options.size, maxWidth, options.shrink ? 4 : options.size);
  if (!fitted.text) return;

  const width = font.widthOfTextAtSize(fitted.text, fitted.size);
  let x = rect.x + options.padding;
  if (options.align === "center") x = rect.x + (rect.width - width) / 2;
  else if (options.align === "right") x = rect.x + rect.width - options.padding - width;
  const y = baselineY(page.getHeight(), rect, fitted.size, options.verticalAlign, options.padding);
  page.drawText(fitted.text, {
    x,
    y,
    size: fitted.size,
    font,
    color: INK,
  });
}

function drawPrimitives(page: PDFPage, template: SheetTemplateSpec, fonts: SheetFonts): void {
  const pageHeight = template.height;
  for (const primitive of template.staticPrimitives) {
    if (primitive.kind === "rect") {
      page.drawRectangle({
        x: primitive.rect.x,
        y: pageHeight - primitive.rect.y - primitive.rect.height,
        width: primitive.rect.width,
        height: primitive.rect.height,
        borderWidth: primitive.strokeWidth ?? 0.5,
        borderColor: INK,
      });
    } else if (primitive.kind === "line") {
      page.drawLine({
        start: { x: primitive.x1, y: pageHeight - primitive.y1 },
        end: { x: primitive.x2, y: pageHeight - primitive.y2 },
        thickness: primitive.strokeWidth ?? 0.5,
        color: INK,
      });
    } else {
      drawTextInRect(page, fonts, primitive.text, primitive.rect, {
        size: primitive.size,
        bold: primitive.bold,
        align: primitive.align ?? "left",
        verticalAlign: primitive.verticalAlign ?? "middle",
        padding: primitive.padding ?? 0,
        shrink: true,
      });
    }
  }
}

/** Field values are single-line in the first implementation. */
function normalizeFieldValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function createSheetPdf(
  template: SheetTemplateSpec,
  values?: Record<string, string>,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([template.width, template.height]);
  const fonts: SheetFonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
  };

  drawPrimitives(page, template, fonts);

  if (values) {
    for (const spec of template.fields) {
      const value = values[spec.id];
      if (!value) continue;
      drawTextInRect(page, fonts, normalizeFieldValue(value), spec.rect, {
        size: spec.fontSize,
        bold: spec.bold,
        align: spec.align,
        verticalAlign: spec.verticalAlign,
        padding: spec.padding,
        shrink: spec.shrink,
      });
    }
  }

  return document.save();
}

/** The frame without any user values. Shared by every sheet of this template. */
export async function buildStaticSheetPdf(template: SheetTemplateSpec): Promise<Uint8Array> {
  return createSheetPdf(template);
}

/** The frame plus field values, ready for export or a visual check. */
export async function buildSheetPdf(
  template: SheetTemplateSpec,
  values: Record<string, string>,
): Promise<Uint8Array> {
  return createSheetPdf(template, values);
}
