/**
 * Public surface of the custom-fields feature. The rules live in the pure
 * model files; other modules import only this index so the internals can move.
 */
export { fieldsSettingsSection, openFieldsDialog, appendFieldsSection } from "./ui";
export type { FieldsSectionOptions } from "./ui";
export {
  applicableFields,
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
