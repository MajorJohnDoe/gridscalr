import { t } from "../../i18n";
import { store } from "../../state/store";
import { openCategoriesDialog } from "../categoriesDialog";
import { el, option } from "../dom";
import { field, section } from "../settingsControls";
import { toast } from "../toast";

export function quantitiesSection(onRefresh: () => void): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.quantitiesTitle"), t("settings.quantitiesNote"));

  const defaultCategory = el("select", "select");
  defaultCategory.setAttribute("aria-label", t("settings.defaultCategory"));
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

  const row = el("div", "field-row");
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

  row.append(field(t("settings.wastePercent"), waste), field(t("settings.roundUp"), rounding));
  wrap.append(field(t("settings.defaultCategoryLabel"), defaultCategory), row);

  const manage = el(
    "button",
    "btn btn-small",
    t("settings.manageCategories", { count: project.categories.length }),
  );
  manage.type = "button";
  manage.addEventListener("click", () => {
    void openCategoriesDialog().then(() => {
      onRefresh();
    });
  });
  wrap.append(manage);
  return wrap;
}
