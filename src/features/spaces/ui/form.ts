import { t } from "../../../i18n";
import { applicableSpaceFields, storedValueProblem, valueControl } from "../../fields";
import { pageDisplayName, pageNumber } from "../../../model/pages";
import { SPACE_KINDS } from "../../../model/spaces";
import type { FieldDefinition, Project, SpaceAreaMode, SpaceKind } from "../../../model/types";
import { el, option } from "../../../ui/dom";
import type { SpaceDraft, SpaceProblem } from "../model";
import { parentCandidates } from "../model";
import { spaceProblemText } from "./messages";

/**
 * The create/edit form for one space. It edits a draft and reports problems
 * inline; the caller owns the store mutation, so a rejected save changes
 * nothing. Custom space values are edited here and saved with the space in the
 * same undo step.
 */

export interface SpaceFormOptions {
  project: Project;
  draft: SpaceDraft;
  /** Applies the draft; returns the problems, or an empty list on success. */
  onSave: (draft: SpaceDraft) => SpaceProblem[];
  onCancel: () => void;
  onSaved: () => void;
}

const KIND_LABELS: Record<SpaceKind, Parameters<typeof t>[0]> = {
  building: "fields.spaceKind.building",
  floor: "fields.spaceKind.floor",
  room: "fields.spaceKind.room",
  zone: "fields.spaceKind.zone",
};

const AREA_MODE_LABELS: Record<SpaceAreaMode, Parameters<typeof t>[0]> = {
  measured: "spaces.areaMode.measured",
  manual: "spaces.areaMode.manual",
};

function fieldLabel(field: FieldDefinition): string {
  if (field.type === "unitNumber" && field.unit) {
    return t("fields.labelWithUnit", { label: field.label, unit: field.unit });
  }
  return field.label;
}

