import {
  FIELD_DESCRIPTION_MAX_LENGTH,
  FIELD_KEY_MAX_LENGTH,
  FIELD_KEY_PATTERN,
  FIELD_LABEL_MAX_LENGTH,
  FIELD_MAX_COUNT,
  FIELD_TEXT_MAX_LENGTH,
  fieldHasOptions,
  isFieldScope,
  isFieldType,
  normalizeCustomValue,
} from "../../model/fields";
import { isSpaceKind } from "../../model/spaces";
import type {
  CustomValue,
  FieldAppliesTo,
  FieldDefinition,
  FieldOption,
  FieldScope,
  FieldSet,
  FieldValidation,
} from "../../model/types";
import { ITEM_KINDS, uniqueId } from "./shared";

/**
 * Custom-field normalization. Unknown ids or mismatched values are reported and
 * omitted; a value is never coerced into another type.
 */

function normalizeOptions(value: unknown, report?: (code: string) => void): FieldOption[] {
  if (!Array.isArray(value)) return [];
  const options: FieldOption[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      report?.("droppedFieldOption");
      continue;
    }
    const raw = entry as Partial<FieldOption>;
    const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 80) : "";
    const label =
      typeof raw.label === "string" ? raw.label.trim().slice(0, FIELD_LABEL_MAX_LENGTH) : "";
    if (!id || !label || ids.has(id)) {
      report?.("droppedFieldOption");
      continue;
    }
    ids.add(id);
    options.push({ id, label });
  }
  return options;
}

function normalizeValidation(value: unknown): FieldValidation | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Partial<FieldValidation>;
  const validation: FieldValidation = {};
  if (typeof raw.min === "number" && Number.isFinite(raw.min)) validation.min = raw.min;
  if (typeof raw.max === "number" && Number.isFinite(raw.max)) validation.max = raw.max;
  if (typeof raw.maxLength === "number" && Number.isFinite(raw.maxLength)) {
    validation.maxLength = Math.max(1, Math.min(FIELD_TEXT_MAX_LENGTH, Math.round(raw.maxLength)));
  }
  return Object.keys(validation).length ? validation : undefined;
}

function normalizeAppliesTo(value: unknown): FieldAppliesTo | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as FieldAppliesTo;
  const applies: FieldAppliesTo = {};
  const strings = (candidate: unknown): string[] => {
    if (!Array.isArray(candidate)) return [];
    const seen = new Set<string>();
    for (const entry of candidate) {
      if (typeof entry !== "string" || !entry.trim()) continue;
      seen.add(entry.trim().slice(0, 120));
    }
    return [...seen];
  };
  const itemKinds = strings(raw.itemKinds).filter((kind) =>
    (ITEM_KINDS as ReadonlySet<string>).has(kind),
  );
  if (itemKinds.length) applies.itemKinds = itemKinds as FieldAppliesTo["itemKinds"];
  const categoryIds = strings(raw.categoryIds);
  if (categoryIds.length) applies.categoryIds = categoryIds;
  const countTypes = strings(raw.countTypes);
  if (countTypes.length) applies.countTypes = countTypes;
  const spaceKinds = strings(raw.spaceKinds).filter(isSpaceKind);
  if (spaceKinds.length) applies.spaceKinds = spaceKinds;
  return Object.keys(applies).length ? applies : undefined;
}

function normalizeDefault(
  value: unknown,
  field: Pick<FieldDefinition, "type" | "options" | "validation">,
  report?: (code: string) => void,
): CustomValue | undefined {
  const result = normalizeCustomValue(value, field);
  if (result.invalid) {
    report?.("droppedCustomValue");
    return undefined;
  }
  if (result.repaired) report?.("repairedCustomValue");
  return result.value;
}

