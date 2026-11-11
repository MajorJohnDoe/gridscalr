import { t } from "../../i18n";
import { formatDate } from "../../i18n/format";
import { formatBytes } from "../../io/platform";
import { showModal } from "../../ui/dialogs";
import { el } from "../../ui/dom";
import type { BackupEntry } from "./backup";
import {
  canReplaceOpenProject,
  defaultBackupSelection,
  findBackup,
  originNeedsWarning,
  totalBackupBytes,
  type BackupManagerChoice,
} from "./backupManagerModel";

function row(entry: BackupEntry, selected: string | null): HTMLElement {
  const label = el("label", "recovery-row");
  label.dataset.backupPath = entry.path;
  const radio = el("input");
  radio.type = "radio";
  radio.name = "backup-manager-choice";
  radio.value = entry.path;
  radio.checked = entry.path === selected;
  const text = el("span", "recovery-row-text");
  text.append(
    el(
      "span",
      "recovery-row-heading",
      t("saveIntegrity.managerRowMeta", {
        time: formatDate(entry.modifiedAt, { dateStyle: "medium", timeStyle: "short" }),
        size: formatBytes(entry.sizeBytes),
      }),
    ),
    el(
      "span",
      "recovery-row-meta",
      entry.projectPath
        ? t("saveIntegrity.managerOrigin", { path: entry.projectPath })
        : t("saveIntegrity.managerUnknownOrigin"),
    ),
  );
  if (entry.projectPath) text.title = entry.projectPath;
  label.append(radio, text);
  return label;
}

/**
 * Lists every backup for the open project with its time, size and origin path.
 * Restore, replace and delete return the selected entry; the caller performs
 * the confirmed action so storage and the unsaved-changes guard stay outside
 * the DOM layer.
 */
export async function openBackupManager(
  entries: readonly BackupEntry[],
  options: {
    selectedPath?: string | null;
    currentProjectPath: string | null;
    retention: number;
  },
): Promise<BackupManagerChoice> {
  let selected = defaultBackupSelection(entries);
  if (options.selectedPath && findBackup(entries, options.selectedPath)) {
    selected = options.selectedPath;
  }
  const body = el("div", "form-stack backup-manager");
  body.append(el("p", "modal-message", t("saveIntegrity.managerIntro")));

  if (!entries.length) {
    const empty = el("div", "recovery-empty");
    empty.append(
      el("strong", "", t("saveIntegrity.managerEmptyTitle")),
      el("p", "settings-note", t("saveIntegrity.managerEmptyNote")),
      el("p", "settings-note", t("saveIntegrity.managerRetention", { keep: options.retention })),
    );
    body.append(empty);
    await showModal({
      title: t("saveIntegrity.managerTitle"),
      subtitle: t("saveIntegrity.managerSubtitle"),
      body,
      wide: true,
      actions: [{ label: t("common.close"), value: "close", primary: true }],
    });
    return { action: "cancel", entry: null };
  }

  body.append(
    el(
      "p",
      "recovery-storage",
      t("saveIntegrity.managerTotal", {
        count: entries.length,
        size: formatBytes(totalBackupBytes(entries)),
      }),
    ),
    el("p", "settings-note", t("saveIntegrity.managerRetention", { keep: options.retention })),
  );

  const warning = el("p", "recovery-warning hidden");
  const syncWarning = (): void => {
    const entry = findBackup(entries, selected);
    const needed = originNeedsWarning(entry, options.currentProjectPath);
    warning.classList.toggle("hidden", !needed);
    warning.textContent = needed
      ? t("saveIntegrity.managerOriginWarning", {
          path: entry?.projectPath ?? t("saveIntegrity.managerUnknownOrigin"),
        })
      : "";
  };

  const list = el("div", "recovery-list");
  for (const entry of entries) list.append(row(entry, selected));
  list.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    selected = target.value;
    syncWarning();
  });
  syncWarning();

  body.append(
    list,
    warning,
    el("p", "settings-note", t("saveIntegrity.managerCopyNote")),
    el(
      "p",
      "settings-note",
      canReplaceOpenProject(options.currentProjectPath)
        ? t("saveIntegrity.managerReplaceNote", { path: options.currentProjectPath ?? "" })
        : t("saveIntegrity.managerReplaceUnavailable"),
    ),
  );

  const actions = [
    { label: t("common.close"), value: "close" },
    {
      label: t("saveIntegrity.managerDelete"),
      value: "delete",
      danger: true,
    },
    {
      label: t("saveIntegrity.managerDeleteAll"),
      value: "delete-all",
      danger: true,
    },
  ];
  if (canReplaceOpenProject(options.currentProjectPath)) {
    actions.push({ label: t("saveIntegrity.managerReplace"), value: "replace", danger: false });
  }
  actions.push({
    label: t("saveIntegrity.managerRestoreCopy"),
    value: "restore-copy",
    danger: false,
  });

  const value = await showModal({
    title: t("saveIntegrity.managerTitle"),
    subtitle: t("saveIntegrity.managerSubtitle"),
    body,
    wide: true,
    className: "modal-backup-manager",
    actions,
  });
  if (value === "delete-all") return { action: "delete-all", entry: null };
  const entry = findBackup(entries, selected);
  if (!entry) return { action: "cancel", entry: null };
  if (value === "delete" || value === "replace" || value === "restore-copy") {
    return { action: value, entry };
  }
  return { action: "cancel", entry: null };
}
