import type { Project } from "../model/types";
import { csvDialect, escapeCsvField, type CsvOptions } from "./csv";
import { MARKUP_COLUMNS, markupTable } from "./rows";

export const MARKUP_CSV_COLUMNS = MARKUP_COLUMNS;

/** Serializes every visible markup on every visible layer. */
export function serializeMarkupCsv(project: Project, options: CsvOptions = {}): string {
  const dialect = csvDialect(options);
  return markupTable(project)
    .map((row) =>
      row.map((cell) => escapeCsvField(cell.text, dialect.delimiter)).join(dialect.delimiter),
    )
    .join("\r\n");
}