export function normalizeFieldDefinitions(
  value: unknown,
  report?: (code: string) => void,
): FieldDefinition[] {
  if (!Array.isArray(value)) return [];
  const fields: FieldDefinition[] = [];
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const entry of value.slice(0, FIELD_MAX_COUNT)) {
    if (typeof entry !== "object" || entry === null) {
      report?.("droppedFieldDefinition");
      continue;
    }
    const raw = entry as Partial<FieldDefinition>;
    const rawId = typeof raw.id === "string" ? raw.id.trim().slice(0, 120) : "";
    const key = typeof raw.key === "string" ? raw.key.trim().slice(0, FIELD_KEY_MAX_LENGTH) : "";
    const label =
      typeof raw.label === "string" ? raw.label.trim().slice(0, FIELD_LABEL_MAX_LENGTH) : "";
    if (!rawId || !key || !label || !FIELD_KEY_PATTERN.test(key)) {
      report?.("droppedFieldDefinition");
      continue;
    }
    if (!isFieldType(raw.type) || !isFieldScope(raw.scope)) {
      report?.("droppedFieldDefinition");
      continue;
    }
    if (keys.has(`${raw.scope}:${key}`)) {
      // `key` is immutable and must be unique per scope; renaming it would
      // change what a CSV header means, so the duplicate entry is reported.
      report?.("droppedFieldDefinition");
      continue;
    }
    const options = fieldHasOptions(raw) ? normalizeOptions(raw.options, report) : [];
    if (fieldHasOptions(raw) && !options.length) {
      report?.("droppedFieldDefinition");
      continue;
    }
    keys.add(`${raw.scope}:${key}`);
    const id = uniqueId(rawId, ids);
    const order =
      typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : fields.length;
    const field: FieldDefinition = {
      id,
      key,
      label,
      type: raw.type,
      scope: raw.scope,
      order,
    };
    if (raw.type === "unitNumber" && typeof raw.unit === "string" && raw.unit.trim()) {
      field.unit = raw.unit.trim().slice(0, 40);
    }
    if (options.length) field.options = options;
    if (raw.required === true) field.required = true;
    if (raw.defaultValue !== undefined) {
      const fallback = normalizeDefault(raw.defaultValue, field, report);
      if (fallback !== undefined) field.defaultValue = fallback;
    }
    if (typeof raw.description === "string" && raw.description.trim()) {
      field.description = raw.description.trim().slice(0, FIELD_DESCRIPTION_MAX_LENGTH);
    }
    const appliesTo = normalizeAppliesTo(raw.appliesTo);
    if (appliesTo) field.appliesTo = appliesTo;
    const validation = normalizeValidation(raw.validation);
    if (validation) field.validation = validation;
    fields.push(field);
  }
  return fields
    .map((field, index) => ({ field, index }))
    .sort((left, right) => left.field.order - right.field.order || left.index - right.index)
    .map((entry) => entry.field);
}

export function normalizeFieldSets(
  value: unknown,
  fields: readonly FieldDefinition[],
  report?: (code: string) => void,
): FieldSet[] {
  if (!Array.isArray(value)) return [];
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const sets: FieldSet[] = [];
  const ids = new Set<string>();
  for (const entry of value.slice(0, FIELD_MAX_COUNT)) {
    if (typeof entry !== "object" || entry === null) {
      report?.("droppedFieldSet");
      continue;
    }
    const raw = entry as Partial<FieldSet>;
    const rawId = typeof raw.id === "string" ? raw.id.trim().slice(0, 120) : "";
    const name =
      typeof raw.name === "string" ? raw.name.trim().slice(0, FIELD_LABEL_MAX_LENGTH) : "";
    if (!rawId || !name || !isFieldScope(raw.scope)) {
      report?.("droppedFieldSet");
      continue;
    }
    const fieldIds: string[] = [];
    const seen = new Set<string>();
    if (Array.isArray(raw.fieldIds)) {
      for (const fieldId of raw.fieldIds) {
        if (typeof fieldId !== "string" || !fieldId.trim()) {
          report?.("droppedFieldSetField");
          continue;
        }
        const id = fieldId.trim();
        if (seen.has(id)) {
          report?.("repairedFieldSetField");
          continue;
        }
        if (fieldById.get(id)?.scope !== raw.scope) {
          // A field in another scope cannot be applied here. The reference is
          // reported rather than silently moved into the set.
          report?.("droppedFieldSetField");
          continue;
        }
        seen.add(id);
        fieldIds.push(id);
      }
    }
    const set: FieldSet = { id: uniqueId(rawId, ids), name, scope: raw.scope, fieldIds };
    if (typeof raw.description === "string" && raw.description.trim()) {
      set.description = raw.description.trim().slice(0, FIELD_DESCRIPTION_MAX_LENGTH);
    }
    sets.push(set);
  }
  return sets;
}

/** All values valid for a field in the given scope, or undefined when empty. */
export function normalizeCustomValues(
  value: unknown,
  fields: readonly FieldDefinition[],
  scope: FieldScope,
  report?: (code: string) => void,
): Record<string, CustomValue> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const fieldsById = new Map(
    fields.filter((field) => field.scope === scope).map((field) => [field.id, field]),
  );
  const custom: Record<string, CustomValue> = {};
  let keys = 0;
  for (const [id, rawValue] of Object.entries(value)) {
    if (keys >= FIELD_MAX_COUNT) break;
    const field = fieldsById.get(id);
    if (!field) {
      report?.("droppedCustomValue");
      continue;
    }
    const result = normalizeCustomValue(rawValue, field);
    if (result.invalid) {
      report?.("droppedCustomValue");
      continue;
    }
    if (result.repaired) report?.("repairedCustomValue");
    if (result.value === undefined) continue;
    custom[id] = result.value;
    keys += 1;
  }
  return keys ? custom : undefined;
}
