import { t } from "../../../i18n";
import type { FieldDefinition, FieldScope } from "../../../model/types";
import { store } from "../../../state/store";
import { clear, el, iconButton } from "../../../ui/dom";
import { icon } from "../../../ui/icons";
import { toast } from "../../../ui/toast";
import { deleteField, fieldValueCount, fieldsForScope, moveField } from "../model";

/** The ordered field list in Project settings → Fields. */

export interface FieldListOptions {
  scope: FieldScope;
  onEdit: (field: FieldDefinition) => void;
  onChanged: () => void;
}

function typeLabel(field: FieldDefinition): string {
  return t(`fields.type.${field.type}` as Parameters<typeof t>[0]);
}

export function fieldList(options: FieldListOptions): HTMLElement {
  const wrap = el("div", "field-list");
  const confirm = el("div", "inline-confirm");
  confirm.hidden = true;

  const hideConfirm = () => {
    confirm.hidden = true;
    clear(confirm);
  };

  const remove = (field: FieldDefinition) => {
    let removed = false;
    store.mutate((project) => {
      removed = deleteField(project, field.id).removed;
    }, "change");
    hideConfirm();
    if (!removed) return;
    toast(t("fields.deleteDone", { name: field.label }));
    options.onChanged();
  };

  const requestDelete = (field: FieldDefinition) => {
    const project = store.project;
    if (!project) return;
    const usage = fieldValueCount(project, field.id).total;
    if (usage === 0) {
      remove(field);
      return;
    }
    clear(confirm);
    confirm.hidden = false;
    confirm.append(
      el(
        "p",
        "inline-confirm-text",
        t("fields.deleteConfirm", {
          name: field.label,
          count: usage,
        }),
      ),
    );
    const actions = el("div", "inline-confirm-actions");
    const cancel = el("button", "btn btn-small btn-ghost", t("common.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", hideConfirm);
    const removeButton = el("button", "btn btn-small btn-danger", t("common.delete"));
    removeButton.type = "button";
    removeButton.addEventListener("click", () => remove(field));
    actions.append(cancel, removeButton);
    confirm.append(actions);
    removeButton.focus();
  };

  const render = () => {
    const project = store.project;
    if (!project) return;
    hideConfirm();
    clear(wrap);
    const scopeFields = fieldsForScope(project, options.scope);
    if (!scopeFields.length) {
      wrap.append(el("p", "empty-note small", t("fields.empty")));
      return;
    }
    scopeFields.forEach((field, index) => {
      const usage = fieldValueCount(project, field.id).total;
      const item = el("div", "category-item field-row-item");
      const row = el("div", "category-row");
      const main = el("div", "field-row-main");
      main.append(
        el("span", "field-row-name", field.label),
        el(
          "span",
          "category-meta",
          `${field.key} · ${typeLabel(field)} · ${t("fields.usage", { count: usage })}`,
        ),
      );
      const actions = el("div", "category-row-actions");
      const up = iconButton(
        icon("up", 13),
        t("fields.moveUpAria", { name: field.label }),
        () => {
          let moved = false;
          store.mutate((project) => {
            moved = moveField(project, field.id, -1);
          }, "change");
          if (moved) render();
        },
        "icon-btn category-action",
      );
      up.disabled = index === 0;
      const down = iconButton(
        icon("down", 13),
        t("fields.moveDownAria", { name: field.label }),
        () => {
          let moved = false;
          store.mutate((project) => {
            moved = moveField(project, field.id, 1);
          }, "change");
          if (moved) render();
        },
        "icon-btn category-action",
      );
      down.disabled = index === scopeFields.length - 1;
      const edit = el("button", "btn btn-small btn-ghost", t("fields.edit"));
      edit.type = "button";
      edit.setAttribute("aria-label", t("fields.editFieldAria", { name: field.label }));
      edit.addEventListener("click", () => options.onEdit(field));
      const remove = iconButton(
        icon("trash", 13),
        t("fields.deleteFieldAria", { name: field.label }),
        () => requestDelete(field),
        "icon-btn category-action",
      );
      actions.append(up, down, edit, remove);
      row.append(main, actions);
      item.append(row);
      wrap.append(item);
    });
    wrap.append(confirm);
  };

  render();
  return wrap;
}
