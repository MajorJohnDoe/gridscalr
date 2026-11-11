import { t } from "../../i18n";
import { el } from "../../ui/dom";
import { icon } from "../../ui/icons";
import { showContentPopover } from "../../ui/popover";
import { formatStatusTime, type StatusOverview } from "./model";

/** What the popover can do. Every action is supplied by the shell wiring. */
export interface StatusOverviewActions {
  backupNow: () => void;
  reviewRecovery: () => void;
  openDoctor: () => void;
  setAutosavePaused: (paused: boolean) => void;
}

function saveStateLabel(overview: StatusOverview): string {
  if (overview.saveState === "unsaved") return t("status.projectUnsaved");
  if (overview.saveState === "saved") return t("status.projectSaved");
  return t("status.projectNotSaved");
}

function savedValue(overview: StatusOverview): string {
  const formatted = formatStatusTime(overview.savedAt);
  if (formatted) return formatted;
  return overview.saveState === "notSaved"
    ? t("status.projectNotSaved")
    : t("statusOverview.unknown");
}

function backupValue(overview: StatusOverview): string {
  const formatted = formatStatusTime(overview.lastBackupAt);
  if (formatted) return formatted;
  return overview.desktop ? t("statusOverview.noBackup") : t("statusOverview.unknown");
}

function autosaveValue(overview: StatusOverview): string {
  if (overview.autosaveStatus === "paused") return t("statusOverview.autosavePaused");
  if (overview.autosaveStatus === "disabled") return t("statusOverview.autosaveOff");
  return t("statusOverview.autosaveOn", { seconds: overview.autosaveIntervalSeconds });
}

function recoveryValue(overview: StatusOverview): string {
  if (!overview.recoveryAvailable) return t("statusOverview.recoveryNone");
  return t("statusOverview.recoveryAvailable", {
    count: overview.recoveryRecords + overview.recoveryCheckpoints,
  });
}

function row(label: string, value: string, warning = false): HTMLElement {
  const node = el("div", "status-popover-row");
  const valueNode = el("span", `status-popover-value${warning ? " is-warning" : ""}`, value);
  node.append(el("span", "status-popover-label", label), valueNode);
  return node;
}

function actionButton(
  label: string,
  iconName: string | null,
  enabled: boolean,
  action: () => void,
  disabledTitle?: string,
): HTMLButtonElement {
  const button = el("button", "popover-item");
  button.type = "button";
  button.disabled = !enabled;
  if (iconName) button.innerHTML = icon(iconName, 14);
  button.append(el("span", "", label));
  if (!enabled && disabledTitle) button.title = disabledTitle;
  button.addEventListener("click", () => {
    if (button.disabled) return;
    action();
  });
  return button;
}

function buildContent(overview: StatusOverview, actions: StatusOverviewActions): HTMLElement {
  const content = el("div", "status-popover-content");
  content.setAttribute("role", "dialog");
  content.setAttribute("aria-label", t("statusOverview.title"));

  const header = el("div", "status-popover-header");
  header.append(el("span", "status-popover-title", t("statusOverview.title")));
  const stateChip = el(
    "span",
    `status-chip${overview.saveState === "unsaved" ? " is-warning" : " is-calibrated"}`,
  );
  stateChip.append(document.createTextNode(saveStateLabel(overview)));
  header.append(stateChip);
  content.append(header);

  const rows = el("div", "status-popover-rows");
  rows.append(
    row(t("statusOverview.lastSaved"), savedValue(overview)),
    row(t("statusOverview.lastBackup"), backupValue(overview)),
    row(t("statusOverview.autosave"), autosaveValue(overview)),
    row(
      t("statusOverview.validation"),
      overview.warnings
        ? t("statusOverview.warningCount", { count: overview.warnings })
        : t("statusOverview.none"),
      overview.warnings > 0,
    ),
    row(t("statusOverview.recovery"), recoveryValue(overview)),
  );
  if (overview.errors > 0) {
    rows.append(
      row(
        t("statusOverview.errors"),
        t("statusOverview.errorCount", { count: overview.errors }),
        true,
      ),
    );
  }
  content.append(rows);

  if (overview.viewOnly) {
    content.append(el("p", "status-popover-note", t("statusOverview.viewOnlyNote")));
  }

  content.append(el("div", "popover-separator"));
  content.append(
    actionButton(
      t("statusOverview.backupNow"),
      "save",
      overview.actions.backupNow,
      actions.backupNow,
      t("statusOverview.desktopOnly"),
    ),
    actionButton(
      t("statusOverview.reviewRecovery"),
      "undo",
      overview.actions.reviewRecovery,
      actions.reviewRecovery,
      t("statusOverview.recoveryEmpty"),
    ),
    actionButton(
      t("statusOverview.openDoctor"),
      "info",
      overview.actions.openDoctor,
      actions.openDoctor,
    ),
  );
  if (overview.actions.toggleAutosave) {
    const paused = overview.actions.autosavePaused;
    content.append(
      actionButton(
        paused ? t("statusOverview.resumeAutosave") : t("statusOverview.pauseAutosave"),
        null,
        true,
        () => actions.setAutosavePaused(!paused),
      ),
    );
  }
  return content;
}

/** Opens the project status popover above the status chip. */
export function showStatusOverviewPopover(
  anchor: HTMLElement,
  overview: StatusOverview,
  actions: StatusOverviewActions,
): void {
  showContentPopover(anchor, buildContent(overview, actions), "status-popover");
}
