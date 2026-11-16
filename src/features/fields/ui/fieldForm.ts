import { t } from "../../../i18n";
import type { FieldScope, FieldType, Project } from "../../../model/types";
import { el, option } from "../../../ui/dom";
import type { FieldDraft } from "../model";
import type { FieldProblem } from "../model";
import { validateFieldDraft } from "../model";
import { fieldAppliesToEditor } from "./fieldAppliesTo";
import { fieldOptionsEditor } from "./fieldOptions";
import { fieldProblemText } from "./messages";
import { valueControl } from "./valueInput";

/**
 * The create/edit form for one field. It edits a draft and reports problems
 * inline; the caller owns the store mutation, so a rejected save changes
 * nothing.
 */

export interface FieldFormOptions {
  project: Project;
  draft: FieldDraft;
  /** Applies the draft; returns the problems, or an empty list on success. */
  onSave: (draft: FieldDraft) => FieldProblem[];
  onCancel: () => void;
  onSaved: () => void;
}

interface Slot {
  error: HTMLElement;
  focus: HTMLElement;
}

const TYPE_KEYS: Record<FieldType, Parameters<typeof t>[0]> = {
  text: "fields.type.text",
  number: "fields.type.number",
  unitNumber: "fields.type.unitNumber",
  boolean: "fields.type.boolean",
  date: "fields.type.date",
  enum: "fields.type.enum",
  multiEnum: "fields.type.multiEnum",
};

