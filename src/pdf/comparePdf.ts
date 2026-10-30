import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import type { DiffItem, RevisionDiff } from "../compare/revisionDiff";
import { totalPageCount } from "../model/documents";
import type { Project } from "../model/types";
import type { PdfRenderer } from "./pdfRenderer";
import { renderPagePreview } from "./pdfRenderer";

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 36;
const GAP = 22;
const HEADER = 48;
const FOOTER = 16;
const TABLE_ROW_HEIGHT = 12;

const INK = rgb(0.1, 0.12, 0.14);
const MUTED = rgb(0.42, 0.45, 0.48);
const LINE = rgb(0.78, 0.81, 0.84);
const JADE = rgb(0.02, 0.46, 0.38);
const WARNING = rgb(0.66, 0.34, 0.04);
const DANGER = rgb(0.72, 0.16, 0.16);
const HEADER_BG = rgb(0.94, 0.95, 0.96);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

export interface ComparisonPdfOptions {
  current: Project;
  referenceName: string;
  referencePageCount: number;
  /** Present when the reference is a .gridscalr project. */
  reference?: Project;
  /** Absent for a raw PDF reference, which has no markup diff. */
  diff?: RevisionDiff | null;
  currentRenderer: PdfRenderer;
  referenceRenderer: PdfRenderer;
  generatedAt?: string;
}

function sanitize(text: string): string {
  // eslint-disable-next-line no-control-regex -- the PDF font window is Latin-1
  return text.replace(/[^\u0000-\u00ff]/g, "?");
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const clean = sanitize(text);
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let low = 0;
  let high = clean.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${clean.slice(0, mid)}...`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${clean.slice(0, low)}...`;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = sanitize(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function statusLabel(status: DiffItem["status"]): string {
  if (status === "added") return "Added";
  if (status === "removed") return "Removed";
  if (status === "changed") return "Changed";
  return "Unchanged";
}

function statusColor(status: DiffItem["status"]) {
  if (status === "added") return JADE;
  if (status === "removed") return DANGER;
  if (status === "changed") return WARNING;
  return MUTED;
}

function drawHeader(page: PDFPage, fonts: Fonts, title: string, subtitle: string): void {
  page.drawText(fitText(title, fonts.bold, 15, PAGE_WIDTH - MARGIN * 2), {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN - 14,
    size: 15,
    font: fonts.bold,
    color: INK,
  });
  page.drawText(fitText(subtitle, fonts.regular, 9, PAGE_WIDTH - MARGIN * 2), {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN - 28,
    size: 9,
    font: fonts.regular,
    color: MUTED,
  });
  page.drawLine({
    start: { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 36 },
    end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - MARGIN - 36 },
    thickness: 0.7,
    color: LINE,
  });
}

function drawFooter(page: PDFPage, fonts: Fonts, text: string): void {
  page.drawText(fitText(text, fonts.regular, 7.5, PAGE_WIDTH - MARGIN * 2), {
    x: MARGIN,
    y: MARGIN - 14,
    size: 7.5,
    font: fonts.regular,
    color: MUTED,
  });
}

function newPage(pdf: PDFDocument, fonts: Fonts, title: string, subtitle: string): PDFPage {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawHeader(page, fonts, title, subtitle);
  return page;
}

async function pageImage(
  pdf: PDFDocument,
  renderer: PdfRenderer,
  page: number,
  pageCount: number,
): Promise<PDFImage | null> {
  if (page > pageCount) return null;
  try {
    const proxy = await renderer.getPage(page);
    const canvas = await renderPagePreview(proxy, 1400);
    return await pdf.embedPng(canvas.toDataURL("image/png"));
  } catch {
    return null;
  }
}

function drawPageSlot(
  page: PDFPage,
  image: PDFImage | null,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  fonts: Fonts,
): void {
  page.drawText(fitText(label, fonts.bold, 8.5, width), {
    x,
    y: y + height + 6,
    size: 8.5,
    font: fonts.bold,
    color: INK,
  });
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: LINE,
    borderWidth: 0.6,
    color: rgb(1, 1, 1),
  });
  if (!image) {
    page.drawText("Page not present", {
      x: x + 10,
      y: y + height / 2,
      size: 10,
      font: fonts.regular,
      color: MUTED,
    });
    return;
  }
  const imageWidth = image.width;
  const imageHeight = image.height;
  const scale = Math.min((width - 10) / imageWidth, (height - 10) / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  page.drawImage(image, {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });
}

