import { t } from "../../i18n";
import { loadGlobalStampPresets } from "../../io/stampDefaults";
import { store } from "../../state/store";
import { el } from "../dom";
import { presetEditor, section } from "../settingsControls";
import { toast } from "../toast";

export function stampsSection(onRefresh: () => void): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.stampsTitle"), t("settings.stampsNote"));

  const editor = presetEditor(
    project.settings.stampPresets,
    (next) => {
      store.mutate((current) => {
        current.settings.stampPresets = next;
      }, "change");
    },
    t("settings.newPreset"),
  );

  const loadDefaults = el("button", "btn btn-small", t("settings.loadDefaults"));
  loadDefaults.type = "button";
  loadDefaults.addEventListener("click", () => {
    const next = loadGlobalStampPresets();
    store.mutate((current) => {
      current.settings.stampPresets = next;
    }, "change");
    toast(t("settings.stampsUpdated"), "success");
    onRefresh();
  });

  const actions = el("div", "settings-actions");
  actions.append(loadDefaults);
  wrap.append(el("div", "settings-subhead", t("settings.projectPresets")), editor, actions);
  return wrap;
}
