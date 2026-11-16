import type {
  MarkupItem,
  Project,
  ScheduleDefinition,
  ScheduleSource,
  Space,
} from "../../../model/types";
import type { ScheduleRow } from "../model";
import type { CsvMappedColumn } from "./headers";
import type { ScheduleCsvIssue, ScheduleCsvRow } from "./types";
import { customDisplay, parseCustomCsvValue, sameCustomValue } from "./values";
import { unguardCsvText } from "./text";

/** One data row: identity, type and value validation against the current schedule. */

export interface PlanContext {
  project: Project;
  definition: ScheduleDefinition;
  rowsById: Map<string, ScheduleRow>;
  itemById: Map<string, MarkupItem>;
  spaceById: Map<string, Space>;
  idCounts: Map<string, number>;
  idIndex: number;
  typeIndex: number;
  columns: CsvMappedColumn[];
  headers: readonly string[];
  delimiter: string;
}

export function itemMap(project: Project): Map<string, MarkupItem> {
  const map = new Map<string, MarkupItem>();
  for (const layer of project.layers) {
    for (const item of layer.items) map.set(item.id, item);
  }
  return map;
}

function sourceType(source: ScheduleSource): "item" | "space" {
  return source === "spaces" ? "space" : "item";
}

function rawText(entity: MarkupItem | Space, type: "item" | "space", field: string): string {
  if (type === "item") {
    const item = entity as MarkupItem;
    if (field === "label") return item.label ?? "";
    if (field === "room") return item.room ?? "";
    if (field === "tag") return item.tag ?? "";
    return "";
  }
  const space = entity as Space;
  if (field === "name") return space.name;
  if (field === "number") return space.number ?? "";
  if (field === "floor") return space.floor ?? "";
  if (field === "usage") return space.usage ?? "";
  if (field === "status") return space.status ?? "";
  return "";
}

function issue(
  code: ScheduleCsvIssue["code"],
  row: number,
  extra: Omit<ScheduleCsvIssue, "code" | "row"> = {},
): ScheduleCsvIssue {
  return { code, row, ...extra };
}

export function processRow(
  context: PlanContext,
  raw: readonly string[],
  index: number,
): ScheduleCsvRow {
  const rowNumber = index + 2;
  const id = (raw[context.idIndex] ?? "").trim();
  const typeText = (raw[context.typeIndex] ?? "").trim().toLocaleLowerCase();
  const parsedType =
    typeText === "item" || typeText === "space" ? typeText : sourceType(context.definition.source);
  const base = { row: rowNumber, id, type: parsedType };
  const issues: ScheduleCsvIssue[] = [];

  if (!typeText) {
    return { ...base, status: "rejected", updates: [], issues: [issue("missingType", rowNumber)] };
  }
  if (typeText !== "item" && typeText !== "space") {
    return {
      ...base,
      status: "rejected",
      updates: [],
      issues: [issue("wrongType", rowNumber, { value: typeText })],
    };
  }
  if (typeText !== sourceType(context.definition.source)) {
    return {
      ...base,
      status: "rejected",
      updates: [],
      issues: [issue("wrongType", rowNumber, { value: typeText })],
    };
  }
  if (!id) {
    return { ...base, status: "rejected", updates: [], issues: [issue("missingId", rowNumber)] };
  }
  if ((context.idCounts.get(id) ?? 0) > 1) {
    return {
      ...base,
      status: "rejected",
      updates: [],
      issues: [issue("duplicateId", rowNumber, { value: id })],
    };
  }
  const current = context.rowsById.get(id);
  if (!current) {
    return {
      ...base,
      status: "rejected",
      updates: [],
      issues: [issue("unknownId", rowNumber, { value: id })],
    };
  }
  const entity = typeText === "item" ? context.itemById.get(id) : context.spaceById.get(id);
  if (!entity) {
    return {
      ...base,
      status: "rejected",
      updates: [],
      issues: [issue("unknownId", rowNumber, { value: id })],
    };
  }
  const extra = raw.slice(context.headers.length);
  if (extra.some((cell) => cell.trim() !== "")) {
    return {
      ...base,
      status: "rejected",
      updates: [],
      issues: [issue("extraCells", rowNumber)],
    };
  }

  const updates: ScheduleCsvRow["updates"] = [];
  for (const column of context.columns) {
    if (column.readOnly || column.index >= raw.length) continue;
    const cell = unguardCsvText(raw[column.index] ?? "");
    const before = current.values[column.field]?.text ?? "";
    if (column.custom) {
      const field = column.custom;
      const stored = (entity.custom ?? {})[field.id];
      const parsed = parseCustomCsvValue(field, cell, context.delimiter);
      if ("problem" in parsed) {
        issues.push(
          issue("invalidValue", rowNumber, {
            field: column.field,
            label: column.label,
            value: cell,
            reason: parsed.problem,
          }),
        );
        continue;
      }
      if (sameCustomValue(stored, parsed.value)) continue;
      updates.push({
        field: column.field,
        label: column.label,
        before: customDisplay(field, stored),
        after: cell,
        kind: "custom",
        value: parsed.value,
      });
      continue;
    }

    const trimmed = cell.trim();
    const next = trimmed || null;
    if (column.field === "name" && typeText === "space" && next === null) {
      issues.push(
        issue("invalidValue", rowNumber, {
          field: column.field,
          label: column.label,
          value: "",
          reason: "required",
        }),
      );
      continue;
    }
    const stored = rawText(entity, typeText, column.field);
    if (cell === before || next === (stored || null)) continue;
    updates.push({
      field: column.field,
      label: column.label,
      before,
      after: cell,
      kind: "builtIn",
      value: next,
    });
  }

  if (issues.length) {
    return { ...base, status: "rejected", updates: [], issues };
  }
  return {
    ...base,
    status: updates.length ? "changed" : "unchanged",
    updates,
    issues: [],
  };
}
