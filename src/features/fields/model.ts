/**
 * Pure model surface for custom fields. The rules are split by concern so no
 * file grows into a grab bag: field lookup and typed values, drafts and the
 * four field mutations, and field sets.
 */
export {
  EDITABLE_FIELD_SCOPES,
  FIELD_UNIT_MAX_LENGTH,
  applicableFields,
  applicableSpaceFields,
  coerceFieldInput,
  customFieldRef,
  customValueText,
  enumOptionValueCount,
  fieldAppliesToItem,
  fieldAppliesToSpace,
  fieldValueCount,
  fieldsForScope,
  itemCustomValue,
  projectField,
  storedValueProblem,
} from "./model/fieldRules";
export type { FieldInputProblem, FieldInputResult, FieldUsage } from "./model/fieldRules";
export {
  createField,
  deleteField,
  emptyFieldDraft,
  fieldDraftFor,
  moveField,
  updateField,
  validateFieldDraft,
} from "./model/draft";
export type { CreateFieldResult, DeleteFieldResult, FieldDraft } from "./model/draft";
export {
  applyFieldSet,
  createFieldSet,
  deleteFieldSet,
  emptyFieldSetDraft,
  fieldSetDefaultCount,
  fieldSetDraftFor,
  fieldSetFields,
  fieldSetsForScope,
  updateFieldSet,
  validateFieldSetDraft,
} from "./model/sets";
export type { ApplyFieldSetResult, FieldSetDraft, FieldSetResult } from "./model/sets";
export type { FieldProblem, FieldProblemCode } from "./model/problems";
