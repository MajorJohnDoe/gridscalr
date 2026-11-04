import { decimalSeparator } from "../i18n/format";
import { currentLocale, type Locale } from "../i18n";
import { loadAppPreferences, type CsvFormat } from "../io/appPreferences";
import type { ReportCell } from "./rows";
import type { QuantityReport } from "./reportModel";
import { QUANTITY_COLUMNS, quantityTable } from "./rows";

export const QUANTITY_CSV_COLUMNS = QUANTITY_COLUMNS;

export interface CsvOptions {
  locale?: Locale;
  format?: CsvFormat;
}

export interface CsvDialect {
  delimiter: string;
  decimal: string;
  format: CsvFormat;
  locale: Locale;
}

/**
 * Locale mode follows the app language, so Swedish Excel receives semicolons
 * and decimal commas. Interchange mode is RFC 4180 for scripts and tools.
 */
export function csvDialect(options: CsvOptions = {}): CsvDialect {
  const locale = options.locale ?? currentLocale();
  const format = options.format ?? loadAppPreferences().csvFormat;
  if (format === "interchange") {
    return { delimiter: ",", decimal: ".", format, locale };
  }
  const decimal = decimalSeparator(locale);
  return {
    delimiter: decimal === "," ? ";" : ",",
    decimal,
    format,
    locale,
  };
}

export function escapeCsvField(value: string, delimiter = ","): string {
  if (value.includes(delimiter) || value.includes('"') || /[\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function localizedCellText(cell: ReportCell, dialect: CsvDialect): string {
  if (typeof cell.value !== "number" || dialect.decimal === ".") return cell.text;
  return cell.text.replace(".", dialect.decimal);
}

/**
 * Serializes the quantity report as spreadsheet-friendly CSV: UTF-8 BOM,
 * locale-aware delimiter and decimals, CRLF line endings, and two blank
 * lines before stable English metadata keys.
 */
export function serializeQuantityCsv(report: QuantityReport, options: CsvOptions = {}): string {
  const dialect = csvDialect(options);
  const lines = quantityTable(report).map((row) =>
    row
      .map((cell) => escapeCsvField(localizedCellText(cell, dialect), dialect.delimiter))
      .join(dialect.delimiter),
  );
  const metadata = [
    ["project", report.projectName],
    ["document", report.documentName],
    ["document_sha256", report.documentSha256],
    ["generated_at", report.generatedAt],
    ["hidden_excluded", report.hiddenExcluded ? "true" : "false"],
  ]
    .map(
      ([key, value]) =>
        `${escapeCsvField(key, dialect.delimiter)}${dialect.delimiter}${escapeCsvField(
          value,
          dialect.delimiter,
        )}`,
    )
    .join("\r\n");
  return `\uFEFF${lines.join("\r\n")}\r\n\r\n\r\n${metadata}\r\n`;
}