export function fieldForm(options: FieldFormOptions): HTMLElement {
  const { project, draft } = options;
  const editing = draft.id !== undefined;
  const wrap = el("div", "form-stack field-form");
  const slots = new Map<string, Slot>();
  const summary = el("div", "form-problems");
  summary.setAttribute("role", "alert");
  summary.hidden = true;
  wrap.append(el("h4", "field-form-title", editing ? t("fields.editField") : t("fields.newField")));

  const addSlot = (property: string, error: HTMLElement, focus: HTMLElement) => {
    slots.set(property, { error, focus });
  };

  const textRow = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    property: string,
    attrs: { placeholder?: string; maxLength?: number; disabled?: boolean; hint?: string } = {},
  ) => {
    const row = el("div", "field");
    row.append(el("span", "field-label", label));
    const input = el("input", "input");
    input.type = "text";
    input.value = value;
    input.setAttribute("aria-label", label);
    if (attrs.placeholder) input.placeholder = attrs.placeholder;
    if (attrs.maxLength) input.maxLength = attrs.maxLength;
    if (attrs.disabled) input.disabled = true;
    input.addEventListener("change", () => onChange(input.value));
    const error = el("p", "form-error");
    error.hidden = true;
    row.append(input, error);
    if (attrs.hint) row.append(el("p", "settings-note", attrs.hint));
    wrap.append(row);
    addSlot(property, error, input);
    return input;
  };

  const selectRow = (
    label: string,
    control: HTMLSelectElement,
    property: string,
    hint?: string,
  ) => {
    const row = el("div", "field");
    row.append(el("span", "field-label", label));
    control.setAttribute("aria-label", label);
    const error = el("p", "form-error");
    error.hidden = true;
    row.append(control, error);
    if (hint) row.append(el("p", "settings-note", hint));
    wrap.append(row);
    addSlot(property, error, control);
    return row;
  };

  textRow(
    t("fields.fieldName"),
    draft.label,
    (value) => {
      draft.label = value;
    },
    "label",
    { maxLength: 120 },
  );

  textRow(
    t("fields.fieldKey"),
    draft.key,
    (value) => {
      draft.key = value;
    },
    "key",
    {
      maxLength: 80,
      disabled: editing,
      hint: editing ? t("fields.keyLockedNote") : t("fields.fieldKeyNote"),
    },
  );

  const scopeSelect = el("select", "select");
  scopeSelect.disabled = editing;
  for (const scope of ["measurement", "space"] as FieldScope[]) {
    scopeSelect.append(
      option(
        scope,
        t(scope === "measurement" ? "fields.scope.measurement" : "fields.scope.space"),
        scope === draft.scope,
      ),
    );
  }
  scopeSelect.addEventListener("change", () => {
    draft.scope = scopeSelect.value as FieldScope;
    draft.appliesTo = {};
    renderAppliesTo();
  });
  selectRow(
    t("fields.scope"),
    scopeSelect,
    "scope",
    editing ? t("fields.scopeLockedNote") : t("fields.scopeNote"),
  );

  const typeSelect = el("select", "select");
  for (const type of Object.keys(TYPE_KEYS) as FieldType[]) {
    typeSelect.append(option(type, t(TYPE_KEYS[type]), type === draft.type));
  }
  typeSelect.addEventListener("change", () => {
    const next = typeSelect.value as FieldType;
    if (next === draft.type) return;
    if (draft.id) {
      const locked = validateFieldDraft(project, { ...draft, type: next }).find(
        (problem) => problem.code === "typeLocked",
      );
      if (locked) {
        typeSelect.value = draft.type;
        const slot = slots.get("type");
        if (slot) {
          slot.error.textContent = fieldProblemText(locked);
          slot.error.hidden = false;
        }
        return;
      }
    }
    const slot = slots.get("type");
    if (slot) {
      slot.error.hidden = true;
      slot.error.textContent = "";
    }
    draft.type = next;
    draft.defaultRaw = undefined;
    renderDynamic();
  });
  selectRow(t("fields.type"), typeSelect, "type", editing ? t("fields.typeNote") : undefined);

  const dynamic = el("div", "form-stack");
  wrap.append(dynamic);

  const renderDynamic = () => {
    dynamic.replaceChildren();
    for (const property of ["unit", "min", "max", "maxLength", "defaultRaw"]) {
      slots.delete(property);
    }
    if (draft.type === "unitNumber") {
      const row = el("div", "field");
      row.append(el("span", "field-label", t("fields.unit")));
      const input = el("input", "input");
      input.type = "text";
      input.maxLength = 40;
      input.value = draft.unit;
      input.setAttribute("aria-label", t("fields.unit"));
      input.addEventListener("change", () => {
        draft.unit = input.value;
      });
      const error = el("p", "form-error");
      error.hidden = true;
      row.append(input, error);
      dynamic.append(row);
      addSlot("unit", error, input);
    }
    if (draft.type === "number" || draft.type === "unitNumber") {
      for (const [key, label] of [
        ["min", t("fields.min")],
        ["max", t("fields.max")],
      ] as const) {
        const row = el("div", "field");
        row.append(el("span", "field-label", label));
        const input = el("input", "input");
        input.type = "number";
        input.step = "any";
        input.value = draft[key];
        input.setAttribute("aria-label", label);
        input.addEventListener("change", () => {
          draft[key] = input.value;
        });
        const error = el("p", "form-error");
        error.hidden = true;
        row.append(input, error);
        dynamic.append(row);
        addSlot(key, error, input);
      }
    }
    if (draft.type === "text") {
      const row = el("div", "field");
      row.append(el("span", "field-label", t("fields.maxLength")));
      const input = el("input", "input");
      input.type = "number";
      input.min = "1";
      input.max = "2000";
      input.step = "1";
      input.value = draft.maxLength;
      input.setAttribute("aria-label", t("fields.maxLength"));
      input.addEventListener("change", () => {
        draft.maxLength = input.value;
      });
      const error = el("p", "form-error");
      error.hidden = true;
      row.append(input, error);
      dynamic.append(row);
      addSlot("maxLength", error, input);
    }
    if (draft.type === "enum" || draft.type === "multiEnum") {
      dynamic.append(fieldOptionsEditor(draft, renderDynamic));
    }
    dynamic.append(defaultRow());
  };

  const defaultRow = (): HTMLElement => {
    const row = el("div", "field");
    row.append(el("span", "field-label", t("fields.defaultValue")));
    const validation = {
      ...(draft.type === "number" || draft.type === "unitNumber"
        ? {
            ...(draft.min.trim() && Number.isFinite(Number(draft.min))
              ? { min: Number(draft.min) }
              : {}),
            ...(draft.max.trim() && Number.isFinite(Number(draft.max))
              ? { max: Number(draft.max) }
              : {}),
          }
        : {}),
      ...(draft.type === "text" && draft.maxLength.trim()
        ? { maxLength: Number(draft.maxLength) }
        : {}),
    };
    const field = {
      id: draft.id ?? "draft",
      key: draft.key.trim(),
      label: draft.label.trim(),
      type: draft.type,
      scope: draft.scope,
      order: 0,
      ...(draft.type === "unitNumber" && draft.unit.trim() ? { unit: draft.unit.trim() } : {}),
      ...(Object.keys(validation).length ? { validation } : {}),
      ...(draft.type === "enum" || draft.type === "multiEnum"
        ? {
            options: draft.options.map((entry) => ({
              id: entry.id,
              label: entry.label.trim() || entry.id,
            })),
          }
        : {}),
    };
    const control = valueControl({
      field,
      value: draft.defaultRaw,
      label: t("fields.defaultValue"),
      onChange: (value) => {
        draft.defaultRaw = value;
      },
    });
    row.append(control);
    return row;
  };

  const appliesTo = el("div", "form-stack");
  wrap.append(appliesTo);

  const renderAppliesTo = () => {
    appliesTo.replaceChildren();
    appliesTo.append(fieldAppliesToEditor(project, draft));
  };

  const requiredRow = el("label", "check-row");
  const requiredInput = el("input");
  requiredInput.type = "checkbox";
  requiredInput.checked = draft.required;
  requiredInput.addEventListener("change", () => {
    draft.required = requiredInput.checked;
  });
  requiredRow.append(requiredInput, el("span", "", t("fields.required")));
  wrap.append(requiredRow);

  textRow(
    t("fields.description"),
    draft.description,
    (value) => {
      draft.description = value;
    },
    "description",
    { maxLength: 500 },
  );

  renderDynamic();
  renderAppliesTo();

  const buttons = el("div", "field-form-actions");
  const cancel = el("button", "btn btn-small btn-ghost", t("common.cancel"));
  cancel.type = "button";
  cancel.addEventListener("click", options.onCancel);
  const save = el("button", "btn btn-small btn-primary", t("fields.saveField"));
  save.type = "button";
  save.addEventListener("click", () => {
    for (const slot of slots.values()) {
      slot.error.hidden = true;
      slot.error.textContent = "";
    }
    summary.hidden = true;
    summary.replaceChildren();
    const problems = options.onSave(draft);
    if (!problems.length) {
      options.onSaved();
      return;
    }
    const general: string[] = [];
    let focus: HTMLElement | undefined;
    for (const problem of problems) {
      const slot = problem.property ? slots.get(problem.property) : undefined;
      if (slot) {
        slot.error.textContent = fieldProblemText(problem);
        slot.error.hidden = false;
        focus ??= slot.focus;
      } else {
        general.push(fieldProblemText(problem));
      }
    }
    if (general.length) {
      summary.hidden = false;
      for (const message of general) summary.append(el("p", "form-error", message));
    }
    focus?.focus();
  });
  buttons.append(cancel, save);
  wrap.append(summary, buttons);
  return wrap;
}
