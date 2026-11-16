import { isCustomValueForField } from "../../../model/fields";
import type { CustomValue, FieldDefinition } from "../../../model/types";
import { coerceFieldInput, customValueText } from "../../fields";
import { parseCsvNumber } from "./text";

/**
 * Typed custom values for the CSV round-trip. A cell is accepted only when it
 * is an exact option id or label, a finite number inside the field bounds, a
 * documented boolean spelling or a valid date. Anything else is reported and
 * the row is rejected; no value is reinterpreted as another type.
 */

export type ParsedCustomValue = { value: CustomValue | null } | { problem: string };

function optionId(field: FieldDefinition, token: string): string | null {
  const byId = (field.options ?? []).find((option) => option.id === token);
  if (byId) return byId.id;
  const byLabel = (field.options ?? []).filter((option) => option.label === token);
  return byLabel.length === 1 ? byLabel[0].id : null;
}

const TRUE_TEXT = new Set(["true", "yes", "ja", "1"]);
const FALSE_TEXT = new Set(["false", "no", "nej", "0"]);

function parseBoolean(raw: string): boolean | null {
  const text = raw.trim().toLocaleLowerCase();
  if (!text) return null;
  if (TRUE_TEXT.has(text)) return true;
  if (FALSE_TEXT.has(text)) return false;
  return null;
}

function normalizedNumberInput(raw: string, delimiter: string): string {
  const text = raw.trim();
  if (!text) return "";
  if (delimiter !== "," && !text.includes(".") && text.includes(",")) {
    return text.replace(",", ".");
  }
  return text;
}

export function parseCustomCsvValue(
  field: FieldDefinition,
  raw: string,
  delimiter: string,
): ParsedCustomValue {
  const text = raw.trim();
  if (!text) return { value: null };
  switch (field.type) {
    case "enum": {
      const id = optionId(field, text);
      return id ? { value: id } : { problem: "unknownOption" };
    }
    case "multiEnum": {
      const tokens = raw
        .split(";")
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (!tokens.length) return { value: null };
      const ids: string[] = [];
      for (const token of tokens) {
        const id = optionId(field, token);
        if (!id) return { problem: "unknownOption" };
        if (!ids.includes(id)) ids.push(id);
      }
      return { value: ids };
    }
    case "boolean": {
      const value = parseBoolean(raw);
      if (value === null) return { problem: "notBoolean" };
      return { value };
    }
    case "number":
    case "unitNumber": {
      const parsed = parseCsvNumber(normalizedNumberInput(raw, delimiter), ".");
      if ("problem" in parsed) return { problem: "notANumber" };
      const result = coerceFieldInput(field, String(parsed.value));
      return result.value !== undefined
        ? { value: result.value }
        : { problem: result.problem ?? "invalidValue" };
    }
    case "text":
    case "date": {
      const result = coerceFieldInput(field, raw);
      return result.value !== undefined
        ? { value: result.value }
        : { problem: result.problem ?? "invalidValue" };
    }
    default:
      return { problem: "invalidValue" };
  }
}

export function sameCustomValue(left: CustomValue | undefined, right: CustomValue | null): boolean {
  const a = left ?? null;
  if (a === null || right === null) return a === right;
  if (Array.isArray(a) && Array.isArray(right)) {
    return a.length === right.length && a.every((entry, index) => entry === right[index]);
  }
  return a === right;
}

export function customDisplay(field: FieldDefinition, value: CustomValue | undefined): string {
  return customValueText(field, value);
}

/** Re-checks a value at apply time, so a field deleted after the dry run is skipped. */
export function customValueAllowed(field: FieldDefinition, value: CustomValue | null): boolean {
  return value === null || isCustomValueForField(value, field);
}
