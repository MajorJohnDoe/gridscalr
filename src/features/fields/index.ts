/**
 * Public surface of the custom-fields feature. The rules live in the pure
 * model files; other modules import only this index so the internals can move.
 */
export { openFieldsDialog, appendFieldsSection, valueControl } from "./ui";
export type { FieldsSectionOptions, ValueControlOptions } from "./ui";
export {
  applicableFields,
  applicableSpaceFields,
  applyFieldSet,
  coerceFieldInput,
  createField,
  createFieldSet,
  customFieldRef,
  customValueText,
  deleteField,
  deleteFieldSet,
  emptyFieldDraft,
  emptyFieldSetDraft,
  enumOptionValueCount,
  fieldAppliesToItem,
  fieldAppliesToSpace,
  fieldDraftFor,
  fieldSetDefaultCount,
  fieldSetDraftFor,
  fieldSetFields,
  fieldSetsForScope,
  fieldValueCount,
  fieldsForScope,
  itemCustomValue,
  moveField,
  projectField,
  storedValueProblem,
  updateField,
  updateFieldSet,
  validateFieldDraft,
  validateFieldSetDraft,
} from "./model";
export type {
  ApplyFieldSetResult,
  CreateFieldResult,
  DeleteFieldResult,
  FieldDraft,
  FieldInputProblem,
  FieldInputResult,
  FieldProblem,
  FieldProblemCode,
  FieldSetDraft,
  FieldSetResult,
  FieldUsage,
} from "./model";
