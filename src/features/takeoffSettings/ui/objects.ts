import { categoryNameError } from "../../../model/categories";
import {
  addCountType,
  countTypeItemCount,
  countTypeNameError,
  isBuiltInCountType,
  normalizeCountTypeName,
} from "../../../model/countTypes";
import type { Category } from "../../../model/types";
import { store } from "../../../state/store";
import { clear, el, option } from "../../../ui/dom";
import { field } from "../../../ui/settingsControls";
import { toast } from "../../../ui/toast";
import { t } from "../../../i18n";
import { countTypeObjectRows, deleteCountType } from "../../countTypes";
import { categoryObjectRows } from "./categoryRows";
import { categoryFieldLabels, countTypeFieldLabels } from "../model";

/**
 * Objects tab: one list for measured objects (categories) and counted objects
 * (count types), with the project waste, rounding and default-category controls
 * on top. Every row action calls the existing store or model method, so a
 * rename, reorder, override or delete remains one undo step.
 */

export function objectsSection(focusId?: string): HTMLElement {
  const root = el("section", "settings-section takeoff-objects");
  root.append(el("h3", "", t("takeoffSettings.objects.title")));
  root.append(el("p", "settings-note", t("takeoffSettings.objects.intro")));

  const kinds = el("div", "takeoff-object-kinds");
  const measuredNote = el("p", "takeoff-object-kind");
  measuredNote.append(
    el("span", "status-chip", t("takeoffSettings.objects.measured")),
    el("span", "", t("takeoffSettings.objects.measuredNote")),
  );
  const countedNote = el("p", "takeoff-object-kind");
  countedNote.append(
    el("span", "status-chip", t("takeoffSettings.objects.counted")),
    el("span", "", t("takeoffSettings.objects.countedNote")),
  );
  kinds.append(measuredNote, countedNote);
  root.append(kinds);

  const defaults = el("div", "takeoff-object-defaults");
  const tableWrap = el("div", "takeoff-object-table-wrap");
  const table = el("table", "takeoff-object-table");
  const head = el("thead");
  const headRow = el("tr");
  for (const key of [
    "nameColumn",
    "typeColumn",
    "unitColumn",
    "quantityColumn",
    "appliesColumn",
    "actionsColumn",
  ] as const) {
    const th = el("th");
    th.scope = "col";
    th.textContent = t(`takeoffSettings.objects.${key}`);
    headRow.append(th);
  }
  head.append(headRow);
  const body = el("tbody");
  table.append(head, body);
  tableWrap.append(table);

  const confirm = el("div", "inline-confirm");
  confirm.hidden = true;
  const hideConfirm = () => {
    confirm.hidden = true;
    clear(confirm);
  };

  const focusRow = (id: string) => {
    body.querySelector<HTMLInputElement>(`tr[data-object-id="${id}"] input`)?.focus();
  };

  const render = () => {
    const project = store.project;
    if (!project) return;
    hideConfirm();
    clear(body);
    body.append(
      ...categoryObjectRows({
        onChanged: render,
        onDelete: requestCategoryDelete,
        appliesTo: (id) => categoryFieldLabels(project, id),
      }),
      ...countTypeObjectRows({
        onChanged: render,
        onDelete: requestCountTypeDelete,
        appliesTo: (id) => countTypeFieldLabels(project, id),
      }),
    );
    if (!body.children.length) body.append(emptyRow());
    renderDefaults(project);
  };

  const renderDefaults = (project: NonNullable<typeof store.project>) => {
    clear(defaults);
    defaults.append(
      el("h4", "", t("takeoffSettings.objects.defaultsTitle")),
      el("p", "settings-note", t("takeoffSettings.objects.defaultsNote")),
    );

    const defaultCategory = el("select", "select");
    defaultCategory.setAttribute("aria-label", t("settings.defaultCategoryLabel"));
    for (const category of project.categories) {
      defaultCategory.append(
        option(
          category.id,
          category.name,
          category.id === project.settings.quantity.defaultCategoryId,
        ),
      );
    }
    defaultCategory.addEventListener("change", () => {
      store.setDefaultCategory(defaultCategory.value);
    });

    const waste = el("input", "input");
    waste.type = "number";
    waste.min = "0";
    waste.max = "100";
    waste.step = "0.5";
    waste.value = String(project.settings.quantity.wastePercent);
    waste.setAttribute("aria-label", t("settings.wasteAria"));
    waste.addEventListener("change", () => {
      const value = Number(waste.value);
      if (waste.value.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100) {
        waste.value = String(project.settings.quantity.wastePercent);
        toast(t("settings.wasteInvalid"), "warning");
        return;
      }
      store.setQuantityDefaults({ wastePercent: value });
    });

    const rounding = el("input", "input");
    rounding.type = "number";
    rounding.min = "0";
    rounding.step = "0.01";
    rounding.value = String(project.settings.quantity.roundingStep);
    rounding.setAttribute("aria-label", t("settings.roundingAria"));
    rounding.addEventListener("change", () => {
      const value = Number(rounding.value);
      if (rounding.value.trim() === "" || !Number.isFinite(value) || value < 0) {
        rounding.value = String(project.settings.quantity.roundingStep);
        toast(t("settings.roundingInvalid"), "warning");
        return;
      }
      store.setQuantityDefaults({ roundingStep: value });
    });

    const row = el("div", "field-row");
    row.append(field(t("settings.wastePercent"), waste), field(t("settings.roundUp"), rounding));
    defaults.append(field(t("settings.defaultCategoryLabel"), defaultCategory), row);
  };

  const requestCategoryDelete = (category: Category) => {
    const project = store.project;
    if (!project) return;
    if (project.categories.length <= 1) {
      toast(t("category.needsOne"), "warning");
      return;
    }
    const usage = store.categoryItemCount(category.id);
    const isDefault = project.settings.quantity.defaultCategoryId === category.id;
    if (usage === 0 && !isDefault) {
      const result = store.removeCategory(category.id);
      if (result.removed) {
        toast(t("category.deleteEmpty", { name: category.name }));
        render();
      }
      return;
    }

    const others = project.categories.filter((entry) => entry.id !== category.id);
    const preferred =
      others.find((entry) => entry.id === project.settings.quantity.defaultCategoryId) ?? others[0];
    const targetRow = el("label", "field");
    targetRow.append(el("span", "field-label", t("category.moveTo")));
    const targetSelect = el("select", "select");
    for (const entry of others) {
      targetSelect.append(option(entry.id, entry.name, entry.id === preferred.id));
    }
    targetRow.append(targetSelect);

    const remove = el("button", "btn btn-small btn-danger", t("category.deleteCategory"));
    remove.type = "button";
    remove.addEventListener("click", () => {
      const result = store.removeCategory(category.id, targetSelect.value);
      if (!result.removed) {
        toast(t("category.deleteFailed"), "warning");
        return;
      }
      hideConfirm();
      toast(
        result.moved > 0
          ? t("category.deleteWithMoved", { name: category.name, count: result.moved })
          : t("category.deleteEmpty", { name: category.name }),
      );
      render();
    });

    showConfirm(
      usage > 0
        ? t("category.contains", { name: category.name, count: usage })
        : t("category.isDefault", { name: category.name }),
      [targetRow],
      remove,
      targetSelect,
    );
  };

  const requestCountTypeDelete = (id: string, label: string) => {
    const project = store.project;
    if (!project) return;
    if (isBuiltInCountType(id)) {
      toast(t("countTypeUi.builtInCannotDelete"), "warning");
      return;
    }
    const usage = countTypeItemCount(project, id);
    const removeNow = () => {
      const result = deleteCountType(id);
      if (!result.removed) {
        toast(t("countTypeUi.builtInCannotDelete"), "warning");
        return;
      }
      toast(
        result.reassigned > 0
          ? t("countTypeUi.deletedMoved", { name: label, count: result.reassigned })
          : t("countTypeUi.deleted", { name: label }),
      );
      render();
    };

    if (usage === 0) {
      removeNow();
      return;
    }

    const remove = el("button", "btn btn-small btn-danger", t("countTypeUi.deleteTitle"));
    remove.type = "button";
    remove.addEventListener("click", () => {
      hideConfirm();
      removeNow();
    });
    showConfirm(t("countTypeUi.used", { name: label, count: usage }), [], remove, remove);
  };

  const showConfirm = (
    message: string,
    extra: HTMLElement[],
    action: HTMLButtonElement,
    focus: HTMLElement,
  ) => {
    clear(confirm);
    confirm.hidden = false;
    confirm.append(el("p", "inline-confirm-text", message), ...extra);
    const actions = el("div", "inline-confirm-actions");
    const cancel = el("button", "btn btn-small btn-ghost", t("common.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", hideConfirm);
    actions.append(cancel, action);
    confirm.append(actions);
    confirm.hidden = false;
    focus.focus();
  };

  const add = el("div", "takeoff-object-add");
  add.append(el("h4", "", t("takeoffSettings.objects.addTitle")));
  const addRow = el("div", "input-row");
  const addName = el("input", "input");
  addName.type = "text";
  addName.placeholder = t("takeoffSettings.objects.newName");
  addName.setAttribute("aria-label", t("takeoffSettings.objects.newName"));
  const addKind = el("select", "select");
  addKind.setAttribute("aria-label", t("takeoffSettings.objects.kind"));
  addKind.append(
    option("measure", t("takeoffSettings.objects.measured"), true),
    option("count", t("takeoffSettings.objects.counted")),
  );
  const addButton = el("button", "btn btn-small", t("takeoffSettings.objects.add"));
  addButton.type = "button";
  const submitAdd = () => {
    const project = store.project;
    if (!project) return;
    if (addKind.value === "count") {
      const error = countTypeNameError(project.countTypes, addName.value);
      if (error) {
        toast(error, "warning");
        return;
      }
      let created = false;
      store.mutate((next) => {
        created = addCountType(next, normalizeCountTypeName(addName.value), "other") !== null;
      }, "change");
      if (!created) {
        toast(t("takeoffSettings.objects.addFailed"), "warning");
        return;
      }
    } else {
      const error = categoryNameError(project.categories, addName.value);
      if (error) {
        toast(error, "warning");
        return;
      }
      if (!store.addCategory(addName.value)) {
        toast(t("category.addFailed"), "warning");
        return;
      }
    }
    addName.value = "";
    render();
    addName.focus();
  };
  addButton.addEventListener("click", submitAdd);
  addName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitAdd();
    }
  });
  addRow.append(addName, addKind, addButton);
  add.append(addRow);

  root.append(defaults, add, tableWrap, confirm);
  render();

  // A deep link from the inspector lands on the matching row.
  if (focusId) {
    requestAnimationFrame(() => requestAnimationFrame(() => focusRow(focusId)));
  }
  return root;
}

function emptyRow(): HTMLTableRowElement {
  const row = el("tr", "takeoff-object-empty");
  const cell = el("td");
  cell.colSpan = 6;
  cell.textContent = t("takeoffSettings.objects.empty");
  row.append(cell);
  return row;
}
