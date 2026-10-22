import { categoryNameError, normalizeCategoryName } from "../model/categories";
import type { Category } from "../model/types";
import { store } from "../state/store";
import { showModal } from "./dialogs";
import { clear, el, option } from "./dom";
import { icon } from "./icons";
import { toast } from "./toast";

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
export function openCategoriesDialog(): void {
  if (!store.project) return;

  const body = el("div", "form-stack category-manager");
  body.append(
    el(
      "p",
      "modal-message",
      "Categories group measurements in the quantity report. Names must be unique. Use the arrows to set report order.",
    ),
  );

  const list = el("div", "category-list");
  const confirm = el("div", "inline-confirm");
  confirm.hidden = true;

  const defaultField = el("label", "field");
  const defaultLabel = el("span", "field-label", "Default category for new measurements");
  const defaultSelect = el("select", "select");
  defaultField.append(defaultLabel, defaultSelect);
  defaultSelect.addEventListener("change", () => {
    store.setDefaultCategory(defaultSelect.value);
    render();
  });

  const addRow = el("div", "input-row");
  const addInput = el("input", "input");
  addInput.type = "text";
  addInput.placeholder = "New category";
  addInput.setAttribute("aria-label", "New category name");
  const addButton = el("button", "btn btn-small", "Add");
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
      toast("Could not add the category.", "warning");
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
      toast("A project needs at least one category.", "warning");
      return;
    }

    const usage = store.categoryItemCount(category.id);
    const isDefault = project.settings.quantity.defaultCategoryId === category.id;
    if (usage === 0 && !isDefault) {
      const result = store.removeCategory(category.id);
      if (result.removed) {
        toast(`Deleted “${category.name}”.`);
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
          ? `“${category.name}” contains ${usage} measurement${usage === 1 ? "" : "s"}. Move them to another category before deleting it.`
          : `“${category.name}” is the default category. Choose the new default before deleting it.`,
      ),
    );

    const targetRow = el("label", "field");
    targetRow.append(el("span", "field-label", "Move to"));
    const targetSelect = el("select", "select");
    for (const entry of others) {
      targetSelect.append(option(entry.id, entry.name, entry.id === preferred.id));
    }
    targetRow.append(targetSelect);

    const actions = el("div", "inline-confirm-actions");
    const cancel = el("button", "btn btn-small btn-ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", hideConfirm);
    const remove = el("button", "btn btn-small btn-danger", "Delete category");
    remove.type = "button";
    remove.addEventListener("click", () => {
      const result = store.removeCategory(category.id, targetSelect.value);
      if (!result.removed) {
        toast("Could not delete the category.", "warning");
        return;
      }
      hideConfirm();
      toast(
        result.moved > 0
          ? `Deleted “${category.name}” and moved ${result.moved} measurement${result.moved === 1 ? "" : "s"}.`
          : `Deleted “${category.name}”.`,
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
      toast("Could not rename the category.", "warning");
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
      name.setAttribute("aria-label", `Category name: ${category.name}`);
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
        usage > 0 ? `${usage} measurement${usage === 1 ? "" : "s"}` : "Unused",
      );
      if (project.settings.quantity.defaultCategoryId === category.id) {
        meta.classList.add("is-default");
        meta.textContent = usage > 0 ? `Default · ${usage}` : "Default";
      }

      const actions = el("div", "category-row-actions");
      const up = iconButton(icon("up", 14), `Move ${category.name} up`, () => {
        if (store.moveCategory(category.id, -1)) render();
      });
      up.disabled = index === 0;
      const down = iconButton(icon("down", 14), `Move ${category.name} down`, () => {
        if (store.moveCategory(category.id, 1)) render();
      });
      down.disabled = index === project.categories.length - 1;
      const remove = iconButton(icon("trash", 14), `Delete ${category.name}`, () =>
        requestDelete(category),
      );
      remove.disabled = project.categories.length <= 1;
      actions.append(up, down, remove);

      row.append(name, meta, actions);
      list.append(row);
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

  void showModal({
    title: "Categories",
    subtitle: "Project-wide grouping for measurements and quantity reports.",
    body,
    wide: true,
    actions: [{ label: "Done", value: "done", primary: true }],
  }).then(() => {
    hideConfirm();
  });
}
