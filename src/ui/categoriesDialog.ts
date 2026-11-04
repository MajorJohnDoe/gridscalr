import { categoryNameError, normalizeCategoryName } from "../model/categories";
import { formatNumber } from "../model/units";
import type { Category } from "../model/types";
import { store } from "../state/store";
import { showModal } from "./dialogs";
import { clear, el, option } from "./dom";
import { icon } from "./icons";
import { toast } from "./toast";
import { t } from "../i18n";

function iconButton(markup: string, label: string, onClick: () => void): HTMLButtonElement {
  const node = el("button", "icon-btn category-action");
  node.type = "button";
  node.title = label;
  node.setAttribute("aria-label", label);
  node.innerHTML = markup;
  node.addEventListener("click", onClick);
  return node;
}

/**
 * Category management. Every mutation goes through the store so it becomes a
 * single undo step, and measurements are always reassigned before a category
 * disappears.
 */
export function openCategoriesDialog(): Promise<void> {
  if (!store.project) return Promise.resolve();

  const body = el("div", "form-stack category-manager");
  body.append(el("p", "modal-message", t("category.intro")));

  const list = el("div", "category-list");
  const confirm = el("div", "inline-confirm");
  confirm.hidden = true;

  const defaultField = el("label", "field");
  const defaultLabel = el("span", "field-label", t("category.defaultNew"));
  const defaultSelect = el("select", "select");
  defaultField.append(defaultLabel, defaultSelect);
  defaultSelect.addEventListener("change", () => {
    store.setDefaultCategory(defaultSelect.value);
    render();
  });

  const addRow = el("div", "input-row");
  const addInput = el("input", "input");
  addInput.type = "text";
  addInput.placeholder = t("category.newCategory");
  addInput.setAttribute("aria-label", t("category.newCategoryAria"));
  const addButton = el("button", "btn btn-small", t("common.add"));
  addButton.type = "button";
  addRow.append(addInput, addButton);

  const addCategory = () => {
    const value = addInput.value;
    const error = categoryNameError(store.project?.categories ?? [], value);
    if (error) {
      toast(error, "warning");
      return;
    }
    if (!store.addCategory(value)) {
      toast(t("category.addFailed"), "warning");
      return;
    }
    addInput.value = "";
    render();
    addInput.focus();
  };

  addButton.addEventListener("click", addCategory);
  addInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCategory();
    }
  });

  body.append(list, defaultField, addRow, confirm);

  const hideConfirm = () => {
    confirm.hidden = true;
    clear(confirm);
  };

  const requestDelete = (category: Category) => {
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

    clear(confirm);
    confirm.hidden = false;
    confirm.append(
      el(
        "p",
        "inline-confirm-text",
        usage > 0
          ? t("category.contains", { name: category.name, count: usage })
          : t("category.isDefault", { name: category.name }),
      ),
    );

    const targetRow = el("label", "field");
    targetRow.append(el("span", "field-label", t("category.moveTo")));
    const targetSelect = el("select", "select");
    for (const entry of others) {
      targetSelect.append(option(entry.id, entry.name, entry.id === preferred.id));
    }
    targetRow.append(targetSelect);

    const actions = el("div", "inline-confirm-actions");
    const cancel = el("button", "btn btn-small btn-ghost", t("common.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", hideConfirm);
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
    actions.append(cancel, remove);
    confirm.append(targetRow, actions);
    targetSelect.focus();
  };

  const commitRename = (category: Category, input: HTMLInputElement) => {
    const name = normalizeCategoryName(input.value);
    if (name === category.name) {
      input.value = category.name;
      return;
    }
    const error = categoryNameError(store.project?.categories ?? [], name, category.id);
    if (error) {
      toast(error, "warning");
      input.value = category.name;
      return;
    }
    if (!store.renameCategory(category.id, name)) {
      toast(t("category.renameFailed"), "warning");
      input.value = category.name;
      return;
    }
    render();
  };

  const render = () => {
    const project = store.project;
    if (!project) return;
    hideConfirm();
    clear(list);

    project.categories.forEach((category, index) => {
      const row = el("div", "category-row");
      const name = el("input", "input category-name");
      name.type = "text";
      name.value = category.name;
      name.setAttribute("aria-label", t("category.nameAria", { name: category.name }));
      name.addEventListener("change", () => commitRename(category, name));
      name.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          name.blur();
        }
      });

      const usage = store.categoryItemCount(category.id);
      const meta = el(
        "span",
        "category-meta",
        usage > 0 ? t("category.usage", { count: usage }) : t("category.unused"),
      );
      if (project.settings.quantity.defaultCategoryId === category.id) {
        meta.classList.add("is-default");
        meta.textContent =
          usage > 0 ? t("category.defaultWithCount", { count: usage }) : t("category.defaultLabel");
      }

      const actions = el("div", "category-row-actions");
      const up = iconButton(
        icon("up", 14),
        t("category.moveUpAria", { name: category.name }),
        () => {
          if (store.moveCategory(category.id, -1)) render();
        },
      );
      up.disabled = index === 0;
      const down = iconButton(
        icon("down", 14),
        t("category.moveDownAria", { name: category.name }),
        () => {
          if (store.moveCategory(category.id, 1)) render();
        },
      );
      down.disabled = index === project.categories.length - 1;
      const remove = iconButton(
        icon("trash", 14),
        t("category.deleteAria", { name: category.name }),
        () => requestDelete(category),
      );
      remove.disabled = project.categories.length <= 1;
      actions.append(up, down, remove);

      row.append(name, meta, actions);

      const overrides = el("div", "category-overrides");
      const wasteWrap = el("label", "category-override");
      wasteWrap.append(el("span", "", t("category.waste")));
      const wasteInput = el("input", "input category-override-input");
      wasteInput.type = "number";
      wasteInput.min = "0";
      wasteInput.max = "100";
      wasteInput.step = "0.5";
      wasteInput.value = category.wastePercent === undefined ? "" : String(category.wastePercent);
      wasteInput.placeholder = t("category.wastePlaceholder", {
        value: formatNumber(project.settings.quantity.wastePercent, 1),
      });
      wasteInput.title = t("category.wasteInheritTitle");
      wasteInput.setAttribute("aria-label", t("category.wasteAria", { name: category.name }));
      wasteInput.addEventListener("change", () => {
        const raw = wasteInput.value.trim();
        const value = raw === "" ? null : Number(raw);
        if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
          wasteInput.value =
            category.wastePercent === undefined ? "" : String(category.wastePercent);
          toast(t("category.wasteInvalid"), "warning");
          return;
        }
        store.setCategoryQuantityOverride(category.id, "wastePercent", value);
        render();
      });
      wasteWrap.append(wasteInput, el("span", "category-override-unit", "%"));

      const roundingWrap = el("label", "category-override");
      roundingWrap.append(el("span", "", t("category.roundUp")));
      const roundingInput = el("input", "input category-override-input");
      roundingInput.type = "number";
      roundingInput.min = "0";
      roundingInput.step = "0.01";
      roundingInput.value =
        category.roundingStep === undefined ? "" : String(category.roundingStep);
      roundingInput.placeholder = t("category.roundPlaceholder", {
        value: formatNumber(project.settings.quantity.roundingStep, 2),
      });
      roundingInput.title = t("category.roundInheritTitle");
      roundingInput.setAttribute("aria-label", t("category.roundAria", { name: category.name }));
      roundingInput.addEventListener("change", () => {
        const raw = roundingInput.value.trim();
        const value = raw === "" ? null : Number(raw);
        if (value !== null && (!Number.isFinite(value) || value < 0)) {
          roundingInput.value =
            category.roundingStep === undefined ? "" : String(category.roundingStep);
          toast(t("category.roundInvalid"), "warning");
          return;
        }
        store.setCategoryQuantityOverride(category.id, "roundingStep", value);
        render();
      });
      roundingWrap.append(roundingInput);

      overrides.append(wasteWrap, roundingWrap);
      const item = el("div", "category-item");
      item.append(row, overrides);
      list.append(item);
    });

    clear(defaultSelect);
    for (const category of project.categories) {
      defaultSelect.append(
        option(
          category.id,
          category.name,
          category.id === project.settings.quantity.defaultCategoryId,
        ),
      );
    }
  };

  render();

  return showModal({
    title: t("category.title"),
    subtitle: t("category.subtitle"),
    body,
    wide: true,
    actions: [{ label: t("category.done"), value: "done", primary: true }],
  }).then(() => {
    hideConfirm();
  });
}
