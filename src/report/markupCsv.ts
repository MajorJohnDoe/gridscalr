import type { Project } from "../model/types";
import { escapeCsvField } from "./csv";
import { MARKUP_COLUMNS, markupTable } from "./rows";

export const MARKUP_CSV_COLUMNS = MARKUP_COLUMNS;

/** Serializes every visible markup on every visible layer. */
export function serializeMarkupCsv(project: Project): string {
  return markupTable(project)
    .map((row) => row.map((cell) => escapeCsvField(cell.text)).join(","))
    .join("\r\n");
}
