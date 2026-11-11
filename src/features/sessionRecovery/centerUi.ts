import { t } from "../../i18n";
import { formatDate, formatNumber } from "../../i18n/format";
import { showModal } from "../../ui/dialogs";
import { el } from "../../ui/dom";
import type { RecoverableEntry } from "./recovery";
import { RECOVERY_BUDGET, recoveryUsage, serializedBytes } from "./budget";
import {
  baseVersionLabelKey,
  defaultCenterSelection,
  findCenterEntry,
  groupRecoveryEntries,
  needsRestoreConfirmation,
  type RecoveryCenterChoice,
  type RecoveryProjectGroup,
} from "./centerModel";

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return t("recoveryCenter.sizeBytes", { size: formatNumber(bytes, 0) });
  }
  if (bytes < 1024 * 1024) {
    return t("recoveryCenter.sizeKilobytes", { size: formatNumber(bytes / 1024, 1) });
  }
  return t("recoveryCenter.sizeMegabytes", { size: formatNumber(bytes / (1024 * 1024), 1) });
}

function entryTitle(entry: RecoverableEntry): string {
  if (entry.record.kind === "checkpoint") {
    return entry.record.label || t("sessionRecovery.checkpointFallback");
  }
  return t("recoveryCenter.autosaveLabel");
}

function instanceLabel(entry: RecoverableEntry): string {
  return t("recoveryCenter.instanceLabel", {
    instance: entry.record.instanceId.slice(0, 8),
    version: entry.record.appVersion,
  });
}

function entryRow(entry: RecoverableEntry, selected: string | null): HTMLElement {
  const row = el("label", "recovery-row");
  row.dataset.recordId = entry.record.id;
  const radio = el("input");
  radio.type = "radio";
  radio.name = "recovery-center-choice";
  radio.value = entry.record.id;
  radio.checked = entry.record.id === selected;
  const text = el("span", "recovery-row-text");
  const heading = el("span", "recovery-row-heading");
  heading.append(el("strong", "", entryTitle(entry)));
  const badge = el("span", `recovery-badge is-${entry.state}`);
  badge.textContent = t(baseVersionLabelKey(entry.state));
  heading.append(badge);
  text.append(
    heading,
    el(
      "span",
      "recovery-row-meta",
      t("recoveryCenter.entryMeta", {
        time: formatDate(entry.record.savedAt, { dateStyle: "medium", timeStyle: "short" }),
        size: formatBytes(serializedBytes(entry.record)),
      }),
    ),
  );
  row.append(radio, text);
  return row;
}

function projectSection(group: RecoveryProjectGroup, selected: string | null): HTMLElement {
  const section = el("section", "recovery-project");
  const header = el("div", "recovery-project-header");
  header.append(el("h3", "recovery-project-title", group.projectName));
  const path = el(
    "p",
    "recovery-project-path",
    group.projectPath ?? t("recoveryCenter.unsavedPath"),
  );
  if (group.projectPath) path.title = group.projectPath;
  const bytes = group.instances.reduce(
    (total, instance) =>
      total + instance.entries.reduce((sum, entry) => sum + serializedBytes(entry.record), 0),
    0,
  );
  header.append(
    path,
    el(
      "p",
      "recovery-project-size",
      t("recoveryCenter.projectStored", { size: formatBytes(bytes) }),
    ),
  );
  section.append(header);
  for (const instance of group.instances) {
    section.append(el("h4", "recovery-instance-title", instanceLabel(instance.entries[0])));
    const list = el("div", "recovery-list");
    for (const entry of instance.entries) list.append(entryRow(entry, selected));
    section.append(list);
  }
  return section;
}

/**
 * Lists every autosave record and structural checkpoint per project and app
 * instance. Restore and delete return the selected record; the caller performs
 * the confirmed action so storage stays outside the DOM layer.
 */
export async function openRecoveryCenter(
  entries: readonly RecoverableEntry[],
  options: { selectedId?: string | null } = {},
): Promise<RecoveryCenterChoice> {
  const groups = groupRecoveryEntries(entries);
  let selected = defaultCenterSelection(groups, options.selectedId ?? null);
  const usage = recoveryUsage(entries.map((entry) => entry.record));
  const body = el("div", "form-stack recovery-center");
  body.append(el("p", "modal-message", t("recoveryCenter.intro")));
  body.append(
    el(
      "p",
      "recovery-storage",
      t("recoveryCenter.storageUsage", {
        used: formatBytes(usage.totalBytes),
        budget: formatBytes(RECOVERY_BUDGET.totalBytes),
      }),
    ),
  );

  const legend = el("div", "recovery-legend");
  legend.append(
    el("p", "settings-note", t("recoveryCenter.autosaveExplanation")),
    el("p", "settings-note", t("recoveryCenter.checkpointExplanation")),
    el("p", "settings-note", t("recoveryCenter.budgetNote")),
  );
  body.append(legend);

  if (!groups.length) {
    const empty = el("div", "recovery-empty");
    empty.append(
      el("strong", "", t("recoveryCenter.emptyTitle")),
      el("p", "settings-note", t("recoveryCenter.emptyNote")),
    );
    body.append(empty);
    await showModal({
      title: t("recoveryCenter.title"),
      subtitle: t("recoveryCenter.subtitle"),
      body,
      wide: true,
      className: "modal-recovery-center",
      actions: [{ label: t("common.close"), value: "close", primary: true }],
    });
    return { action: "cancel", record: null };
  }

  const warning = el("p", "recovery-warning hidden");
  const showWarning = (state: RecoverableEntry["state"]): void => {
    const needed = needsRestoreConfirmation(state);
    warning.classList.toggle("hidden", !needed);
    warning.textContent = needed
      ? t("recoveryCenter.olderWarning", { state: t(baseVersionLabelKey(state)) })
      : "";
  };
  showWarning(findCenterEntry(groups, selected)?.state ?? "current");

  const list = el("div", "recovery-groups");
  for (const group of groups) list.append(projectSection(group, selected));
  list.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    selected = target.value;
    showWarning(findCenterEntry(groups, selected)?.state ?? "current");
  });
  body.append(list, warning);

  const value = await showModal({
    title: t("recoveryCenter.title"),
    subtitle: t("recoveryCenter.subtitle"),
    body,
    wide: true,
    className: "modal-recovery-center",
    actions: [
      { label: t("common.close"), value: "close" },
      { label: t("recoveryCenter.deleteSelected"), value: "delete", danger: true },
      { label: t("recoveryCenter.restoreSelected"), value: "restore", primary: true },
    ],
  });
  const record = findCenterEntry(groups, selected)?.record ?? null;
  if (!record) return { action: "cancel", record: null };
  if (value === "restore" || value === "delete") return { action: value, record };
  return { action: "cancel", record: null };
}
