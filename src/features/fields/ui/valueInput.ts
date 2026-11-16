import { t } from "../../../i18n";
import { coerceFieldInput } from "../model";
import type { FieldInputProblem } from "../model";
import type { CustomValue, FieldDefinition } from "../../../model/types";
import { el, iconButton, option } from "../../../ui/dom";
import { icon } from "../../../ui/icons";

/**
 * One typed control for a custom value, shared by the inspector and the field
 * editor's default value. Invalid input shows an inline message and calls no
 * change handler, so a mistyped value is never stored as another type.
 */

export interface ValueControlOptions {
  field: FieldDefinition;
  value: CustomValue | undefined;
  /** Accessible name for the control; usually the field label. */
  label: string;
  disabled?: boolean;
  onChange: (value: CustomValue | undefined) => void;
}

function problemText(field: FieldDefinition, problem: FieldInputProblem): string {
  switch (problem) {
    case "notANumber":
      return t("fields.valueProblem.notANumber");
    case "belowMin":
      return t("fields.valueProblem.belowMin", { min: field.validation?.min ?? 0 });
    case "aboveMax":
      return t("fields.valueProblem.aboveMax", { max: field.validation?.max ?? 0 });
    case "tooLong":
      return t("fields.valueProblem.tooLong", {
        max: field.validation?.maxLength ?? 0,
      });
    case "notADate":
      return t("fields.valueProblem.notADate");
    case "unknownOption":
      return t("fields.valueProblem.unknownOption");
    case "invalidValue":
      return t("fields.valueProblem.invalidValue");
  }
}

export function clearValueLabel(label: string): string {
  return t("fields.clearValueAria", { label });
}

export function valueControl(options: ValueControlOptions): HTMLElement {
  const { field, label, disabled = false } = options;
  const wrap = el("div", "field-value");
  const row = el("div", "field-value-row");
  const error = el("p", "form-error");
  error.setAttribute("role", "alert");
  error.hidden = true;
  wrap.append(row, error);

  const clear = () => {
    error.hidden = true;
    options.onChange(undefined);
  };

  const report = (problem: FieldInputProblem) => {
    error.textContent = problemText(field, problem);
    error.hidden = false;
  };

  const commit = (raw: string | boolean | string[] | null | undefined) => {
    const result = coerceFieldInput(field, raw);
    if (result.problem) {
      report(result.problem);
      return false;
    }
    error.hidden = true;
    options.onChange(result.value);
    return true;
  };

  let control: HTMLElement;
  switch (field.type) {
    case "boolean": {
      const select = el("select", "select");
      select.setAttribute("aria-label", label);
      select.disabled = disabled;
      select.append(
        option("", t("fields.notSet"), options.value === undefined || options.value === null),
        option("true", t("common.yes"), options.value === true),
        option("false", t("common.no"), options.value === false),
      );
      select.addEventListener("change", () => {
        if (!select.value) {
          clear();
          return;
        }
        if (!commit(select.value === "true")) select.value = "";
      });
      control = select;
      break;
    }
    case "enum": {
      const select = el("select", "select");
      select.setAttribute("aria-label", label);
      select.disabled = disabled;
      const current = typeof options.value === "string" ? options.value : "";
      select.append(option("", t("fields.notSet"), current === ""));
      for (const entry of field.options ?? []) {
        select.append(option(entry.id, entry.label, entry.id === current));
      }
      select.addEventListener("change", () => {
        if (!select.value) {
          clear();
          return;
        }
        if (!commit(select.value)) select.value = "";
      });
      control = select;
      break;
    }
    case "multiEnum": {
      const group = el("div", "check-group");
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", label);
      const selected = new Set(Array.isArray(options.value) ? options.value : []);
      const checks: { id: string; input: HTMLInputElement }[] = [];
      for (const entry of field.options ?? []) {
        const check = el("label", "check-row");
        const input = el("input");
        input.type = "checkbox";
        input.value = entry.id;
        input.checked = selected.has(entry.id);
        input.disabled = disabled;
        input.addEventListener("change", () => {
          commit(
            checks.filter((candidate) => candidate.input.checked).map((candidate) => candidate.id),
          );
        });
        checks.push({ id: entry.id, input });
        check.append(input, el("span", "", entry.label));
        group.append(check);
      }
      control = group;
      break;
    }
    case "number":
    case "unitNumber": {
      const input = el("input", "input");
      input.type = "number";
      input.step = "any";
      if (field.validation?.min !== undefined) input.min = String(field.validation.min);
      if (field.validation?.max !== undefined) input.max = String(field.validation.max);
      input.value = typeof options.value === "number" ? String(options.value) : "";
      input.setAttribute("aria-label", label);
      input.disabled = disabled;
      input.addEventListener("change", () => {
        if (!input.value.trim()) {
          clear();
          return;
        }
        if (!commit(input.value)) input.focus();
      });
      control = input;
      break;
    }
    case "date": {
      const input = el("input", "input");
      input.type = "date";
      input.value = typeof options.value === "string" ? options.value.slice(0, 10) : "";
      input.setAttribute("aria-label", label);
      input.disabled = disabled;
      input.addEventListener("change", () => {
        if (!input.value) {
          clear();
          return;
        }
        if (!commit(input.value)) input.focus();
      });
      control = input;
      break;
    }
    case "text": {
      const input = el("input", "input");
      input.type = "text";
      input.maxLength = field.validation?.maxLength ?? 2000;
      input.value = typeof options.value === "string" ? options.value : "";
      input.setAttribute("aria-label", label);
      input.disabled = disabled;
      input.addEventListener("change", () => {
        if (!input.value.trim()) {
          clear();
          return;
        }
        if (!commit(input.value)) input.focus();
      });
      control = input;
      break;
    }
    default: {
      control = el("p", "form-error", t("fields.valueProblem.invalidValue"));
      break;
    }
  }

  const hasValue = options.value !== undefined && options.value !== null;
  const clearButton = iconButton(
    icon("close", 11),
    clearValueLabel(label),
    () => {
      const target = row.querySelector<HTMLInputElement | HTMLSelectElement>("input, select");
      if (target) target.value = "";
      else {
        for (const check of row.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) {
          check.checked = false;
        }
      }
      clearButton.hidden = true;
      clear();
    },
    "icon-btn field-value-clear",
  );
  clearButton.disabled = disabled;
  clearButton.hidden = !hasValue;

  row.append(control);
  if (field.type === "unitNumber" && field.unit) {
    row.append(el("span", "field-unit", field.unit));
  }
  row.append(clearButton);
  return wrap;
}
