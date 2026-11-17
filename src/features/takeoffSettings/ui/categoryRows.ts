import { categoryNameError, normalizeCategoryName } from "../../../model/categories";
import { formatNumber, lengthUnitLabel, unitLabel } from "../../../model/units";
import type { Category } from "../../../model/types";
import { store } from "../../../state/store";
import { el } from "../../../ui/dom";
import { icon } from "../../../ui/icons";
import { toast } from "../../../ui/toast";
import { t } from "../../../i18n";

/**
 * Measured-object rows for the Takeoff settings hub. Rename, reorder and the
 * optional waste and rounding overrides call the same store methods the old
 * category manager used, so every change stays one undo step and the same
 * validation messages apply.
 */

export interface CategoryRowOptions {
  /** Repaints the list after a change that alters order or labels. */
  onChanged: () => void;
  /** The hub owns the delete confirmation and the reassignment target. */
  onDelete: (category: Category) => void;
  /** Field labels whose applies-to rule names this category. */
  appliesTo: (id: string) => string[];
}

function iconButton(markup: string, label: string, onClick: () => void): HTMLButtonElement {
  const node = el("button", "icon-btn category-action");
  node.type = "button";
  node.title = label;
  node.setAttribute("aria-label", label);
  node.innerHTML = markup;
  node.addEventListener("click", onClick);
  return node;
}

function commitRename(category: Category, input: HTMLInputElement, onChanged: () => void): void {
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
  onChanged();
}

function numericOverride(
  category: Category,
  kind: "wastePercent" | "roundingStep",
  options: {
    label: string;
    aria: string;
    placeholder: string;
    title: string;
    invalid: string;
    min: number;
    max?: number;
    step: string;
  },
  onChanged: () => void,
): HTMLElement {
  const wrap = el("label", "category-override");
  wrap.append(el("span", "", options.label));
  const input = el("input", "input category-override-input");
  input.type = "number";
  input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  input.step = options.step;
  const current = category[kind];
  input.value = current === undefined ? "" : String(current);
  input.placeholder = options.placeholder;
  input.title = options.title;
  input.setAttribute("aria-label", options.aria);
  input.addEventListener("change", () => {
    const raw = input.value.trim();
    const value = raw === "" ? null : Number(raw);
    if (
      value !== null &&
      (!Number.isFinite(value) ||
        value < options.min ||
        (options.max !== undefined && value > options.max))
    ) {
      input.value = category[kind] === undefined ? "" : String(category[kind]);
      toast(options.invalid, "warning");
      return;
    }
    store.setCategoryQuantityOverride(category.id, kind, value);
    onChanged();
  });
  wrap.append(input);
  if (kind === "wastePercent") wrap.append(el("span", "category-override-unit", "%"));
  return wrap;
}

export function categoryObjectRows(options: CategoryRowOptions): HTMLTableRowElement[] {
  const project = store.project;
  if (!project) return [];
  return project.categories.map((category, index) => {
    const row = el("tr", "takeoff-object-row takeoff-object-measured");
    row.dataset.objectId = category.id;
    row.dataset.objectKind = "measured";

    const nameCell = el("th", "takeoff-object-name");
    nameCell.scope = "row";
    const name = el("input", "input category-name");
    name.type = "text";
    name.value = category.name;
    name.setAttribute("aria-label", t("category.nameAria", { name: category.name }));
    name.addEventListener("change", () => commitRename(category, name, options.onChanged));
    name.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        name.blur();
      }
    });
    const usage = store.categoryItemCount(category.id);
    const meta = el(
      "span",
      "takeoff-object-meta",
      usage > 0 ? t("category.usage", { count: usage }) : t("category.unused"),
    );
    if (project.settings.quantity.defaultCategoryId === category.id) {
      meta.classList.add("is-default");
      meta.textContent =
        usage > 0 ? t("category.defaultWithCount", { count: usage }) : t("category.defaultLabel");
    }
    nameCell.append(name, meta);

    const typeCell = el("td");
    typeCell.append(el("span", "status-chip", t("takeoffSettings.objects.measured")));

    const unitCell = el("td", "takeoff-object-unit");
    unitCell.textContent = `${lengthUnitLabel(project.settings.lengthUnit)} · ${unitLabel(project.settings.areaUnit)}`;

    const quantityCell = el("td", "takeoff-object-quantity");
    const overrides = el("div", "category-overrides");
    overrides.append(
      numericOverride(
        category,
        "wastePercent",
        {
          label: t("category.waste"),
          aria: t("category.wasteAria", { name: category.name }),
          placeholder: t("category.wastePlaceholder", {
            value: formatNumber(project.settings.quantity.wastePercent, 1),
          }),
          title: t("category.wasteInheritTitle"),
          invalid: t("category.wasteInvalid"),
          min: 0,
          max: 100,
          step: "0.5",
        },
        options.onChanged,
      ),
      numericOverride(
        category,
        "roundingStep",
        {
          label: t("category.roundUp"),
          aria: t("category.roundAria", { name: category.name }),
          placeholder: t("category.roundPlaceholder", {
            value: formatNumber(project.settings.quantity.roundingStep, 2),
          }),
          title: t("category.roundInheritTitle"),
          invalid: t("category.roundInvalid"),
          min: 0,
          step: "0.01",
        },
        options.onChanged,
      ),
    );
    quantityCell.append(overrides);

    const labels = options.appliesTo(category.id);
    const appliesCell = el("td", "takeoff-object-applies");
    appliesCell.textContent = labels.length
      ? labels.join(", ")
      : t("takeoffSettings.objects.appliesAll");

    const actions = el("td", "takeoff-object-actions");
    const up = iconButton(icon("up", 14), t("category.moveUpAria", { name: category.name }), () => {
      if (store.moveCategory(category.id, -1)) options.onChanged();
    });
    up.disabled = index === 0;
    const down = iconButton(
      icon("down", 14),
      t("category.moveDownAria", { name: category.name }),
      () => {
        if (store.moveCategory(category.id, 1)) options.onChanged();
      },
    );
    down.disabled = index === project.categories.length - 1;
    const remove = iconButton(
      icon("trash", 14),
      t("category.deleteAria", { name: category.name }),
      () => options.onDelete(category),
    );
    remove.disabled = project.categories.length <= 1;
    actions.append(up, down, remove);

    row.append(nameCell, typeCell, unitCell, quantityCell, appliesCell, actions);
    return row;
  });
}