function summaryPage(pdf: PDFDocument, fonts: Fonts, options: ComparisonPdfOptions): PDFPage {
  const diff = options.diff ?? null;
  const page = newPage(
    pdf,
    fonts,
    diff ? "Revision comparison" : "Drawing reference comparison",
    `${options.current.name} versus ${options.referenceName}`,
  );
  let y = PAGE_HEIGHT - MARGIN - 62;
  const generated = options.generatedAt ?? new Date().toISOString();
  const rows: Array<[string, string]> = [
    ["Current revision", options.current.name],
    [diff ? "Reference revision" : "Reference drawing", options.referenceName],
    ["Generated at", generated],
    ["Pages", String(diff?.summary.pages ?? options.referencePageCount)],
  ];
  if (diff) {
    rows.push(
      ["Changed", String(diff.summary.changed)],
      ["Added", String(diff.summary.added)],
      ["Removed", String(diff.summary.removed)],
      ["Unchanged", String(diff.summary.unchanged)],
    );
  } else {
    rows.push(["Markup comparison", "Not available for a drawing reference"]);
  }
  for (const [label, value] of rows) {
    page.drawText(label, { x: MARGIN, y, size: 9, font: fonts.regular, color: MUTED });
    page.drawText(fitText(value, fonts.bold, 9, PAGE_WIDTH - MARGIN * 2 - 150), {
      x: MARGIN + 150,
      y,
      size: 9,
      font: fonts.bold,
      color: INK,
    });
    y -= 15;
  }
  y -= 6;
  if (diff?.warnings.length) {
    page.drawText("Warnings", { x: MARGIN, y, size: 10, font: fonts.bold, color: WARNING });
    y -= 14;
    for (const warning of diff.warnings) {
      for (const line of wrapText(warning, fonts.regular, 8.5, PAGE_WIDTH - MARGIN * 2 - 8)) {
        page.drawText(line, { x: MARGIN + 8, y, size: 8.5, font: fonts.regular, color: WARNING });
        y -= 11;
      }
      y -= 3;
    }
    y -= 8;
  }
  if (!diff) {
    drawFooter(page, fonts, "GridScalr drawing reference comparison");
    return page;
  }
  page.drawText("Pages", { x: MARGIN, y, size: 10, font: fonts.bold, color: INK });
  y -= 14;
  const columns = [40, 250, 80, 80, 80, 80];
  const headers = ["Page", "Name", "Changed", "Added", "Removed", "Unchanged"];
  let x = MARGIN;
  for (let index = 0; index < headers.length; index += 1) {
    page.drawText(headers[index], { x, y, size: 7.5, font: fonts.bold, color: INK });
    x += columns[index];
  }
  y -= 10;
  for (const entry of diff.pages) {
    if (y < MARGIN + 20) break;
    x = MARGIN;
    const values = [
      String(entry.page),
      entry.pageName,
      String(entry.changed),
      String(entry.added),
      String(entry.removed),
      String(entry.unchanged),
    ];
    for (let index = 0; index < values.length; index += 1) {
      page.drawText(fitText(values[index], fonts.regular, 7.5, columns[index] - 5), {
        x,
        y,
        size: 7.5,
        font: fonts.regular,
        color: index >= 2 && Number(values[index]) > 0 ? INK : MUTED,
      });
      x += columns[index];
    }
    y -= 11;
  }
  drawFooter(page, fonts, "GridScalr revision comparison");
  return page;
}

async function visualPages(
  pdf: PDFDocument,
  fonts: Fonts,
  options: ComparisonPdfOptions,
): Promise<void> {
  const diff = options.diff ?? null;
  const currentCount = totalPageCount(options.current.documents);
  const referenceCount = options.referencePageCount;
  const pageCount = Math.max(currentCount, referenceCount);
  const slotWidth = (PAGE_WIDTH - MARGIN * 2 - GAP) / 2;
  const slotHeight = PAGE_HEIGHT - MARGIN * 2 - HEADER - FOOTER - 18;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const [currentImage, referenceImage] = await Promise.all([
      pageImage(pdf, options.currentRenderer, pageNumber, currentCount),
      pageImage(pdf, options.referenceRenderer, pageNumber, referenceCount),
    ]);
    const page = newPage(
      pdf,
      fonts,
      `Page ${pageNumber}`,
      diff?.pages[pageNumber - 1]?.pageName ??
        (diff ? "Revision comparison" : options.referenceName),
    );
    const y = MARGIN + FOOTER;
    drawPageSlot(
      page,
      currentImage,
      MARGIN,
      y,
      slotWidth,
      slotHeight,
      `Current · ${options.current.name}`,
      fonts,
    );
    drawPageSlot(
      page,
      referenceImage,
      MARGIN + slotWidth + GAP,
      y,
      slotWidth,
      slotHeight,
      `Reference · ${options.referenceName}`,
      fonts,
    );
    const counts = diff?.pages[pageNumber - 1];
    const footer = counts
      ? `${counts.changed} changed · ${counts.added} added · ${counts.removed} removed · ${counts.unchanged} unchanged`
      : diff
        ? "No comparison data"
        : `${referenceCount} reference page${referenceCount === 1 ? "" : "s"} · no markup comparison`;
    drawFooter(page, fonts, footer);
  }
}

