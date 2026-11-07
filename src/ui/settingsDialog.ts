import { store } from "../state/store";
import { showModal } from "./dialogs";
import { el } from "./dom";
import { t } from "../i18n";
import { projectSection } from "./settings/project";
import { metadataSection } from "./settings/metadata";
import { scaleSection } from "./settings/scale";
import { unitsSection } from "./settings/units";
import { labelsSection } from "./settings/labels";
import { displaySection } from "./settings/display";
import { quantitiesSection } from "./settings/quantities";
import { countTypesSection } from "./settings/countTypes";
import { stampsSection } from "./settings/stamps";

export function openSettingsDialog(): void {
  if (!store.project) return;
  const body = el("div", "settings-dialog");
  const content = el("div", "settings-content");
  body.append(content);

  const render = () => {
    if (!store.project) return;
    content.replaceChildren(
      projectSection(),
      metadataSection(render),
      scaleSection(),
      unitsSection(),
      labelsSection(),
      displaySection(),
      quantitiesSection(render),
      countTypesSection(openSettingsDialog),
      stampsSection(render),
    );
  };
  render();

  void showModal({
    title: t("settings.dialogTitle"),
    subtitle: t("settings.dialogSubtitle"),
    body,
    wide: true,
    className: "modal-settings",
    actions: [{ label: t("settings.close"), value: "close", primary: true }],
  });
}
