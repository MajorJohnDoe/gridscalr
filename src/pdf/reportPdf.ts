import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { QuantityRow, QuantityType, QuantityTypeTotal } from "../model/quantity";
import { formatNumber } from "../model/units";
import type { QuantityReport } from "../report/reportModel";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TABLE_ROW_HEIGHT = 15;
const TABLE_HEADER_HEIGHT = 17;

const INK = rgb(0.1, 0.12, 0.14);
const MUTED = rgb(0.42, 0.45, 0.48);
const LINE = rgb(0.78, 0.81, 0.84);
const JADE = rgb(0.02, 0.46, 0.38);
const WARNING = rgb(0.66, 0.34, 0.04);
const HEADER_BG = rgb(0.94, 0.95, 0.96);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface Column {
  label: string;
  width: number;
  align: "left" | "right";
}

const COLUMNS: Column[] = [
  { label: "Room", width: 140, align: "left" },
  { label: "Type", width: 45, align: "left" },
  { label: "Unit", width: 38, align: "left" },
  { label: "Gross", width: 52, align: "right" },
  { label: "Deduct", width: 52, align: "right" },
  { label: "Net", width: 52, align: "right" },
  { label: "Waste", width: 57, align: "right" },
  { label: "Order", width: 62, align: "right" },
];

const COLUMN_X: number[] = [];
let runningX = MARGIN;
for (const column of COLUMNS) {
  COLUMN_X.push(runningX);
  runningX += column.width;
}

