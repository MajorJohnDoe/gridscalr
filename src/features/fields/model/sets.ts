import { isCustomValueForField } from "../../../model/fields";
import { findItem } from "../../../model/layers";
import type {
  CustomValue,
  FieldDefinition,
  FieldScope,
  FieldSet,
  MarkupItem,
  Project,
} from "../../../model/types";
import { fieldAppliesToItem, fieldsForScope, projectField } from "./fieldRules";
import type { FieldProblem } from "./problems";

/** Field sets: named groups that can fill defaults on a measurement. */

export interface FieldSetDraft {
  id?: string;
  name: string;
  scope: FieldScope;
  description: string;
  fieldIds: string[];
}

export interface FieldSetResult {
  set?: FieldSet;
  problems: FieldProblem[];
}

export function emptyFieldSetDraft(scope: FieldScope = "measurement"): FieldSetDraft {
  return { name: "", scope, description: "", fieldIds: [] };
}

export function fieldSetDraftFor(set: FieldSet): FieldSetDraft {
  return {
    id: set.id,
    name: set.name,
    scope: set.scope,
    description: set.description ?? "",
    fieldIds: [...set.fieldIds],
  };
}

export function fieldSetsForScope(
  project: Pick<Project, "fieldSets">,
  scope: FieldScope,
): FieldSet[] {
  return project.fieldSets.filter((set) => set.scope === scope);
}

/** Set members resolved in saved field order; a dangling id is omitted. */
export function fieldSetFields(
  project: Pick<Project, "fieldDefinitions" | "fieldSets">,
  setId: string,
): FieldDefinition[] {
  const set = project.fieldSets.find((entry) => entry.id === setId);
  if (!set) return [];
  return fieldsForScope(project, set.scope).filter((field) => set.fieldIds.includes(field.id));
}

export function validateFieldSetDraft(
  project: Pick<Project, "fieldSets" | "fieldDefinitions">,
  draft: FieldSetDraft,
): FieldProblem[] {
  const problems: FieldProblem[] = [];
  const name = draft.name.trim();
  if (!name) problems.push({ code: "setNameRequired", property: "label" });
  if (
    project.fieldSets.some(
      (set) => set.id !== draft.id && set.scope === draft.scope && set.name === name,
    )
  ) {
    problems.push({ code: "setNameExists", property: "label" });
  }
  const validFields = new Set(
    project.fieldDefinitions
      .filter((field) => field.scope === draft.scope)
      .map((field) => field.id),
  );
  if (!draft.fieldIds.some((id) => validFields.has(id))) {
    problems.push({ code: "setNeedsField", property: "fieldIds" });
  }
  return problems;
}

export function createFieldSet(project: Project, draft: FieldSetDraft, id: string): FieldSetResult {
  const problems = validateFieldSetDraft(project, draft);
  if (problems.length) return { problems };
  const set: FieldSet = {
    id,
    name: draft.name.trim(),
    scope: draft.scope,
    fieldIds: [...new Set(draft.fieldIds)],
  };
  if (draft.description.trim()) set.description = draft.description.trim();
  project.fieldSets.push(set);
  return { set, problems };
}

export function updateFieldSet(project: Project, draft: FieldSetDraft): FieldProblem[] {
  const problems = validateFieldSetDraft(project, draft);
  if (problems.length) return problems;
  const set = project.fieldSets.find((entry) => entry.id === draft.id);
  if (!set) return [{ code: "setNotFound" }];
  set.name = draft.name.trim();
  set.fieldIds = [...new Set(draft.fieldIds)];
  if (draft.description.trim()) set.description = draft.description.trim();
  else delete set.description;
  return [];
}

export function deleteFieldSet(project: Project, setId: string): boolean {
  const index = project.fieldSets.findIndex((set) => set.id === setId);
  if (index < 0) return false;
  project.fieldSets.splice(index, 1);
  return true;
}

export interface ApplyFieldSetResult {
  applied: number;
  skipped: number;
}

/**
 * Fields in a set that would write a default on this item: same scope, applies
 * to the item, has a default and currently has no value.
 */
function fillableFields(project: Project, item: MarkupItem, set: FieldSet): FieldDefinition[] {
  const fillable: FieldDefinition[] = [];
  for (const fieldId of set.fieldIds) {
    const field = projectField(project, fieldId);
    if (
      !field ||
      field.scope !== "measurement" ||
      !fieldAppliesToItem(field, item) ||
      field.defaultValue === undefined ||
      !isCustomValueForField(field.defaultValue, field)
    ) {
      // An invalid stored default is reported by the validator; it is never
      // written to an item as if it were a valid value.
      continue;
    }
    const current = item.custom?.[field.id];
    if (current !== undefined && current !== null) continue;
    fillable.push(field);
  }
  return fillable;
}

/** How many defaults applying a set would write right now. */
export function fieldSetDefaultCount(project: Project, itemId: string, setId: string): number {
  const set = project.fieldSets.find((entry) => entry.id === setId);
  const found = findItem(project, itemId);
  if (!set || !found || set.scope !== "measurement") return 0;
  return fillableFields(project, found.item, set).length;
}

/**
 * Fills missing values on one measurement from the fields in a set. Fields
 * without a default, or that do not apply to this item, are skipped. The set
 * is not a binding: the item stays independent once the values are written.
 */
export function applyFieldSet(
  project: Project,
  itemId: string,
  setId: string,
): ApplyFieldSetResult {
  const set = project.fieldSets.find((entry) => entry.id === setId);
  const found = findItem(project, itemId);
  if (!set || !found || set.scope !== "measurement") return { applied: 0, skipped: 0 };
  const item = found.item;
  const fillable = fillableFields(project, item, set);
  for (const field of fillable) {
    item.custom = { ...item.custom, [field.id]: field.defaultValue as CustomValue };
  }
  if (fillable.length > 0) item.updatedAt = new Date().toISOString();
  return { applied: fillable.length, skipped: set.fieldIds.length - fillable.length };
}
