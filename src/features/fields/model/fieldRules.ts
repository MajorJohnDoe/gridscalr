import {
  CUSTOM_FIELD_PREFIX,
  FIELD_TEXT_MAX_LENGTH,
  isCustomValueForField,
} from "../../../model/fields";
import type {
  CustomValue,
  FieldDefinition,
  FieldScope,
  MarkupItem,
  Project,
  Space,
} from "../../../model/types";

/**
 * Pure custom-field lookup, `appliesTo` evaluation, usage counting and typed
 * value coercion. Nothing here imports UI, so the same rules can back a future
 * CSV import or schedule column. An unknown field id or mismatched value is
 * reported; it is never reinterpreted as another type.
 */

/** Scopes that can be edited and used in this slice. */
export const EDITABLE_FIELD_SCOPES: readonly FieldScope[] = ["measurement", "space"];

export const FIELD_UNIT_MAX_LENGTH = 40;

export interface FieldUsage {
  itemCount: number;
  spaceCount: number;
  total: number;
}

/** Fields in one scope in their saved order. */
export function fieldsForScope(
  project: Pick<Project, "fieldDefinitions">,
  scope: FieldScope,
): FieldDefinition[] {
  return project.fieldDefinitions
    .map((field, index) => ({ field, index }))
    .filter((entry) => entry.field.scope === scope)
    .sort((left, right) => left.field.order - right.field.order || left.index - right.index)
    .map((entry) => entry.field);
}

export function projectField(
  project: Pick<Project, "fieldDefinitions">,
  fieldId: string,
): FieldDefinition | undefined {
  return project.fieldDefinitions.find((field) => field.id === fieldId);
}

/**
 * Strict `appliesTo` rule for a measurement. A configured category or count
 * type that the item does not carry excludes the field; it never defaults to
 * "applies" just because the attribute is absent.
 */
export function fieldAppliesToItem(field: FieldDefinition, item: MarkupItem): boolean {
  if (field.scope !== "measurement") return false;
  const applies = field.appliesTo;
  if (!applies) return true;
  if (applies.itemKinds?.length && !applies.itemKinds.includes(item.kind)) return false;
  if (
    applies.categoryIds?.length &&
    (!item.categoryId || !applies.categoryIds.includes(item.categoryId))
  ) {
    return false;
  }
  if (
    applies.countTypes?.length &&
    (!item.countType || !applies.countTypes.includes(item.countType))
  ) {
    return false;
  }
  return true;
}

/** Measurement fields shown for one selected item, in saved order. */
export function applicableFields(
  project: Pick<Project, "fieldDefinitions">,
  item: MarkupItem,
): FieldDefinition[] {
  return fieldsForScope(project, "measurement").filter((field) => fieldAppliesToItem(field, item));
}

/**
 * Strict `appliesTo` rule for a space: a configured space kind that the space
 * does not have excludes the field.
 */
export function fieldAppliesToSpace(field: FieldDefinition, space: Pick<Space, "kind">): boolean {
  if (field.scope !== "space") return false;
  const applies = field.appliesTo;
  if (!applies) return true;
  if (applies.spaceKinds?.length && !applies.spaceKinds.includes(space.kind)) return false;
  return true;
}

/** Space fields shown for one space, in saved order. */
export function applicableSpaceFields(
  project: Pick<Project, "fieldDefinitions">,
  space: Pick<Space, "kind">,
): FieldDefinition[] {
  return fieldsForScope(project, "space").filter((field) => fieldAppliesToSpace(field, space));
}

function hasValue(value: CustomValue | undefined): boolean {
  return value !== undefined && value !== null;
}

/**
 * How many stored values a field owns. Hidden items and hidden layers still
 * own their values; deletion and type changes must not ignore them.
 */
export function fieldValueCount(
  project: Pick<Project, "layers" | "spaces">,
  fieldId: string,
): FieldUsage {
  let itemCount = 0;
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (hasValue(item.custom?.[fieldId])) itemCount += 1;
    }
  }
  let spaceCount = 0;
  for (const space of project.spaces) {
    if (hasValue(space.custom?.[fieldId])) spaceCount += 1;
  }
  return { itemCount, spaceCount, total: itemCount + spaceCount };
}

function valueUsesOption(value: CustomValue | undefined, optionId: string): boolean {
  if (typeof value === "string") return value === optionId;
  if (Array.isArray(value)) return value.includes(optionId);
  return false;
}

/** Values that use one enum option, across every scope the field can own. */
export function enumOptionValueCount(
  project: Pick<Project, "layers" | "spaces">,
  fieldId: string,
  optionId: string,
): number {
  let count = 0;
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (valueUsesOption(item.custom?.[fieldId], optionId)) count += 1;
    }
  }
  for (const space of project.spaces) {
    if (valueUsesOption(space.custom?.[fieldId], optionId)) count += 1;
  }
  return count;
}