function typeLabel(type: QuantityType): string {
  if (type === "length") return "Length";
  if (type === "area") return "Area";
  if (type === "angle") return "Angle";
  if (type === "slope") return "Slope";
  if (type === "volume") return "Volume";
  return "Count";
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ellipsis = "…";
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${text.slice(0, mid)}${ellipsis}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${text.slice(0, low)}${ellipsis}`;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
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

function measured(value: number, type: QuantityType): string {
  return formatNumber(value, type === "count" ? 0 : type === "angle" || type === "slope" ? 1 : 2);
}

function wasteValue(value: number): string {
  return formatNumber(value, 2);
}

class ReportLayout {
  private page: PDFPage;
  private cursor: number;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly fonts: Fonts,
    private readonly report: QuantityReport,
  ) {
    this.page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.cursor = PAGE_HEIGHT - MARGIN;
    this.drawHeader();
  }

  private drawHeader(): void {
    this.page.drawText(fitText(this.report.projectName, this.fonts.bold, 16, CONTENT_WIDTH), {
      x: MARGIN,
      y: this.cursor - 16,
      size: 16,
      font: this.fonts.bold,
      color: INK,
    });
    this.cursor -= 23;
    this.page.drawText(
      fitText(
        `Quantity report · ${this.report.documentName}`,
        this.fonts.regular,
        9,
        CONTENT_WIDTH,
      ),
      { x: MARGIN, y: this.cursor - 9, size: 9, font: this.fonts.regular, color: MUTED },
    );
    this.cursor -= 13;
    const date = this.report.generatedAt.slice(0, 10);
    this.page.drawText(
      fitText(
        `Date ${date} · Scale: ${this.report.scaleSummary}`,
        this.fonts.regular,
        8.5,
        CONTENT_WIDTH,
      ),
      { x: MARGIN, y: this.cursor - 8.5, size: 8.5, font: this.fonts.regular, color: MUTED },
    );
    this.cursor -= 14;
    this.page.drawLine({
      start: { x: MARGIN, y: this.cursor },
      end: { x: PAGE_WIDTH - MARGIN, y: this.cursor },
      thickness: 0.8,
      color: LINE,
    });
    this.cursor -= 16;
  }

  private newPage(): void {
    this.page = this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.cursor = PAGE_HEIGHT - MARGIN;
    this.drawHeader();
  }

  private ensureSpace(height: number): void {
    if (this.cursor - height >= MARGIN + 26) return;
    this.newPage();
  }

  heading(text: string): void {
    this.ensureSpace(34);
    this.page.drawText(fitText(text, this.fonts.bold, 12, CONTENT_WIDTH), {
      x: MARGIN,
      y: this.cursor - 12,
      size: 12,
      font: this.fonts.bold,
      color: INK,
    });
    this.cursor -= 20;
  }

  private drawTableHeader(): void {
    this.ensureSpace(TABLE_HEADER_HEIGHT + TABLE_ROW_HEIGHT);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.cursor - TABLE_HEADER_HEIGHT + 3,
      width: CONTENT_WIDTH,
      height: TABLE_HEADER_HEIGHT,
      color: HEADER_BG,
    });
    const baseline = this.cursor - 9;
    COLUMNS.forEach((column, index) => {
      this.drawCell(column.label, index, baseline, this.fonts.bold, 8, MUTED);
    });
    this.cursor -= TABLE_HEADER_HEIGHT;
  }

  private drawCell(
    text: string,
    columnIndex: number,
    baseline: number,
    font: PDFFont,
    size: number,
    color: RGB,
  ): void {
    const column = COLUMNS[columnIndex];
    const maxWidth = column.width - 8;
    const fitted = fitText(text, font, size, maxWidth);
    const width = font.widthOfTextAtSize(fitted, size);
    const x =
      column.align === "right"
        ? COLUMN_X[columnIndex] + column.width - 4 - width
        : COLUMN_X[columnIndex] + 3;
    this.page.drawText(fitted, { x, y: baseline, size, font, color });
  }

  tableHeader(): void {
    this.drawTableHeader();
  }

  private drawDataRow(
    label: string,
    type: QuantityType,
    unit: string,
    gross: number,
    deduction: number,
    net: number,
    waste: number,
    order: number,
    options: { bold?: boolean; tint?: RGB; countWaste?: boolean } = {},
  ): void {
    this.ensureSpace(TABLE_ROW_HEIGHT);
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const color = options.tint ?? INK;
    const baseline = this.cursor - 10;
    this.drawCell(label, 0, baseline, font, 8.5, color);
    this.drawCell(typeLabel(type), 1, baseline, font, 8.5, color);
    this.drawCell(unit, 2, baseline, font, 8.5, MUTED);
    this.drawCell(measured(gross, type), 3, baseline, font, 8.5, color);
    this.drawCell(measured(deduction, type), 4, baseline, font, 8.5, MUTED);
    this.drawCell(measured(net, type), 5, baseline, font, 8.5, color);
    this.drawCell(
      options.countWaste ? wasteValue(waste) : measured(waste, type),
      6,
      baseline,
      font,
      8.5,
      color,
    );
    this.drawCell(measured(order, type), 7, baseline, font, 8.5, JADE);
    this.cursor -= TABLE_ROW_HEIGHT;
  }

  row(row: QuantityRow): void {
    this.drawDataRow(
      row.room || "No room",
      row.type,
      row.unit,
      row.gross,
      row.deduction,
      row.net,
      row.wasteQuantity,
      row.orderQuantity,
      { tint: row.clamped ? WARNING : INK, countWaste: true },
    );
  }

  subtotal(label: string, total: QuantityTypeTotal): void {
    this.drawDataRow(
      label,
      total.type,
      total.unit,
      total.gross,
      total.deduction,
      total.net,
      total.wasteQuantity,
      total.orderQuantity,
      { bold: true, tint: MUTED, countWaste: true },
    );
  }

  gap(height = 12): void {
    this.cursor -= height;
  }

  notice(text: string): void {
    this.ensureSpace(18);
    const lines = wrapText(text, this.fonts.regular, 8.5, CONTENT_WIDTH);
    for (const line of lines) {
      this.ensureSpace(12);
      this.page.drawText(line, {
        x: MARGIN,
        y: this.cursor - 8.5,
        size: 8.5,
        font: this.fonts.regular,
        color: MUTED,
      });
      this.cursor -= 11;
    }
    this.cursor -= 2;
  }

  warning(text: string): void {
    this.ensureSpace(18);
    const lines = wrapText(text, this.fonts.bold, 8.5, CONTENT_WIDTH);
    for (const line of lines) {
      this.ensureSpace(12);
      this.page.drawText(line, {
        x: MARGIN,
        y: this.cursor - 8.5,
        size: 8.5,
        font: this.fonts.bold,
        color: WARNING,
      });
      this.cursor -= 11;
    }
    this.cursor -= 2;
  }

  finish(): void {
    const pages = this.pdf.getPages();
    pages.forEach((page, index) => {
      const text = `Page ${index + 1} of ${pages.length}`;
      const width = this.fonts.regular.widthOfTextAtSize(text, 8);
      page.drawText(text, {
        x: (PAGE_WIDTH - width) / 2,
        y: MARGIN / 2,
        size: 8,
        font: this.fonts.regular,
        color: MUTED,
      });
    });
  }
}

export async function exportQuantityReportPdf(report: QuantityReport): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const layout = new ReportLayout(pdf, fonts, report);
  const summary = report.summary;

  if (!summary.rows.length) {
    layout.heading("No quantities");
    layout.notice(
      "No visible, calibrated measurements matched the report. Draw a measurement or calibrate the page and try again.",
    );
  }

  let anyClamped = false;
  for (const category of summary.categories) {
    layout.heading(category.categoryName);
    layout.tableHeader();
    for (const room of category.rooms) {
      for (const row of room.rows) {
        layout.row(row);
        anyClamped ||= row.clamped;
      }
    }
    for (const total of category.totals) layout.subtotal("Subtotal", total);
    layout.gap();
  }

  if (summary.totals.length) {
    layout.heading("Total");
    layout.tableHeader();
    for (const total of summary.totals) layout.subtotal("Total", total);
    layout.gap();
  }

  if (report.summary.hiddenExcluded > 0) {
    layout.notice(
      `${summary.hiddenExcluded} hidden measurement${summary.hiddenExcluded === 1 ? "" : "s"} excluded from this report.`,
    );
  }
  if (summary.uncalibratedExcluded > 0) {
    layout.notice(
      `${summary.uncalibratedExcluded} uncalibrated measurement${summary.uncalibratedExcluded === 1 ? "" : "s"} excluded from this report.`,
    );
  }
  if (anyClamped) {
    layout.warning(
      "A deduction exceeds its gross quantity in at least one row. Net and order quantities are clamped to zero for that row.",
    );
  }

  layout.finish();
  return pdf.save();
}
