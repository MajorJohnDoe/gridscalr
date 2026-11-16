import { t } from "../../i18n";
import { store } from "../../state/store";
import { el } from "../../ui/dom";
import { section } from "../../ui/settingsControls";
import { openFieldsDialog } from "./ui/fieldDialog";

/** Project settings → Fields: a count summary and the editor entry point. */
export function fieldsSettingsSection(onRefresh: () => void): HTMLElement {
  const project = store.project;
  const wrap = section(t("fields.settingsTitle"), t("fields.settingsNote"));
  if (!project) return wrap;
  wrap.append(
    el(
      "p",
      "settings-note",
      t("fields.settingsSummary", {
        fields: project.fieldDefinitions.length,
        sets: project.fieldSets.length,
      }),
    ),
  );
  const manage = el("button", "btn btn-small", t("fields.manage"));
  manage.type = "button";
  manage.addEventListener("click", () => {
    void openFieldsDialog().then(onRefresh);
  });
  wrap.append(manage);
  return wrap;
}

export { openFieldsDialog } from "./ui/fieldDialog";
export { appendFieldsSection } from "./ui/inspector";
export type { FieldsSectionOptions } from "./ui/inspector";
