import { openCountTypesDialog } from "../../features/countTypes";
import { t } from "../../i18n";
import { store } from "../../state/store";
import { el } from "../dom";
import { section } from "../settingsControls";

export function countTypesSection(onRefresh: () => void): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.countTypesTitle"), t("settings.countTypesNote"));
  const manage = el(
    "button",
    "btn btn-small",
    t("settings.manageCountTypes", { count: project.countTypes.length }),
  );
  manage.type = "button";
  manage.addEventListener("click", () => {
    void openCountTypesDialog().then(() => {
      onRefresh();
    });
  });
  wrap.append(manage);
  return wrap;
}
