import {
  BACKUP_RETENTION_MAX,
  BACKUP_RETENTION_MIN,
  loadAppPreferences,
  saveAppPreferences,
} from "../../io/appPreferences";
import { openBackupManagerDialog } from "../../features/saveIntegrity";
import { t } from "../../i18n";
import { store } from "../../state/store";
import { el } from "../dom";
import { field, section } from "../settingsControls";
import { toast } from "../toast";

/** Preferences → Data controls for rolling backups and their retention. */
export function backupSection(): HTMLElement {
  const wrap = section(t("preferences.data.backupTitle"), t("preferences.data.backupNote"));

  const select = el("select", "select");
  select.setAttribute("aria-label", t("preferences.data.backupRetention"));
  for (let retention = BACKUP_RETENTION_MIN; retention <= BACKUP_RETENTION_MAX; retention += 1) {
    const option = el(
      "option",
      "",
      t("preferences.data.backupRetentionValue", { count: retention }),
    );
    option.value = String(retention);
    select.append(option);
  }
  select.value = String(loadAppPreferences().backups.retention);
  select.addEventListener("change", () => {
    const retention = Number(select.value);
    saveAppPreferences({ backups: { retention } });
    toast(t("preferences.data.backupRetentionSaved", { count: retention }), "success");
  });
  wrap.append(field(t("preferences.data.backupRetention"), select));
  wrap.append(el("p", "settings-note", t("preferences.data.backupRetentionNote")));

  const actions = el("div", "settings-actions");
  const manage = el("button", "btn btn-small", t("preferences.data.openBackups"));
  manage.type = "button";
  manage.disabled = !store.project;
  manage.title = store.project
    ? t("preferences.data.openBackupsTitle")
    : t("saveIntegrity.managerNoProject");
  manage.addEventListener("click", () => {
    void openBackupManagerDialog();
  });
  actions.append(manage);
  wrap.append(actions);
  return wrap;
}