/** The stored value for one field, or undefined when it is not set. */
export function itemCustomValue(item: MarkupItem, fieldId: string): CustomValue | undefined {
  return item.custom?.[fieldId];
}

export type FieldInputProblem =
  | "notANumber"
  | "belowMin"
  | "aboveMax"
  | "tooLong"
  | "notADate"
  | "unknownOption"
  | "invalidValue";

export interface FieldInputResult {
  /** Set when the input is valid; absent when it is cleared or invalid. */
  value?: CustomValue;
  /** Set when the input cannot be stored; callers show it and store nothing. */
  problem?: FieldInputProblem;
}

/** A stored value that does not match its field is reported, never changed. */
export function storedValueProblem(
  field: FieldDefinition,
  value: CustomValue | undefined,
): FieldInputProblem | null {
  if (!hasValue(value)) return null;
  return isCustomValueForField(value, field) ? null : "invalidValue";
}

function optionIds(field: Pick<FieldDefinition, "options">): Set<string> {
  return new Set((field.options ?? []).map((option) => option.id));
}

/**
 * Turns raw editor input into a stored custom value. Text is trimmed, empty
 * input clears the value, and every branch ends with the shared field rule so
 * the editor cannot drift from the project normalizer.
 */
export function coerceFieldInput(
  field: FieldDefinition,
  input: string | boolean | string[] | null | undefined,
): FieldInputResult {
  if (input === null || input === undefined) return {};
  let value: CustomValue;
  switch (field.type) {
    case "text": {
      const text = typeof input === "string" ? input.trim() : String(input).trim();
      if (!text) return {};
      const maxLength = field.validation?.maxLength ?? FIELD_TEXT_MAX_LENGTH;
      if (text.length > maxLength) return { problem: "tooLong" };
      value = text;
      break;
    }
    case "number":
    case "unitNumber": {
      const raw = typeof input === "string" ? input.trim() : "";
      if (!raw) return {};
      const number = Number(raw);
      if (!Number.isFinite(number)) return { problem: "notANumber" };
      if (field.validation?.min !== undefined && number < field.validation.min) {
        return { problem: "belowMin" };
      }
      if (field.validation?.max !== undefined && number > field.validation.max) {
        return { problem: "aboveMax" };
      }
      value = number;
      break;
    }
    case "boolean":
      if (typeof input !== "boolean") return { problem: "invalidValue" };
      value = input;
      break;
    case "date": {
      const text = typeof input === "string" ? input.trim() : "";
      if (!text) return {};
      if (Number.isNaN(Date.parse(text))) return { problem: "notADate" };
      value = text;
      break;
    }
    case "enum": {
      const id = typeof input === "string" ? input : "";
      if (!id) return {};
      if (!optionIds(field).has(id)) return { problem: "unknownOption" };
      value = id;
      break;
    }
    case "multiEnum": {
      if (!Array.isArray(input)) return { problem: "invalidValue" };
      const known = optionIds(field);
      if (input.some((id) => !known.has(id))) return { problem: "unknownOption" };
      const selected = new Set(input);
      const ordered = (field.options ?? [])
        .filter((option) => selected.has(option.id))
        .map((option) => option.id);
      if (!ordered.length) return {};
      value = ordered;
      break;
    }
    default:
      return { problem: "invalidValue" };
  }
  return isCustomValueForField(value, field) ? { value } : { problem: "invalidValue" };
}

/** Display and export mapping: enum ids become labels, numbers stay text. */
export function customValueText(
  field: Pick<FieldDefinition, "type" | "options">,
  value: CustomValue | undefined,
): string {
  if (!hasValue(value)) return "";
  const labelFor = (id: string) => field.options?.find((option) => option.id === id)?.label ?? id;
  switch (field.type) {
    case "enum":
      return typeof value === "string" ? labelFor(value) : "";
    case "multiEnum":
      return Array.isArray(value) ? value.map(labelFor).join(", ") : "";
    case "boolean":
      return typeof value === "boolean" ? (value ? "true" : "false") : "";
    case "number":
    case "unitNumber":
      return typeof value === "number" ? String(value) : "";
    case "date":
    case "text":
      return typeof value === "string" ? value : "";
    default:
      return "";
  }
}

/** Stable schedule and CSV reference for a custom field. */
export function customFieldRef(field: Pick<FieldDefinition, "id">): string {
  return `${CUSTOM_FIELD_PREFIX}${field.id}`;
}