function tablePages(pdf: PDFDocument, fonts: Fonts, options: ComparisonPdfOptions): void {
  const diff = options.diff;
  if (!diff) return;
  const items = diff.items.filter((item) => item.status !== "unchanged");
  const columns = [52, 32, 48, 150, PAGE_WIDTH - MARGIN * 2 - 52 - 32 - 48 - 150];
  const headers = ["Status", "Page", "Type", "Label", "Changes"];
  let page = newPage(
    pdf,
    fonts,
    "Differences",
    `${items.length} changed, added or removed item${items.length === 1 ? "" : "s"}`,
  );
  let y = PAGE_HEIGHT - MARGIN - HEADER - 10;

  const drawTableHeader = () => {
    let x = MARGIN;
    page.drawRectangle({
      x: MARGIN,
      y: y - 4,
      width: PAGE_WIDTH - MARGIN * 2,
      height: 13,
      color: HEADER_BG,
    });
    for (let index = 0; index < headers.length; index += 1) {
      page.drawText(headers[index], { x: x + 2, y: y, size: 7.5, font: fonts.bold, color: INK });
      x += columns[index];
    }
    y -= 14;
  };
  drawTableHeader();

  if (!items.length) {
    page.drawText("No changed, added or removed items.", {
      x: MARGIN,
      y,
      size: 9,
      font: fonts.regular,
      color: MUTED,
    });
    drawFooter(page, fonts, "GridScalr revision comparison");
    return;
  }

  for (const item of items) {
    const changeText = item.changes.length
      ? item.changes
          .map((change) => `${change.label}: ${change.before} -> ${change.after}`)
          .join("; ")
      : item.status === "added"
        ? "Only in the current revision"
        : "Only in the reference revision";
    const labelLines = wrapText(item.label, fonts.regular, 7.5, columns[3] - 5);
    const changeLines = wrapText(changeText, fonts.regular, 7.5, columns[4] - 5);
    const lineCount = Math.max(labelLines.length, changeLines.length, 1);
    const rowHeight = Math.max(TABLE_ROW_HEIGHT, lineCount * 9 + 4);
    if (y - rowHeight < MARGIN + 18) {
      drawFooter(page, fonts, "GridScalr revision comparison");
      page = newPage(pdf, fonts, "Differences (continued)", options.referenceName);
      y = PAGE_HEIGHT - MARGIN - HEADER - 10;
      drawTableHeader();
    }
    let x = MARGIN;
    page.drawText(statusLabel(item.status), {
      x: x + 2,
      y: y - 2,
      size: 7.5,
      font: fonts.bold,
      color: statusColor(item.status),
    });
    x += columns[0];
    page.drawText(String(item.page), {
      x: x + 2,
      y: y - 2,
      size: 7.5,
      font: fonts.regular,
      color: INK,
    });
    x += columns[1];
    page.drawText(fitText(item.kindLabel, fonts.regular, 7.5, columns[2] - 5), {
      x: x + 2,
      y: y - 2,
      size: 7.5,
      font: fonts.regular,
      color: INK,
    });
    x += columns[2];
    labelLines.forEach((line, index) => {
      page.drawText(line, {
        x: x + 2,
        y: y - 2 - index * 9,
        size: 7.5,
        font: fonts.regular,
        color: INK,
      });
    });
    x += columns[3];
    changeLines.forEach((line, index) => {
      page.drawText(line, {
        x: x + 2,
        y: y - 2 - index * 9,
        size: 7.5,
        font: fonts.regular,
        color: MUTED,
      });
    });
    y -= rowHeight;
    page.drawLine({
      start: { x: MARGIN, y: y + 2 },
      end: { x: PAGE_WIDTH - MARGIN, y: y + 2 },
      thickness: 0.35,
      color: LINE,
    });
  }
  drawFooter(page, fonts, "GridScalr revision comparison");
}

/**
 * Builds a read-only comparison PDF. Both source projects and their drawings
 * are left untouched.
 */
export async function exportComparisonPdf(options: ComparisonPdfOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  summaryPage(pdf, fonts, options);
  await visualPages(pdf, fonts, options);
  tablePages(pdf, fonts, options);
  return pdf.save();
}
