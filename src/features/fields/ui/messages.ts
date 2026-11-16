import { t } from "../../../i18n";
import type { MessageKey } from "../../../i18n";
import type { FieldProblem, FieldProblemCode } from "../model";

/**
 * Localized messages for model problem codes. The model never builds UI text;
 * this is the only place a code becomes a sentence.
 */
const PROBLEM_KEYS: Record<FieldProblemCode, MessageKey> = {
  fieldNotFound: "fields.problem.fieldNotFound",
  labelRequired: "fields.problem.labelRequired",
  labelTooLong: "fields.problem.labelTooLong",
  keyRequired: "fields.problem.keyRequired",
  keyInvalid: "fields.problem.keyInvalid",
  keyExists: "fields.problem.keyExists",
  keyLocked: "fields.problem.keyLocked",
  scopeLocked: "fields.problem.scopeLocked",
  typeLocked: "fields.problem.typeLocked",
  optionsRequired: "fields.problem.optionsRequired",
  optionLabelRequired: "fields.problem.optionLabelRequired",
  optionInUse: "fields.problem.optionInUse",
  unitTooLong: "fields.problem.unitTooLong",
  descriptionTooLong: "fields.problem.descriptionTooLong",
  minInvalid: "fields.problem.minInvalid",
  maxInvalid: "fields.problem.maxInvalid",
  maxLengthInvalid: "fields.problem.maxLengthInvalid",
  defaultInvalid: "fields.problem.defaultInvalid",
  tooManyFields: "fields.problem.tooManyFields",
  setNotFound: "fields.problem.setNotFound",
  setNameRequired: "fields.problem.setNameRequired",
  setNameExists: "fields.problem.setNameExists",
  setNeedsField: "fields.problem.setNeedsField",
};

export function fieldProblemText(problem: FieldProblem): string {
  return t(PROBLEM_KEYS[problem.code], {
    count: problem.count ?? 0,
    name: problem.name ?? "",
  });
}
