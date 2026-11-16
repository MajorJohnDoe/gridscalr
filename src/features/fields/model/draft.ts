import {
  FIELD_DESCRIPTION_MAX_LENGTH,
  FIELD_KEY_PATTERN,
  FIELD_LABEL_MAX_LENGTH,
  FIELD_MAX_COUNT,
  FIELD_TEXT_MAX_LENGTH,
  fieldHasOptions,
  isCustomValueForField,
} from "../../../model/fields";
import type {
  CustomValue,
  FieldAppliesTo,
  FieldDefinition,
  FieldOption,
  FieldScope,
  FieldType,
  Project,
} from "../../../model/types";
import {
  EDITABLE_FIELD_SCOPES,
  FIELD_UNIT_MAX_LENGTH,
  enumOptionValueCount,
  fieldValueCount,
  fieldsForScope,
  projectField,
} from "./fieldRules";
import type { FieldProblem } from "./problems";

/** Field-draft validation and the four project mutations the editor needs. */

export interface FieldDraft {
  id?: string;
  scope: FieldScope;
  key: string;
  label: string;
  type: FieldType;
  unit: string;
  description: string;
  required: boolean;
  options: FieldOption[];
  defaultRaw: CustomValue | undefined;
  min: string;
  max: string;
  maxLength: string;
  appliesTo: FieldAppliesTo;
}

