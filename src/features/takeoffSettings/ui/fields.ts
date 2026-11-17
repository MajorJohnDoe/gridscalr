import { fieldSetsForScope, fieldsForScope, openFieldsDialog } from "../../fields";
import { countTypeLabel } from "../../../model/countTypes";
import { itemKindLabel } from "../../../model/measure";
import type { FieldDefinition, FieldScope } from "../../../model/types";
import { store } from "../../../state/store";
import { el } from "../../../ui/dom";
import { t, type MessageKey } from "../../../i18n";

/**
 * Fields tab. It lists the custom fields and field sets from the fields feature
 * and opens the existing editor; the editor and its rules stay in
 * `src/features/fields`, so the hub never forks field behaviour.
 */

const SCOPES: readonly FieldScope[] = ["measurement", "space"];

export function fieldsSection(onReturn: () => void): HTMLElement {
  const project = store.project;
  const root = el("section", "settings-section takeoff-fields");
  root.append(el("h3", "", t("takeoffSettings.fields.title")));
  root.append(el("p", "settings-note", t("takeoffSettings.fields.intro")));
  if (!project) return root;

  for (const scope of SCOPES) {
    const fields = fieldsForScope(project, scope);
    const block = el("section", "takeoff-field-scope");
    block.dataset.scope = scope;
    block.append(el("h4", "", t(`fields.scope.${scope}` as MessageKey)));
    block.append(el("p", "settings-note", t("fields.listNote", { count: fields.length })));
    if (!fields.length) {
      block.append(el("p", "takeoff-field-empty", t("fields.empty")));
    } else {
      const list = el("ul", "takeoff-field-list");
      for (const field of fields) list.append(fieldRow(project, field));
      block.append(list);
    }
    root.append(block);
  }

  const sets = fieldSetsForScope(project, "measurement").concat(
    fieldSetsForScope(project, "space"),
  );
  const setsBlock = el("section", "takeoff-field-scope takeoff-field-sets");
  setsBlock.append(el("h4", "", t("fields.setsTitle")));
  setsBlock.append(el("p", "settings-note", t("takeoffSettings.fields.setsNote")));
  if (!sets.length) {
    setsBlock.append(el("p", "takeoff-field-empty", t("takeoffSettings.fields.setsEmpty")));
  } else {
    const list = el("ul", "takeoff-field-list");
    for (const set of sets) {
      const item = el("li", "takeoff-field-row");
      item.append(
        el("span", "takeoff-field-name", set.name),
        el("span", "takeoff-field-meta", t(`fields.scope.${set.scope}` as MessageKey)),
        el("span", "takeoff-field-meta", t("fields.setFieldCount", { count: set.fieldIds.length })),
      );
      list.append(item);
    }
    setsBlock.append(list);
  }
  root.append(setsBlock);

  const manage = el("button", "btn btn-small btn-primary", t("fields.manage"));
  manage.type = "button";
  manage.addEventListener("click", () => {
    void openFieldsDialog().then(onReturn);
  });
  root.append(manage);
  return root;
}

function fieldRow(
  project: NonNullable<typeof store.project>,
  field: FieldDefinition,
): HTMLLIElement {
  const item = el("li", "takeoff-field-row");
  item.append(el("span", "takeoff-field-name", field.label));
  item.append(el("span", "takeoff-field-meta", t(`fields.type.${field.type}` as MessageKey)));
  const labels = appliesToLabels(project, field);
  item.append(
    el(
      "span",
      "takeoff-field-meta takeoff-field-applies",
      labels.length
        ? t("takeoffSettings.fields.appliesTo", { names: labels.join(", ") })
        : t("takeoffSettings.objects.appliesAll"),
    ),
  );
  return item;
}

function appliesToLabels(
  project: NonNullable<typeof store.project>,
  field: FieldDefinition,
): string[] {
  const applies = field.appliesTo;
  if (!applies) return [];
  const labels: string[] = [];
  for (const kind of applies.itemKinds ?? []) labels.push(itemKindLabel(kind));
  for (const categoryId of applies.categoryIds ?? []) {
    const category = project.categories.find((entry) => entry.id === categoryId);
    if (category) labels.push(category.name);
  }
  for (const typeId of applies.countTypes ?? []) {
    if (project.countTypes.some((entry) => entry.id === typeId)) {
      labels.push(countTypeLabel(project, typeId));
    }
  }
  for (const kind of applies.spaceKinds ?? []) {
    labels.push(t(`fields.spaceKind.${kind}` as MessageKey));
  }
  return labels;
}
