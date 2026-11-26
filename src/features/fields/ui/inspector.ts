import { t } from "../../../i18n";
import { setItemCustomValue } from "../../../model/commands";
import { isMeasurementKind } from "../../../model/layers";
import type { MarkupItem, Project } from "../../../model/types";
import { store } from "../../../state/store";
import { el, option } from "../../../ui/dom";
import { toast } from "../../../ui/toast";
import {
  applicableFields,
  applyFieldSet,
  fieldSetDefaultCount,
  fieldSetsForScope,
  storedValueProblem,
} from "../model";
import type { FieldDefinition } from "../../../model/types";
import { openFieldsDialog } from "./fieldDialog";
import { valueControl } from "./valueInput";

/** The Fields section in Properties for the selected measurement. */

export interface FieldsSectionOptions {
  project: Project;
  item: MarkupItem;
  locked: boolean;
}

function fieldLabel(field: FieldDefinition): string {
  if (field.type === "unitNumber" && field.unit) {
    return t("fields.labelWithUnit", { label: field.label, unit: field.unit });
  }
  return field.label;
}

export function appendFieldsSection(section: HTMLElement, options: FieldsSectionOptions): void {
  const { project, item, locked } = options;
  if (!isMeasurementKind(item.kind)) return;

  const head = el("div", "section-head");
  head.append(el("h2", "", t("fields.inspectorTitle")));
  section.append(head);

  const disabled = locked || store.readOnly;
  const manage = el("button", "btn btn-small btn-ghost", t("fields.manage"));
  manage.type = "button";
  manage.disabled = store.readOnly;
  manage.addEventListener("click", () => {
    void openFieldsDialog();
  });

  const fields = applicableFields(project, item);
  if (!fields.length) {
    section.append(el("div", "empty-note small", t("fields.inspectorEmpty")), manage);
    return;
  }

  for (const field of fields) {
    const value = item.custom?.[field.id];
    const invalid = storedValueProblem(field, value);
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
    if (invalid) row.append(el("p", "form-error", t("fields.inspectorInvalid")));
    row.append(
      valueControl({
        field,
        value,
        label: fieldLabel(field),
        disabled,
        onChange: (next) => {
          store.mutate((project) => {
            setItemCustomValue(project, item.id, field.id, next);
          }, "change");
        },
      }),
    );
    if (field.required && (value === undefined || value === null)) {
      row.append(el("p", "settings-note", t("fields.inspectorRequiredHint")));
    }
    section.append(row);
  }

  const sets = fieldSetsForScope(project, "measurement");
  if (sets.length) {
    const row = el("div", "field field-set-apply");
    row.append(el("span", "field-label", t("fields.applySetLabel")));
    const controls = el("div", "input-row");
    const select = el("select", "select");
    select.setAttribute("aria-label", t("fields.applySetLabel"));
    select.disabled = disabled;
    for (const set of sets) {
      select.append(option(set.id, set.name, false));
    }
    const apply = el("button", "btn btn-small", t("fields.applySet"));
    apply.type = "button";
    apply.disabled = disabled;
    apply.addEventListener("click", () => {
      // A set with nothing to fill must not add an empty undo step.
      if (fieldSetDefaultCount(project, item.id, select.value) === 0) {
        toast(t("fields.applySetEmpty"), "info");
        return;
      }
      let applied = 0;
      store.mutate((current) => {
        applied = applyFieldSet(current, item.id, select.value).applied;
      }, "change");
      toast(t("fields.applySetResult", { count: applied }), "success");
    });
    controls.append(select, apply);
    row.append(controls);
    section.append(row);
  }

  section.append(manage);
}
