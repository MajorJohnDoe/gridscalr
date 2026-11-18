import { showModal } from "../../../ui/dialogs";
import { categoryLayout } from "../../../ui/settingsControls";
import { toast } from "../../../ui/toast";
import { store } from "../../../state/store";
import { t } from "../../../i18n";
import type { TakeoffSettingsTarget } from "../model";
import { cardsSection } from "./cards";
import { fieldsSection } from "./fields";
import { objectsSection } from "./objects";
import { tablesSection } from "./tables";

/**
 * The Takeoff settings hub. One modal, four tabs, one home per takeoff
 * concept. Reopening a tab after a nested editor keeps the user in the hub
 * without writing any project data.
 */

export function openTakeoffSettingsDialog(
  target: TakeoffSettingsTarget = { tab: "objects" },
): Promise<void> {
  if (!store.project) return Promise.resolve();
  // The hub edits project data, so a view-only session refuses the deep link
  // instead of showing controls whose store mutations are silently ignored.
  if (store.readOnly) {
    toast(t("viewOnly.disabled"), "warning");
    return Promise.resolve();
  }
  const layout = categoryLayout(
    t("takeoffSettings.tabsAria"),
    [
      {
        id: "objects",
        label: t("takeoffSettings.tab.objects"),
        render: () => [objectsSection(target.focusId)],
      },
      {
        id: "fields",
        label: t("takeoffSettings.tab.fields"),
        render: () => [fieldsSection(() => refresh())],
      },
      {
        id: "tables",
        label: t("takeoffSettings.tab.tables"),
        render: () => [tablesSection(() => refresh())],
      },
      {
        id: "cards",
        label: t("takeoffSettings.tab.cards"),
        render: () => [cardsSection(target.focusId)],
      },
    ],
    target.tab,
  );
  // A nested field or table editor now stacks on top of the hub instead of
  // replacing it, so returning repaints the current tab in place.
  const refresh = () => layout.refresh();

  return showModal({
    title: t("takeoffSettings.title"),
    subtitle: t("takeoffSettings.subtitle"),
    body: layout.body,
    wide: true,
    className: "modal-settings takeoff-settings-modal",
    actions: [{ label: t("common.close"), value: "close", primary: true }],
  }).then(() => undefined);
}