function numberOrNull(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** A draft with an empty default value and no applies-to selections. */
export function emptyFieldDraft(scope: FieldScope = "measurement"): FieldDraft {
  return {
    scope,
    key: "",
    label: "",
    type: "text",
    unit: "",
    description: "",
    required: false,
    options: [],
    defaultRaw: undefined,
    min: "",
    max: "",
    maxLength: "",
    appliesTo: {},
  };
}

/** Turns a stored field into an editable draft without losing its id. */
export function fieldDraftFor(field: FieldDefinition): FieldDraft {
  return {
    id: field.id,
    scope: field.scope,
    key: field.key,
    label: field.label,
    type: field.type,
    unit: field.unit ?? "",
    description: field.description ?? "",
    required: field.required === true,
    options: (field.options ?? []).map((option) => ({ ...option })),
    defaultRaw: field.defaultValue,
    min: field.validation?.min === undefined ? "" : String(field.validation.min),
    max: field.validation?.max === undefined ? "" : String(field.validation.max),
    maxLength: field.validation?.maxLength === undefined ? "" : String(field.validation.maxLength),
    appliesTo: {
      ...(field.appliesTo?.itemKinds ? { itemKinds: [...field.appliesTo.itemKinds] } : {}),
      ...(field.appliesTo?.categoryIds ? { categoryIds: [...field.appliesTo.categoryIds] } : {}),
      ...(field.appliesTo?.countTypes ? { countTypes: [...field.appliesTo.countTypes] } : {}),
      ...(field.appliesTo?.spaceKinds ? { spaceKinds: [...field.appliesTo.spaceKinds] } : {}),
    },
  };
}

function keyExists(
  project: Pick<Project, "fieldDefinitions">,
  draft: FieldDraft,
  key: string,
): boolean {
  return project.fieldDefinitions.some(
    (field) => field.scope === draft.scope && field.key === key && field.id !== draft.id,
  );
}

function draftField(draft: FieldDraft): FieldDefinition {
  const field: FieldDefinition = {
    id: draft.id ?? "draft",
    key: draft.key.trim(),
    label: draft.label.trim(),
    type: draft.type,
    scope: draft.scope,
    order: 0,
  };
  if (draft.type === "unitNumber" && draft.unit.trim()) field.unit = draft.unit.trim();
  if (fieldHasOptions(draft)) {
    field.options = draft.options.map((option) => ({
      id: option.id,
      label: option.label.trim(),
    }));
  }
  if (draft.required) field.required = true;
  if (draft.description.trim()) field.description = draft.description.trim();
  if (draft.defaultRaw !== undefined) field.defaultValue = draft.defaultRaw;
  return field;
}

function validationProblems(draft: FieldDraft): FieldProblem[] {
  const problems: FieldProblem[] = [];
  if (draft.type === "number" || draft.type === "unitNumber") {
    const min = numberOrNull(draft.min);
    const max = numberOrNull(draft.max);
    if (draft.min.trim() && min === null) problems.push({ code: "minInvalid", property: "min" });
    if (draft.max.trim() && max === null) problems.push({ code: "maxInvalid", property: "max" });
    if (min !== null && max !== null && min > max) {
      problems.push({ code: "minInvalid", property: "min" });
    }
  }
  if (draft.type === "text" && draft.maxLength.trim()) {
    const limit = numberOrNull(draft.maxLength);
    if (limit === null || limit < 1 || limit > FIELD_TEXT_MAX_LENGTH || !Number.isInteger(limit)) {
      problems.push({ code: "maxLengthInvalid", property: "maxLength" });
    }
  }
  return problems;
}

/** Every problem in a field draft, in display order. */
export function validateFieldDraft(
  project: Pick<Project, "fieldDefinitions" | "layers" | "spaces">,
  draft: FieldDraft,
): FieldProblem[] {
  const problems: FieldProblem[] = [];
  const existing = draft.id ? projectField(project, draft.id) : undefined;
  if (draft.id && !existing) return [{ code: "fieldNotFound" }];

  if (!draft.label.trim()) problems.push({ code: "labelRequired", property: "label" });
  if (draft.label.trim().length > FIELD_LABEL_MAX_LENGTH) {
    problems.push({ code: "labelTooLong", property: "label" });
  }

  const key = draft.key.trim();
  if (!key) problems.push({ code: "keyRequired", property: "key" });
  else if (!FIELD_KEY_PATTERN.test(key)) problems.push({ code: "keyInvalid", property: "key" });
  else if (keyExists(project, draft, key)) problems.push({ code: "keyExists", property: "key" });

  if (existing) {
    if (key !== existing.key) problems.push({ code: "keyLocked", property: "key" });
    if (draft.scope !== existing.scope) problems.push({ code: "scopeLocked", property: "scope" });
    if (draft.type !== existing.type) {
      const usage = fieldValueCount(project, existing.id);
      if (usage.total > 0) {
        problems.push({ code: "typeLocked", property: "type", count: usage.total });
      }
    }
    if (fieldHasOptions(existing)) {
      const kept = new Set(draft.options.map((option) => option.id));
      for (const option of existing.options ?? []) {
        if (kept.has(option.id)) continue;
        const count = enumOptionValueCount(project, existing.id, option.id);
        if (count > 0) {
          problems.push({ code: "optionInUse", property: "options", count, name: option.label });
        }
      }
    }
  } else if (project.fieldDefinitions.length >= FIELD_MAX_COUNT) {
    problems.push({ code: "tooManyFields" });
  }

  if (fieldHasOptions(draft)) {
    if (!draft.options.length) problems.push({ code: "optionsRequired", property: "options" });
    if (draft.options.some((option) => !option.label.trim())) {
      problems.push({ code: "optionLabelRequired", property: "options" });
    }
  }

  if (draft.type === "unitNumber" && draft.unit.trim().length > FIELD_UNIT_MAX_LENGTH) {
    problems.push({ code: "unitTooLong", property: "unit" });
  }
  if (draft.description.trim().length > FIELD_DESCRIPTION_MAX_LENGTH) {
    problems.push({ code: "descriptionTooLong", property: "description" });
  }

  problems.push(...validationProblems(draft));

  if (draft.defaultRaw !== undefined) {
    if (!isCustomValueForField(draft.defaultRaw, draftField(draft))) {
      problems.push({ code: "defaultInvalid", property: "defaultRaw" });
    }
  }
  return problems;
}

function applyValidation(field: FieldDefinition, draft: FieldDraft): void {
  const validation: NonNullable<FieldDefinition["validation"]> = {};
  if (draft.type === "number" || draft.type === "unitNumber") {
    const min = numberOrNull(draft.min);
    const max = numberOrNull(draft.max);
    if (min !== null) validation.min = min;
    if (max !== null) validation.max = max;
  }
  if (draft.type === "text") {
    const limit = numberOrNull(draft.maxLength);
    if (limit !== null) validation.maxLength = limit;
  }
  if (Object.keys(validation).length) field.validation = validation;
  else delete field.validation;

  const applies: FieldAppliesTo = {};
  const strings = (values: readonly string[] | undefined) =>
    values?.filter((value) => typeof value === "string" && value.trim()) ?? [];
  if (draft.scope === "measurement") {
    const itemKinds = strings(draft.appliesTo.itemKinds);
    if (itemKinds.length) applies.itemKinds = itemKinds as FieldAppliesTo["itemKinds"];
    const categoryIds = strings(draft.appliesTo.categoryIds);
    if (categoryIds.length) applies.categoryIds = [...new Set(categoryIds)];
    const countTypes = strings(draft.appliesTo.countTypes);
    if (countTypes.length) applies.countTypes = [...new Set(countTypes)];
  } else {
    const spaceKinds = strings(draft.appliesTo.spaceKinds);
    if (spaceKinds.length) applies.spaceKinds = spaceKinds as FieldAppliesTo["spaceKinds"];
  }
  if (Object.keys(applies).length) field.appliesTo = applies;
  else delete field.appliesTo;
}

export interface CreateFieldResult {
  field?: FieldDefinition;
  problems: FieldProblem[];
}

/** Adds a field after the last field in its scope. Call inside one mutation. */
export function createField(project: Project, draft: FieldDraft, id: string): CreateFieldResult {
  const problems = validateFieldDraft(project, draft);
  if (problems.length) return { problems };
  const order = fieldsForScope(project, draft.scope).reduce(
    (max, field) => Math.max(max, field.order),
    -1,
  );
  const field: FieldDefinition = {
    id,
    key: draft.key.trim(),
    label: draft.label.trim(),
    type: draft.type,
    scope: draft.scope,
    order: order + 1,
  };
  if (draft.type === "unitNumber" && draft.unit.trim()) field.unit = draft.unit.trim();
  if (fieldHasOptions(draft)) {
    field.options = draft.options.map((option) => ({
      id: option.id,
      label: option.label.trim(),
    }));
  }
  if (draft.required) field.required = true;
  if (draft.description.trim()) field.description = draft.description.trim();
  applyValidation(field, draft);
  if (draft.defaultRaw !== undefined) field.defaultValue = draft.defaultRaw;
  project.fieldDefinitions.push(field);
  return { field, problems };
}

/** Applies an edited draft. Key, scope and an in-use type are protected. */
export function updateField(project: Project, draft: FieldDraft): FieldProblem[] {
  const problems = validateFieldDraft(project, draft);
  if (problems.length) return problems;
  const field = draft.id ? projectField(project, draft.id) : undefined;
  if (!field) return [{ code: "fieldNotFound" }];
  field.label = draft.label.trim();
  field.type = draft.type;
  if (draft.type === "unitNumber" && draft.unit.trim()) field.unit = draft.unit.trim();
  else delete field.unit;
  if (fieldHasOptions(draft)) {
    field.options = draft.options.map((option) => ({
      id: option.id,
      label: option.label.trim(),
    }));
  } else {
    delete field.options;
  }
  if (draft.required) field.required = true;
  else delete field.required;
  if (draft.description.trim()) field.description = draft.description.trim();
  else delete field.description;
  applyValidation(field, draft);
  if (draft.defaultRaw !== undefined) field.defaultValue = draft.defaultRaw;
  else delete field.defaultValue;
  return [];
}

export interface DeleteFieldResult {
  removed: boolean;
  clearedItems: number;
  clearedSpaces: number;
  removedFromSets: number;
}

/**
 * Removes a field, every stored value it owns and its field-set memberships in
 * one pass so the caller can commit the whole deletion as one undo step.
 */
export function deleteField(project: Project, fieldId: string): DeleteFieldResult {
  const index = project.fieldDefinitions.findIndex((field) => field.id === fieldId);
  if (index < 0) return { removed: false, clearedItems: 0, clearedSpaces: 0, removedFromSets: 0 };
  project.fieldDefinitions.splice(index, 1);

  let clearedItems = 0;
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (!item.custom || !(fieldId in item.custom)) continue;
      delete item.custom[fieldId];
      clearedItems += 1;
      if (!Object.keys(item.custom).length) delete item.custom;
    }
  }

  let clearedSpaces = 0;
  for (const space of project.spaces) {
    if (!space.custom || !(fieldId in space.custom)) continue;
    delete space.custom[fieldId];
    clearedSpaces += 1;
    if (!Object.keys(space.custom).length) delete space.custom;
  }

  let removedFromSets = 0;
  for (const set of project.fieldSets) {
    if (!set.fieldIds.includes(fieldId)) continue;
    set.fieldIds = set.fieldIds.filter((id) => id !== fieldId);
    removedFromSets += 1;
  }

  // Keep the visible order dense after a delete.
  for (const scope of EDITABLE_FIELD_SCOPES) {
    fieldsForScope(project, scope).forEach((field, order) => {
      field.order = order;
    });
  }
  return { removed: true, clearedItems, clearedSpaces, removedFromSets };
}

/** Moves a field up or down inside its scope and rewrites the order densely. */
export function moveField(
  project: Pick<Project, "fieldDefinitions">,
  fieldId: string,
  direction: -1 | 1,
): boolean {
  const field = projectField(project, fieldId);
  if (!field) return false;
  const scopeFields = fieldsForScope(project, field.scope);
  const index = scopeFields.findIndex((entry) => entry.id === fieldId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= scopeFields.length) return false;
  const [moved] = scopeFields.splice(index, 1);
  scopeFields.splice(target, 0, moved);
  scopeFields.forEach((entry, order) => {
    entry.order = order;
  });
  return true;
}
