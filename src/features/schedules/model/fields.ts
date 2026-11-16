import { translate, t, type MessageKey } from "../../../i18n";
import {
  builtInScheduleFields,
  customFieldIdForRef,
  isCustomFieldRef,
  scheduleFieldRefResolves,
} from "../../../model/schedules";
import type {
  CustomValue,
  FieldDefinition,
  Project,
  ScheduleColumn,
  ScheduleColumnFormat,
  ScheduleDefinition,
  ScheduleFieldRef,
  ScheduleSource,
} from "../../../model/types";
import { customValueText, fieldsForScope, projectField } from "../../fields";
import type { ScheduleColumnView } from "./types";

/**
 * The field catalogue a schedule can name. Built-in keys are code-level names
 * shared with the stored definition; a custom field is `custom:<fieldId>`.
 */

/** Relative table width, in percent, used when a column carries no width. */
const FIELD_WIDTHS: Record<string, number> = {
  id: 12,
  kind: 10,
  label: 22,
  page: 8,
  layer: 14,
  category: 14,
  room: 12,
  space: 14,
  value: 14,
  unit: 8,
  countType: 12,
  countQuantity: 9,
  status: 12,
  tag: 10,
  created: 12,
  modified: 12,
  visible: 8,
  locked: 8,
  number: 10,
  name: 20,
  floor: 12,
  usage: 14,
  area: 12,
  areaSource: 12,
  parent: 14,
};

export interface ScheduleFieldInfo {
  ref: ScheduleFieldRef;
  label: string;
  numeric: boolean;
  format: ScheduleColumnFormat;
  width: number;
  /** Custom field id, or null for a built-in key. */
  fieldId: string | null;
  /** True when no label can be resolved; the caller shows the ref as invalid. */
  invalid: boolean;
}

function builtInLabel(ref: string): string {
  return t(`schedules.field.${ref}` as MessageKey);
}

function fieldInfo(
  ref: string,
  field: FieldDefinition | undefined,
  invalid: boolean,
): ScheduleFieldInfo {
  if (field) {
    const format: ScheduleColumnFormat =
      field.type === "unitNumber"
        ? "unit"
        : field.type === "number"
          ? "number"
          : field.type === "date"
            ? "date"
            : "text";
    return {
      ref,
      label: field.label,
      numeric: field.type === "number" || field.type === "unitNumber",
      format,
      width: 12,
      fieldId: field.id,
      invalid: false,
    };
  }
  return {
    ref,
    label: invalid ? ref : builtInLabel(ref),
    numeric: ref === "value" || ref === "countQuantity" || ref === "area",
    format: ref === "value" || ref === "area" ? "unit" : "text",
    width: FIELD_WIDTHS[ref] ?? 12,
    fieldId: customFieldIdForRef(ref),
    invalid,
  };
}

/** Built-in fields for a source followed by the custom fields of its scope. */
export function scheduleFieldsForSource(
  project: Pick<Project, "fieldDefinitions">,
  source: ScheduleSource,
): ScheduleFieldInfo[] {
  const custom = fieldsForScope(project, source === "spaces" ? "space" : "measurement");
  return [
    ...builtInScheduleFields(source).map((ref) => fieldInfo(ref, undefined, false)),
    ...custom.map((field) => fieldInfo(`custom:${field.id}`, field, false)),
  ];
}

/** One field, resolved or explicitly invalid. Never throws on an unknown ref. */
export function scheduleFieldInfo(
  project: Pick<Project, "fieldDefinitions">,
  source: ScheduleSource,
  ref: string,
): ScheduleFieldInfo {
  if (isCustomFieldRef(ref)) {
    const field = projectField(project, customFieldIdForRef(ref) ?? "");
    const resolves =
      Boolean(field) && field!.scope === (source === "spaces" ? "space" : "measurement");
    return fieldInfo(ref, resolves ? field : undefined, !resolves);
  }
  const known = (builtInScheduleFields(source) as readonly string[]).includes(ref);
  return fieldInfo(ref, undefined, !known);
}

/** Resolved, visible columns in stored order. A hidden column is not rendered. */
export function resolveColumns(
  project: Pick<Project, "fieldDefinitions">,
  definition: Pick<ScheduleDefinition, "source" | "columns">,
): ScheduleColumnView[] {
  return definition.columns
    .filter((column) => column.visible !== false)
    .map((column) => {
      const info = scheduleFieldInfo(project, definition.source, column.field);
      return {
        column,
        field: column.field,
        label: column.label?.trim() || info.label,
        fieldId: info.fieldId,
        invalid: info.invalid,
        numeric: column.format === "number" || column.format === "unit" || info.numeric,
      };
    });
}

/** A new column for a field, with a unique id inside the definition. */
export function makeColumn(
  field: string,
  existing: readonly ScheduleColumn[],
  info?: ScheduleFieldInfo,
): ScheduleColumn {
  const used = new Set(existing.map((column) => column.id));
  let index = existing.length + 1;
  let id = `col_${index}`;
  while (used.has(id)) {
    index += 1;
    id = `col_${index}`;
  }
  return {
    id,
    field,
    visible: true,
    width: info?.width ?? 12,
    format: info?.format ?? "text",
  };
}

/** Stable display value for a custom field, or the raw ref when unresolved. */
export function customCellText(field: FieldDefinition | undefined, value: CustomValue): string {
  if (!field) return "";
  return customValueText(field, value);
}

/** The localized label for a built-in field, used by CSV in a later phase. */
export function builtInFieldLabel(ref: string): string {
  return translate("en", `schedules.field.${ref}` as MessageKey);
}

/** Field references a definition needs even when no column shows them. */
export function scheduleRefs(
  definition: Pick<ScheduleDefinition, "columns" | "groupBy" | "sort" | "totals">,
): string[] {
  const refs = new Set<string>();
  for (const column of definition.columns) if (column.visible !== false) refs.add(column.field);
  if (definition.groupBy) refs.add(definition.groupBy);
  for (const sort of definition.sort ?? []) refs.add(sort.field);
  for (const total of definition.totals ?? []) refs.add(total.field);
  return [...refs];
}

/**
 * Whether a reference resolves for a source. Kept here so the builder, the
 * validator-backed panel and the tests agree on one rule.
 */
export function fieldResolves(
  project: Pick<Project, "fieldDefinitions">,
  source: ScheduleSource,
  ref: string,
): boolean {
  return scheduleFieldRefResolves(ref, source, project.fieldDefinitions);
}
