import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Rect, SheetTemplateSpec, TextAlign, VerticalAlign } from "../model/sheetTemplate";
import { fitText } from "./sheetText";

const INK = rgb(0, 0, 0);

function hexColor(hex: string) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

export { fitText };

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

export interface SheetFonts {
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
  const fitted = fitText(
    text,
    (value, size) => font.widthOfTextAtSize(value, size),
    options.size,
    maxWidth,
    options.shrink ? 4 : options.size,
  );
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
      const fill = primitive.fill ? hexColor(primitive.fill) : undefined;
      const strokeWidth = primitive.strokeWidth ?? 0.5;
      page.drawRectangle({
        x: primitive.rect.x,
        y: pageHeight - primitive.rect.y - primitive.rect.height,
        width: primitive.rect.width,
        height: primitive.rect.height,
        ...(fill ? { color: fill } : {}),
        ...(strokeWidth > 0 ? { borderWidth: strokeWidth, borderColor: INK } : {}),
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

/** Draws the field values onto an existing (static) sheet page. */
export function drawSheetFields(
  page: PDFPage,
  template: SheetTemplateSpec,
  values: Record<string, string>,
  fonts: SheetFonts,
): void {
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
  if (values) drawSheetFields(page, template, values, fonts);

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
