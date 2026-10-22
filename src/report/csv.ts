import type { QuantityReport } from "./reportModel";
import type { QuantityRow } from "../model/quantity";

export const QUANTITY_CSV_COLUMNS = [
  "category",
  "room",
  "quantity_type",
  "unit",
  "gross",
  "deduction",
  "net",
  "waste_percent",
  "waste_quantity",
  "rounding_step",
  "order_quantity",
  "item_count",
] as const;

function escapeField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function fixed3(value: number): string {
  if (!Number.isFinite(value)) return "0.000";
  const fixed = Math.abs(value) < 0.0005 ? 0 : value;
  return fixed.toFixed(3);
}

function measuredValue(value: number, row: QuantityRow): string {
  return row.type === "count" ? String(Math.round(value)) : fixed3(value);
}

function rowValues(row: QuantityRow): string[] {
  return [
    row.categoryName,
    row.room,
    row.type,
    row.unit,
    measuredValue(row.gross, row),
    measuredValue(row.deduction, row),
    measuredValue(row.net, row),
    fixed3(row.wastePercent),
    fixed3(row.wasteQuantity),
    fixed3(row.roundingStep),
    measuredValue(row.orderQuantity, row),
    String(row.items),
  ];
}

/**
 * Serializes the quantity report as spreadsheet-friendly CSV: UTF-8 BOM,
 * comma delimiter, CRLF line endings, and two blank lines before metadata.
 */
export function serializeQuantityCsv(report: QuantityReport): string {
  const lines: string[] = [
    QUANTITY_CSV_COLUMNS.join(","),
    ...report.summary.rows.map((row) =>
      rowValues(row).map(escapeField).join(","),
    ),
  ];
  const metadata = [
    ["project", report.projectName],
    ["document", report.documentName],
    ["document_sha256", report.documentSha256],
    ["generated_at", report.generatedAt],
    ["hidden_excluded", report.hiddenExcluded ? "true" : "false"],
  ]
    .map(([key, value]) => `${escapeField(key)},${escapeField(value)}`)
    .join("\r\n");
  return `\uFEFF${lines.join("\r\n")}\r\n\r\n\r\n${metadata}\r\n`;
}
