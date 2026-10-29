import type { QuantityReport } from "./reportModel";
import { QUANTITY_COLUMNS, quantityTable } from "./rows";

export const QUANTITY_CSV_COLUMNS = QUANTITY_COLUMNS;

export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Serializes the quantity report as spreadsheet-friendly CSV: UTF-8 BOM,
 * comma delimiter, CRLF line endings, and two blank lines before metadata.
 */
export function serializeQuantityCsv(report: QuantityReport): string {
  const lines = quantityTable(report).map((row) =>
    row.map((cell) => escapeCsvField(cell.text)).join(","),
  );
  const metadata = [
    ["project", report.projectName],
    ["document", report.documentName],
    ["document_sha256", report.documentSha256],
    ["generated_at", report.generatedAt],
    ["hidden_excluded", report.hiddenExcluded ? "true" : "false"],
  ]
    .map(([key, value]) => `${escapeCsvField(key)},${escapeCsvField(value)}`)
    .join("\r\n");
  return `\uFEFF${lines.join("\r\n")}\r\n\r\n\r\n${metadata}\r\n`;
}