export function spaceForm(options: SpaceFormOptions): HTMLElement {
  const { project, draft } = options;
  const editing = draft.id !== undefined;
  const wrap = el("div", "form-stack spaces-form");
  const errors = new Map<string, { node: HTMLElement; focus: HTMLElement }>();
  const summary = el("div", "form-problems");
  summary.setAttribute("role", "alert");
  summary.hidden = true;
  wrap.append(el("h4", "field-form-title", editing ? t("spaces.editSpace") : t("spaces.newSpace")));

  const addRow = (label: string, control: HTMLElement, property: string): HTMLElement => {
    const row = el("div", "field");
    row.append(el("span", "field-label", label));
    const error = el("p", "form-error");
    error.hidden = true;
    row.append(control, error);
    wrap.append(row);
    errors.set(property, { node: error, focus: control });
    return row;
  };

  const textInput = (
    label: string,
    property: "name" | "number" | "floor" | "usage" | "status",
    maxLength: number,
  ): HTMLInputElement => {
    const input = el("input", "input");
    input.type = "text";
    input.value = draft[property];
    input.maxLength = maxLength;
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () => {
      draft[property] = input.value;
    });
    addRow(label, input, property);
    return input;
  };

  textInput(t("spaces.name"), "name", 120);

  const kindRow = el("div", "input-row");
  const kind = el("select", "select");
  kind.setAttribute("aria-label", t("spaces.kind"));
  for (const value of SPACE_KINDS) {
    kind.append(option(value, t(KIND_LABELS[value]), value === draft.kind));
  }
  kind.addEventListener("change", () => {
    draft.kind = kind.value as SpaceKind;
    renderCustom();
  });
  kindRow.append(kind);
  addRow(t("spaces.kind"), kindRow, "kind");

  const parentRow = el("div", "input-row");
  const parent = el("select", "select");
  parent.setAttribute("aria-label", t("spaces.parent"));
  parent.append(option("", t("spaces.parentNone"), draft.parentId === ""));
  for (const node of parentCandidates(project.spaces, draft.id)) {
    parent.append(
      option(
        node.space.id,
        `${"\u00a0\u00a0".repeat(node.depth)}${node.space.name}`,
        node.space.id === draft.parentId,
      ),
    );
  }
  parent.addEventListener("change", () => {
    draft.parentId = parent.value;
  });
  parentRow.append(parent);
  addRow(t("spaces.parent"), parentRow, "parentId");

  const details = el("div", "input-row");
  details.append(textInput(t("spaces.number"), "number", 40));
  details.append(textInput(t("spaces.floor"), "floor", 80));
  wrap.append(details);

  const usageRow = el("div", "input-row");
  usageRow.append(textInput(t("spaces.usage"), "usage", 80));
  usageRow.append(textInput(t("spaces.status"), "status", 80));
  wrap.append(usageRow);

  const areaModeRow = el("div", "input-row");
  const areaMode = el("select", "select");
  areaMode.setAttribute("aria-label", t("spaces.areaMode"));
  for (const value of ["measured", "manual"] as SpaceAreaMode[]) {
    areaMode.append(option(value, t(AREA_MODE_LABELS[value]), value === draft.areaMode));
  }
  areaModeRow.append(areaMode);
  addRow(t("spaces.areaMode"), areaModeRow, "areaMode");

  const manualRow = el("div", "field");
  manualRow.append(el("span", "field-label", t("spaces.manualArea")));
  const manual = el("input", "input");
  manual.type = "number";
  manual.step = "any";
  manual.min = "0";
  manual.value = draft.areaM2;
  manual.setAttribute("aria-label", t("spaces.manualArea"));
  manual.addEventListener("change", () => {
    draft.areaM2 = manual.value;
  });
  const manualError = el("p", "form-error");
  manualError.hidden = true;
  manualRow.append(manual, manualError, el("p", "settings-note", t("spaces.manualAreaNote")));
  errors.set("areaM2", { node: manualError, focus: manual });
  wrap.append(manualRow);

  const pageRow = el("div", "input-row");
  const page = el("select", "select");
  page.setAttribute("aria-label", t("spaces.page"));
  page.append(option("", t("spaces.pageNone"), draft.pageId === ""));
  for (const record of project.pages) {
    const name = pageDisplayName(project, record.id);
    page.append(
      option(
        record.id,
        name
          ? t("spaces.pageNamed", { page: pageNumber(project, record.id), name })
          : t("spaces.pageNumbered", { page: pageNumber(project, record.id) }),
        record.id === draft.pageId,
      ),
    );
  }
  page.addEventListener("change", () => {
    draft.pageId = page.value;
  });
  pageRow.append(page);
  addRow(t("spaces.page"), pageRow, "pageId");

  const custom = el("section", "settings-section spaces-fields");
  wrap.append(custom);

  const syncAreaMode = () => {
    manualRow.hidden = draft.areaMode !== "manual";
  };
  areaMode.addEventListener("change", () => {
    draft.areaMode = areaMode.value as SpaceAreaMode;
    syncAreaMode();
  });

  const renderCustom = () => {
    custom.replaceChildren();
    custom.append(el("h3", "", t("fields.inspectorTitle")));
    const fields = applicableSpaceFields(project, { kind: draft.kind });
    if (!fields.length) {
      custom.append(el("p", "empty-note small", t("spaces.fieldsEmpty")));
      return;
    }
    for (const field of fields) {
      const row = el("div", "field field-custom");
      const label = el("span", "field-label", fieldLabel(field));
      if (field.required) {
        const required = el("span", "field-required", "*");
        required.title = t("fields.inspectorRequired");
        required.setAttribute("aria-label", t("fields.inspectorRequired"));
        label.append(" ", required);
      }
      row.append(label);
      if (field.description) row.append(el("p", "settings-note", field.description));
      if (storedValueProblem(field, draft.custom[field.id])) {
        row.append(el("p", "form-error", t("fields.inspectorInvalid")));
      }
      row.append(
        valueControl({
          field,
          value: draft.custom[field.id],
          label: fieldLabel(field),
          onChange: (next) => {
            if (next === undefined) delete draft.custom[field.id];
            else draft.custom[field.id] = next;
          },
        }),
      );
      custom.append(row);
    }
  };

  syncAreaMode();
  renderCustom();

  const buttons = el("div", "field-form-actions");
  const cancel = el("button", "btn btn-small btn-ghost", t("common.cancel"));
  cancel.type = "button";
  cancel.addEventListener("click", options.onCancel);
  const save = el("button", "btn btn-small btn-primary", t("spaces.saveSpace"));
  save.type = "button";
  save.addEventListener("click", () => {
    for (const slot of errors.values()) {
      slot.node.hidden = true;
      slot.node.textContent = "";
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
      const slot = problem.property ? errors.get(problem.property) : undefined;
      if (slot) {
        slot.node.textContent = spaceProblemText(problem.code);
        slot.node.hidden = false;
        focus ??= slot.focus;
      } else {
        general.push(spaceProblemText(problem.code));
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
