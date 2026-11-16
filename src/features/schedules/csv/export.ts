import type {
  CustomValue,
  FieldDefinition,
  Project,
  ScheduleDefinition,
} from "../../../model/types";
import { computeSchedule, findSchedule } from "../model";
import type { ScheduleResult } from "../model";
import type { ScheduleCsvExport } from "./types";
import {
  escapeCsvField,
  formatCsvNumber,
  guardCsvText,
  scheduleCsvDialect,
  type ScheduleCsvDialectOptions,
} from "./text";

/**
 * Round-trip export. The first two columns are the stable row identity (`ID`)
 * and `Typ` (`item`/`space`); every schedule column follows as `Label [key]`.
 * Numeric cells stay numeric, text is guarded against spreadsheet formulas and
 * a UTF-8 BOM opens correctly in Excel. A grouped schedule is a read-only
 * export and is marked as such.
 */

function text(value: string, delimiter: string): string {
  return escapeCsvField(guardCsvText(value), delimiter);
}

function cellText(value: string, number: number | null, decimal: string): string {
  if (typeof number === "number" && Number.isFinite(number)) {
    return formatCsvNumber(number, decimal);
  }
  return value;
}

interface CsvExportContext {
  fields: Map<string, FieldDefinition>;
  entities: Map<string, { custom?: Record<string, CustomValue> }>;
}

function exportContext(project: Project): CsvExportContext {
  const fields = new Map(project.fieldDefinitions.map((field) => [field.id, field]));
  const entities = new Map<string, { custom?: Record<string, CustomValue> }>();
  for (const layer of project.layers) {
    for (const item of layer.items) entities.set(item.id, item);
  }
  for (const space of project.spaces) entities.set(space.id, space);
  return { fields, entities };
}

/**
 * A multi-choice field is displayed with commas in the table, but a comma is
 * also the English delimiter. The CSV form joins labels with a semicolon so the
 * cell survives both delimiters and imports back by exact label.
 */
function multiEnumText(
  context: CsvExportContext,
  fieldId: string,
  entityId: string,
): string | null {
  const field = context.fields.get(fieldId);
  if (!field || field.type !== "multiEnum") return null;
  const value = context.entities.get(entityId)?.custom?.[fieldId];
  if (!Array.isArray(value)) return "";
  return value
    .map((id) => field.options?.find((option) => option.id === id)?.label ?? id)
    .join("; ");
}

function itemLine(
  context: CsvExportContext,
  result: ScheduleResult,
  rowIndex: number,
  decimal: string,
  delimiter: string,
  type: "item" | "space",
): string {
  const row = result.rows[rowIndex];
  const columns = result.columns.map((column, index) => {
    const cell = row.cells[index];
    if (!cell) return "";
    const multi = column.fieldId ? multiEnumText(context, column.fieldId, row.entityId) : null;
    if (multi !== null) return text(multi, delimiter);
    return cell.value !== null
      ? cellText(cell.text, cell.value, decimal)
      : text(cell.text, delimiter);
  });
  const cells = [text(row.entityId, delimiter), type, ...columns];
  return cells.map((value) => value).join(delimiter);
}

function groupedLine(
  result: ScheduleResult,
  groupIndex: number,
  definition: ScheduleDefinition,
  decimal: string,
  delimiter: string,
): string {
  const group = result.groups[groupIndex];
  const columns = result.columns.map((column) => {
    const subtotal = group.subtotals.find((entry) => entry.field === column.field);
    if (subtotal) {
      return subtotal.value !== null
        ? cellText(subtotal.text, subtotal.value, decimal)
        : text(subtotal.text, delimiter);
    }
    if (definition.groupBy === column.field) return text(group.label, delimiter);
    return "";
  });
  const cells = ["", "group", ...columns];
  return cells.join(delimiter);
}

export function serializeScheduleCsv(
  project: Project,
  scheduleId: string,
  options: ScheduleCsvDialectOptions = {},
): ScheduleCsvExport | null {
  const definition = findSchedule(project, scheduleId);
  if (!definition) return null;
  const dialect = scheduleCsvDialect(options);
  const result = computeSchedule(project, definition);
  const context = exportContext(project);
  const headers = [
    "ID",
    "Typ",
    ...result.columns.map((column) => `${column.label} [${column.field}]`),
  ];
  const lines: string[] = [
    headers.map((header) => text(header, dialect.delimiter)).join(dialect.delimiter),
  ];
  const count = definition.rowMode === "grouped" ? result.groups.length : result.rows.length;
  for (let index = 0; index < count; index += 1) {
    lines.push(
      definition.rowMode === "grouped"
        ? groupedLine(result, index, definition, dialect.decimal, dialect.delimiter)
        : itemLine(
            context,
            result,
            index,
            dialect.decimal,
            dialect.delimiter,
            definition.source === "spaces" ? "space" : "item",
          ),
    );
  }
  return {
    text: `\uFEFF${lines.join("\r\n")}\r\n`,
    delimiter: dialect.delimiter,
    decimal: dialect.decimal,
    bom: true,
    headers,
    rowCount: count,
    rowMode: definition.rowMode,
    importable: definition.rowMode === "items",
  };
}
