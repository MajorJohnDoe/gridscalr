import { customFieldIdForRef } from "../../../model/schedules";
import type {
  FieldDefinition,
  Project,
  ScheduleDefinition,
  ScheduleSource,
} from "../../../model/types";
import { projectField } from "../../fields";
import { resolveColumns } from "../model";
import type { ScheduleCsvIssue, ScheduleCsvReadOnlyColumn } from "./types";
import { unguardCsvText } from "./text";

/**
 * Header mapping for the round-trip. A header is `Label [key]`; the bracketed
 * key wins over the label so a renamed column label or a switched interface
 * language cannot mis-map a value. A header that does not resolve to a visible
 * column of this schedule is reported, never guessed into a column.
 */

export interface CsvMappedColumn {
  /** Index in the CSV record. */
  index: number;
  field: string;
  label: string;
  readOnly: boolean;
  custom: FieldDefinition | null;
}

export interface CsvHeaderMapping {
  /** -1 when the required column is missing. */
  idIndex: number;
  typeIndex: number;
  columns: CsvMappedColumn[];
  readOnlyColumns: ScheduleCsvReadOnlyColumn[];
  issues: ScheduleCsvIssue[];
}

const WRITABLE_FIELDS: Record<ScheduleSource, ReadonlySet<string>> = {
  measurements: new Set(["label", "room", "tag"]),
  spaces: new Set(["name", "number", "floor", "usage", "status"]),
};

function headerParts(header: string): { key: string; label: string } {
  const clean = unguardCsvText(header).trim();
  const match = /^(.*)\s+\[([^\]]+)\]$/.exec(clean);
  if (!match) return { key: "", label: clean };
  return { key: match[2].trim(), label: match[1].trim() };
}

function findByIdentity(headers: readonly string[], names: readonly string[]): number {
  return headers.findIndex((header) => names.includes(unguardCsvText(header).trim().toLowerCase()));
}

export function mapScheduleCsvHeaders(
  project: Project,
  definition: ScheduleDefinition,
  headers: readonly string[],
): CsvHeaderMapping {
  const idIndex = findByIdentity(headers, ["id"]);
  const typeIndex = findByIdentity(headers, ["typ", "type"]);
  const columns = resolveColumns(project, definition);
  const byField = new Map(columns.map((column) => [column.field, column]));
  const mapped = new Set<string>();
  const readOnlyColumns: ScheduleCsvReadOnlyColumn[] = [];
  const issues: ScheduleCsvIssue[] = [];
  const result: CsvMappedColumn[] = [];

  headers.forEach((header, index) => {
    if (index === idIndex || index === typeIndex) return;
    if (!unguardCsvText(header).trim()) return;
    const { key, label } = headerParts(header);
    let column = key ? byField.get(key) : undefined;
    if (!column && !key) {
      const wanted = label.toLocaleLowerCase();
      column = columns.find((entry) => entry.label.toLocaleLowerCase() === wanted);
    }
    if (!column) {
      issues.push({ code: "unknownField", field: key || undefined, label: label || header });
      return;
    }
    if (mapped.has(column.field)) {
      issues.push({ code: "duplicateHeader", field: column.field, label: column.label });
      return;
    }
    const customId = customFieldIdForRef(column.field);
    const custom = customId ? (projectField(project, customId) ?? null) : null;
    const readOnly = customId
      ? !custom || column.invalid
      : !WRITABLE_FIELDS[definition.source].has(column.field);
    if (readOnly) readOnlyColumns.push({ field: column.field, label: column.label });
    mapped.add(column.field);
    result.push({
      index,
      field: column.field,
      label: column.label,
      readOnly,
      custom,
    });
  });

  return { idIndex, typeIndex, columns: result, readOnlyColumns, issues };
}
