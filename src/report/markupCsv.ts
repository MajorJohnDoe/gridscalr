import type { Project } from "../model/types";
import { csvDialect, escapeCsvField, type CsvOptions } from "./csv";
import { markupTable } from "./rows";

export { MARKUP_CSV_COLUMNS } from "./rows";

/** Serializes every visible markup on every visible layer. */
export function serializeMarkupCsv(project: Project, options: CsvOptions = {}): string {
  const dialect = csvDialect(options);
  return markupTable(project)
    .map((row) =>
      row.map((cell) => escapeCsvField(cell.text, dialect.delimiter)).join(dialect.delimiter),
    )
    .join("\r\n");
}
