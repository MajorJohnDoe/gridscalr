import type { CustomValue, FieldDefinition, FieldScope, FieldType } from "./types";

/**
 * Pure custom-field rules shared by the project-file normalizer, the integrity
 * validator and the later field editor. Nothing here reads or writes a project:
 * a value is accepted only when it already matches the field definition.
 */

export const FIELD_SCOPES: readonly FieldScope[] = [
  "measurement",
  "space",
  "asset",
  "issue",
  "inspection",
  "document",
];

export const FIELD_TYPES: readonly FieldType[] = [
  "text",
  "number",
  "unitNumber",
  "boolean",
  "date",
  "enum",
  "multiEnum",
];

/** Keys are stable, human-readable slugs. */
export const FIELD_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
export const FIELD_KEY_MAX_LENGTH = 80;
export const FIELD_LABEL_MAX_LENGTH = 120;
export const FIELD_DESCRIPTION_MAX_LENGTH = 500;
export const FIELD_TEXT_MAX_LENGTH = 2000;
export const FIELD_MAX_COUNT = 500;
export const CUSTOM_FIELD_PREFIX = "custom:";

export function isFieldScope(value: unknown): value is FieldScope {
  return typeof value === "string" && (FIELD_SCOPES as readonly string[]).includes(value);
}

export function isFieldType(value: unknown): value is FieldType {
  return typeof value === "string" && (FIELD_TYPES as readonly string[]).includes(value);
}

export function fieldHasOptions(field: { type?: FieldType }): boolean {
  return field.type === "enum" || field.type === "multiEnum";
}

function optionIds(field: Pick<FieldDefinition, "options">): ReadonlySet<string> {
  return new Set((field.options ?? []).map((option) => option.id));
}

function withinBounds(value: number, field: Pick<FieldDefinition, "validation">): boolean {
  const min = field.validation?.min;
  const max = field.validation?.max;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

function isDateText(value: string): boolean {
  return value.length > 0 && !Number.isNaN(Date.parse(value));
}

/**
 * Whether a stored value is valid for a field. `null` is "not set" and is
 * rejected here; callers omit it instead of storing it.
 */
export function isCustomValueForField(
  value: unknown,
  field: Pick<FieldDefinition, "type" | "options" | "validation">,
): value is CustomValue {
  if (value === null) return false;
  switch (field.type) {
    case "text": {
      if (typeof value !== "string") return false;
      const maxLength = field.validation?.maxLength ?? FIELD_TEXT_MAX_LENGTH;
      return value.length <= maxLength;
    }
    case "number":
    case "unitNumber":
      return typeof value === "number" && Number.isFinite(value) && withinBounds(value, field);
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && isDateText(value);
    case "enum": {
      if (typeof value !== "string") return false;
      return optionIds(field).has(value);
    }
    case "multiEnum": {
      if (!Array.isArray(value)) return false;
      const ids = optionIds(field);
      return value.every((entry) => typeof entry === "string" && ids.has(entry));
    }
    default:
      return false;
  }
}

export interface CustomValueNormalization {
  /** Set when the value is valid; absent when it is cleared or invalid. */
  value?: CustomValue;
  /** True when a valid value was changed deterministically, such as deduped ids. */
  repaired?: boolean;
  /** True when the value does not match the field. Callers report and omit it. */
  invalid?: boolean;
}

/**
 * Validates one raw value against a field without inventing a value.
 *
 * `null` and `undefined` clear the value. A valid multi-enum keeps its order and
 * drops repeated option ids; that is the only deterministic repair.
 */
export function normalizeCustomValue(
  value: unknown,
  field: Pick<FieldDefinition, "type" | "options" | "validation">,
): CustomValueNormalization {
  if (value === null || value === undefined) return {};
  if (!isCustomValueForField(value, field)) return { invalid: true };
  if (field.type === "multiEnum" && Array.isArray(value)) {
    const unique = [...new Set(value)];
    return unique.length === value.length ? { value: unique } : { value: unique, repaired: true };
  }
  return { value: value as CustomValue };
}

/** True when an item kind or space kind is allowed by a field's `appliesTo`. */
export function fieldAppliesToValue(
  field: Pick<FieldDefinition, "scope" | "appliesTo">,
  value: { itemKind?: string; categoryId?: string; countType?: string; spaceKind?: string },
): boolean {
  const applies = field.appliesTo;
  if (!applies) return true;
  if (
    value.itemKind &&
    applies.itemKinds?.length &&
    !(applies.itemKinds as readonly string[]).includes(value.itemKind)
  ) {
    return false;
  }
  if (
    value.categoryId &&
    applies.categoryIds?.length &&
    !applies.categoryIds.includes(value.categoryId)
  ) {
    return false;
  }
  if (
    value.countType &&
    applies.countTypes?.length &&
    !applies.countTypes.includes(value.countType)
  ) {
    return false;
  }
  if (
    value.spaceKind &&
    applies.spaceKinds?.length &&
    !(applies.spaceKinds as readonly string[]).includes(value.spaceKind)
  ) {
    return false;
  }
  return true;
}
