import { t } from "../../../i18n";
import { makeId } from "../../../model/calibration";
import type { FieldDefinition, FieldScope } from "../../../model/types";
import { store } from "../../../state/store";
import { clear, el, option } from "../../../ui/dom";
import { showModal } from "../../../ui/dialogs";
import { toast } from "../../../ui/toast";
import {
  createField,
  emptyFieldDraft,
  fieldDraftFor,
  fieldsForScope,
  updateField,
  validateFieldDraft,
} from "../model";
import type { FieldDraft, FieldProblem } from "../model";
import { fieldForm } from "./fieldForm";
import { fieldList } from "./fieldList";
import { fieldSetsPanel } from "./fieldSets";

/** Project settings → Fields. Every mutation is one undo step. */

export function openFieldsDialog(): Promise<void> {
  if (!store.project) return Promise.resolve();
  const body = el("div", "form-stack category-manager fields-dialog");
  let scope: FieldScope = "measurement";
  let editing: FieldDraft | null = null;

  const render = () => {
    clear(body);
    body.append(el("p", "modal-message", t("fields.intro")));

    const scopeRow = el("div", "input-row");
    const scopeLabel = el("span", "field-label", t("fields.scope"));
    const scopeSelect = el("select", "select");
    scopeSelect.setAttribute("aria-label", t("fields.scope"));
    scopeSelect.append(
      option("measurement", t("fields.scope.measurement"), scope === "measurement"),
      option("space", t("fields.scope.space"), scope === "space"),
    );
    scopeSelect.addEventListener("change", () => {
      scope = scopeSelect.value as FieldScope;
      editing = null;
      render();
    });
    scopeRow.append(scopeLabel, scopeSelect);

    const fieldsSection = el("section", "settings-section");
    fieldsSection.append(el("h3", "", t("fields.listTitle")));
    const count = store.project ? fieldsForScope(store.project, scope).length : 0;
    fieldsSection.append(el("p", "settings-note", t("fields.listNote", { count })));
    const add = el("button", "btn btn-small", t("fields.addField"));
    add.type = "button";
    add.addEventListener("click", () => {
      editing = emptyFieldDraft(scope);
      render();
    });
    fieldsSection.append(add);

    const onSave = (draft: FieldDraft): FieldProblem[] => {
      const project = store.project;
      if (!project) return [{ code: "fieldNotFound" }];
      // A rejected save must not create an undo step or mark the project dirty.
      const problems = validateFieldDraft(project, draft);
      if (problems.length) return problems;
      let applied: FieldProblem[] = [];
      store.mutate((current) => {
        if (draft.id) {
          applied = updateField(current, draft);
          return;
        }
        applied = createField(current, draft, makeId("field")).problems;
      }, "change");
      return applied;
    };

    if (editing) {
      fieldsSection.append(
        fieldForm({
          project: store.project!,
          draft: editing,
          onSave,
          onCancel: () => {
            editing = null;
            render();
          },
          onSaved: () => {
            const label = editing?.label.trim() ?? "";
            const created = editing?.id === undefined;
            editing = null;
            toast(
              created ? t("fields.created", { name: label }) : t("fields.updated", { name: label }),
            );
            render();
          },
        }),
      );
    } else {
      fieldsSection.append(
        fieldList({
          scope,
          onEdit: (field: FieldDefinition) => {
            editing = fieldDraftFor(field);
            render();
          },
          onChanged: render,
        }),
      );
    }

    const setsSection = el("section", "settings-section");
    setsSection.append(fieldSetsPanel({ scope, onChanged: render }));

    body.append(scopeRow, fieldsSection, setsSection);
  };

  render();
  return showModal({
    title: t("fields.dialogTitle"),
    subtitle: t("fields.dialogSubtitle"),
    body,
    wide: true,
    actions: [{ label: t("common.close"), value: "close", primary: true }],
  }).then(() => undefined);
}
