import { t } from "../../../i18n";
import { makeId } from "../../../model/calibration";
import type { FieldScope } from "../../../model/types";
import { store } from "../../../state/store";
import { clear, el, iconButton } from "../../../ui/dom";
import { icon } from "../../../ui/icons";
import { toast } from "../../../ui/toast";
import {
  createFieldSet,
  deleteFieldSet,
  emptyFieldSetDraft,
  fieldSetDraftFor,
  fieldSetFields,
  fieldSetsForScope,
  fieldsForScope,
  updateFieldSet,
  validateFieldSetDraft,
} from "../model";
import type { FieldProblem, FieldSetDraft } from "../model";
import { fieldProblemText } from "./messages";

/** Named field sets in Project settings → Fields. */

export interface FieldSetsPanelOptions {
  scope: FieldScope;
  onChanged: () => void;
}

export function fieldSetsPanel(options: FieldSetsPanelOptions): HTMLElement {
  const wrap = el("div", "form-stack field-sets");
  const project = store.project;
  if (!project) return wrap;
  const scopeFields = fieldsForScope(project, options.scope);
  let draft: FieldSetDraft | null = null;

  const commit = (next: FieldSetDraft): FieldProblem[] => {
    const project = store.project;
    if (!project) return [{ code: "setNotFound" }];
    // Validate before mutating so a rejected save is not an empty undo step.
    const problems = validateFieldSetDraft(project, next);
    if (problems.length) return problems;
    store.mutate((current) => {
      if (next.id) {
        updateFieldSet(current, next);
        return;
      }
      createFieldSet(current, next, makeId("fset"));
    }, "change");
    return [];
  };

  const openEditor = (set: FieldSetDraft) => {
    draft = set;
    render();
  };

  const renderEditor = (): HTMLElement => {
    const form = el("div", "form-stack field-set-form");
    if (!draft) return form;
    const current = draft;

    const nameRow = el("div", "field");
    nameRow.append(el("span", "field-label", t("fields.setName")));
    const nameInput = el("input", "input");
    nameInput.type = "text";
    nameInput.maxLength = 120;
    nameInput.value = current.name;
    nameInput.setAttribute("aria-label", t("fields.setName"));
    nameInput.addEventListener("change", () => {
      current.name = nameInput.value;
    });
    nameRow.append(nameInput);

    const fieldRow = el("div", "field");
    fieldRow.append(el("span", "field-label", t("fields.setFields")));
    const group = el("div", "check-group");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", t("fields.setFields"));
    for (const field of scopeFields) {
      const row = el("label", "check-row");
      const input = el("input");
      input.type = "checkbox";
      input.value = field.id;
      input.checked = current.fieldIds.includes(field.id);
      input.addEventListener("change", () => {
        const selected = [...group.querySelectorAll<HTMLInputElement>("input")]
          .filter((node) => node.checked)
          .map((node) => node.value);
        current.fieldIds = selected;
      });
      row.append(input, el("span", "", field.label));
      group.append(row);
    }
    fieldRow.append(group);
    if (!scopeFields.length) {
      fieldRow.append(el("p", "settings-note", t("fields.setNoFields")));
    }

    const descriptionRow = el("div", "field");
    descriptionRow.append(el("span", "field-label", t("fields.description")));
    const description = el("input", "input");
    description.type = "text";
    description.maxLength = 500;
    description.value = current.description;
    description.setAttribute("aria-label", t("fields.description"));
    description.addEventListener("change", () => {
      current.description = description.value;
    });
    descriptionRow.append(description);

    const summary = el("div", "form-problems");
    summary.setAttribute("role", "alert");
    summary.hidden = true;

    const actions = el("div", "field-form-actions");
    const cancel = el("button", "btn btn-small btn-ghost", t("common.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      draft = null;
      render();
    });
    const save = el("button", "btn btn-small btn-primary", t("fields.saveSet"));
    save.type = "button";
    save.disabled = !scopeFields.length;
    save.addEventListener("click", () => {
      const problems = commit(current);
      if (problems.length) {
        summary.hidden = false;
        clear(summary);
        for (const problem of problems)
          summary.append(el("p", "form-error", fieldProblemText(problem)));
        return;
      }
      draft = null;
      toast(current.id ? t("fields.setUpdated") : t("fields.setCreated"));
      options.onChanged();
    });
    actions.append(cancel, save);
    form.append(nameRow, fieldRow, descriptionRow, summary, actions);
    return form;
  };

  const removeSet = (setId: string) => {
    let removed = false;
    store.mutate((project) => {
      removed = deleteFieldSet(project, setId);
    }, "change");
    if (!removed) return;
    toast(t("fields.setDeleted"));
    options.onChanged();
  };

  const render = () => {
    const project = store.project;
    if (!project) return;
    clear(wrap);
    const sets = fieldSetsForScope(project, options.scope);
    const list = el("div", "category-list");
    for (const set of sets) {
      const count = fieldSetFields(project, set.id).length;
      const item = el("div", "category-item field-set-row");
      const row = el("div", "category-row");
      const main = el("div", "field-row-main");
      main.append(
        el("span", "field-row-name", set.name),
        el("span", "category-meta", t("fields.setFieldCount", { count })),
      );
      const actions = el("div", "category-row-actions");
      const edit = el("button", "btn btn-small btn-ghost", t("fields.edit"));
      edit.type = "button";
      edit.setAttribute("aria-label", t("fields.editSetAria", { name: set.name }));
      edit.addEventListener("click", () => openEditor(fieldSetDraftFor(set)));
      const remove = iconButton(
        icon("trash", 13),
        t("fields.deleteSetAria", { name: set.name }),
        () => removeSet(set.id),
        "icon-btn category-action",
      );
      actions.append(edit, remove);
      row.append(main, actions);
      item.append(row);
      list.append(item);
    }
    if (!sets.length) list.append(el("p", "empty-note small", t("fields.setEmpty")));

    const add = el("button", "btn btn-small", t("fields.addSet"));
    add.type = "button";
    add.disabled = !scopeFields.length;
    add.title = scopeFields.length ? t("fields.addSet") : t("fields.setNoFields");
    add.addEventListener("click", () => openEditor(emptyFieldSetDraft(options.scope)));

    wrap.append(
      el("h4", "field-form-title", t("fields.setsTitle")),
      el("p", "settings-note", t("fields.setsNote")),
      list,
    );
    if (draft) wrap.append(renderEditor());
    else wrap.append(add);
  };

  render();
  return wrap;
}
