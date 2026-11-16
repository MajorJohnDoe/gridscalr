import type { FieldDraft } from "./draft";

/**
 * Problem codes shared by the field draft and the field-set draft. The UI maps
 * a code to a localized message; the model never builds interface text.
 */
export interface FieldProblem {
  code: FieldProblemCode;
  /** Draft property the message belongs to, for inline placement. */
  property?: keyof FieldDraft | "options" | "fieldIds";
  count?: number;
  name?: string;
}

export type FieldProblemCode =
  | "fieldNotFound"
  | "labelRequired"
  | "labelTooLong"
  | "keyRequired"
  | "keyInvalid"
  | "keyExists"
  | "keyLocked"
  | "scopeLocked"
  | "typeLocked"
  | "optionsRequired"
  | "optionLabelRequired"
  | "optionInUse"
  | "unitTooLong"
  | "descriptionTooLong"
  | "minInvalid"
  | "maxInvalid"
  | "maxLengthInvalid"
  | "defaultInvalid"
  | "tooManyFields"
  | "setNotFound"
  | "setNameRequired"
  | "setNameExists"
  | "setNeedsField";
