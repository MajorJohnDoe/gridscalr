import { store } from "../state/store";
import { showModal } from "./dialogs";
import { t } from "../i18n";
import { projectSection } from "./settings/project";
import { storageSection } from "./settings/storage";
import { metadataSection } from "./settings/metadata";
import { scaleSection } from "./settings/scale";
import { unitsSection } from "./settings/units";
import { labelsSection } from "./settings/labels";
import { displaySection } from "./settings/display";
import { quantitiesSection } from "./settings/quantities";
import { countTypesSection } from "./settings/countTypes";
import { stampsSection } from "./settings/stamps";
import { categoryLayout } from "./settingsControls";

type SettingsCategory = "project" | "report" | "measurements" | "display" | "quantities" | "stamps";

export function openSettingsDialog(initialCategory: SettingsCategory = "project"): void {
  if (!store.project) return;
  let refresh = () => {};
  const layout = categoryLayout(
    t("settings.categories"),
    [
      {
        id: "project",
        label: t("settings.projectTitle"),
        render: () => [projectSection(), storageSection()],
      },
      {
        id: "report",
        label: t("settings.navReport"),
        render: () => [metadataSection(refresh)],
      },
      {
        id: "measurements",
        label: t("settings.navMeasurements"),
        render: () => [scaleSection(), unitsSection(), labelsSection()],
      },
      {
        id: "display",
        label: t("settings.navDisplay"),
        render: () => [displaySection()],
      },
      {
        id: "quantities",
        label: t("settings.quantitiesTitle"),
        render: () => [
          quantitiesSection(() => openSettingsDialog("quantities")),
          countTypesSection(() => openSettingsDialog("quantities")),
        ],
      },
      {
        id: "stamps",
        label: t("settings.stampsTitle"),
        render: () => [stampsSection(refresh)],
      },
    ],
    initialCategory,
  );
  refresh = layout.refresh;

  void showModal({
    title: t("settings.dialogTitle"),
    subtitle: t("settings.dialogSubtitle"),
    body: layout.body,
    wide: true,
    className: "modal-settings",
    actions: [{ label: t("settings.close"), value: "close", primary: true }],
  });
}
