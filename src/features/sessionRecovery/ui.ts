import { formatDate } from "../../i18n/format";
import { t } from "../../i18n";
import { showModal } from "../../ui/dialogs";
import { el } from "../../ui/dom";
import { icon } from "../../ui/icons";
import type { LeaseState, ProjectLease } from "./lease";
import type { RecoverableEntry } from "./recovery";
import type { RecoveryRecord } from "./record";

export type RecoveryChoice = "restore" | "discard" | "cancel";

export interface RecoverySelection {
  action: RecoveryChoice;
  record: RecoveryRecord | null;
}

const STATE_KEYS = {
  current: "sessionRecovery.state.current",
  older: "sessionRecovery.state.older",
  unknown: "sessionRecovery.state.unknown",
  missing: "sessionRecovery.state.missing",
  unsaved: "sessionRecovery.state.unsaved",
} as const;

function stateLabel(entry: RecoverableEntry): string {
  return t(STATE_KEYS[entry.state]);
}

function entryTitle(entry: RecoverableEntry): string {
  if (entry.record.kind === "checkpoint") {
    return entry.record.label || t("sessionRecovery.checkpointFallback");
  }
  return entry.record.projectName;
}

function entryMeta(entry: RecoverableEntry): string {
  const time = formatDate(entry.record.savedAt, { dateStyle: "medium", timeStyle: "short" });
  const instance = entry.record.instanceId.slice(0, 8);
  return t("sessionRecovery.entryMeta", {
    time,
    instance,
    state: stateLabel(entry),
  });
}

/**
 * Lists every recoverable project and instance. Nothing is restored without an
 * explicit Restore; Discard deletes only the selected record.
 */
export async function recoveryChooser(
  entries: readonly RecoverableEntry[],
): Promise<RecoverySelection> {
  let selected = entries[0]?.record.id ?? null;
  const body = el("div", "form-stack recovery-chooser");
  body.append(el("p", "modal-message", t("sessionRecovery.intro")));
  if (!entries.length) {
    body.append(el("p", "settings-note", t("sessionRecovery.empty")));
    await showModal({
      title: t("sessionRecovery.title"),
      body,
      actions: [{ label: t("common.close"), value: "close", primary: true }],
    });
    return { action: "cancel", record: null };
  }

  const autosaves = entries.filter((entry) => entry.record.kind === "autosave");
  const checkpoints = entries.filter((entry) => entry.record.kind === "checkpoint");
  const list = el("div", "recovery-list");
  const addGroup = (title: string, group: readonly RecoverableEntry[]) => {
    if (!group.length) return;
    list.append(el("h3", "recovery-group-title", title));
    for (const entry of group) {
      const row = el("label", "recovery-row");
      const radio = el("input");
      radio.type = "radio";
      radio.name = "recovery-choice";
      radio.value = entry.record.id;
      radio.checked = entry.record.id === selected;
      radio.addEventListener("change", () => {
        selected = entry.record.id;
      });
      const text = el("span", "recovery-row-text");
      text.append(el("strong", "", entryTitle(entry)));
      text.append(el("span", "recovery-row-meta", entryMeta(entry)));
      row.append(radio, text);
      list.append(row);
    }
  };
  addGroup(t("sessionRecovery.autosaves"), autosaves);
  addGroup(t("sessionRecovery.checkpoints"), checkpoints);
  body.append(list);

  const value = await showModal({
    title: t("sessionRecovery.title"),
    body,
    wide: true,
    actions: [
      { label: t("common.cancel"), value: "cancel" },
      { label: t("sessionRecovery.discard"), value: "discard", danger: true },
      { label: t("common.restore"), value: "restore", primary: true },
    ],
  });
  if (value !== "restore" && value !== "discard") return { action: "cancel", record: null };
  const record = entries.find((entry) => entry.record.id === selected)?.record ?? null;
  if (!record) return { action: "cancel", record: null };
  return { action: value, record };
}

export type LeaseChoice = "readOnly" | "takeOver" | "cancel";

/**
 * A live lease from another instance. Open read-only is the default and the
 * primary action; Take over is explicit and writes a new lease.
 */
export async function leaseConflictDialog(
  lease: ProjectLease,
  projectName: string,
): Promise<LeaseChoice> {
  const body = el("div", "modal-message-row");
  const callout = el("div", "modal-callout warning");
  callout.innerHTML = icon("warning", 20);
  const text = el("div", "modal-message-text");
  text.append(el("p", "modal-message", t("sessionRecovery.lease.message", { name: projectName })));
  text.append(
    el(
      "p",
      "settings-note",
      t("sessionRecovery.lease.detail", {
        host: lease.hostLabel,
        time: formatDate(lease.openedAt, { dateStyle: "medium", timeStyle: "short" }),
        version: lease.appVersion,
      }),
    ),
  );
  body.append(callout, text);
  const value = await showModal({
    title: t("sessionRecovery.lease.title"),
    body,
    actions: [
      { label: t("common.cancel"), value: "cancel" },
      { label: t("sessionRecovery.lease.takeOver"), value: "takeOver", danger: true },
      { label: t("sessionRecovery.lease.readOnly"), value: "readOnly", primary: true },
    ],
  });
  if (value === "readOnly" || value === "takeOver") return value;
  return "cancel";
}

export interface BannerAction {
  label: string;
  onClick: () => void | Promise<unknown>;
}

export interface BannerOptions {
  id: string;
  message: string;
  tone?: "info" | "warning";
  actions?: readonly BannerAction[];
  onDismiss?: () => void;
}

/** A non-blocking banner inside the canvas area. Only one per id is shown. */
export function showSessionBanner(host: HTMLElement, options: BannerOptions): () => void {
  host.querySelector(`[data-session-banner="${options.id}"]`)?.remove();
  const banner = el("div", `session-banner${options.tone === "warning" ? " is-warning" : ""}`);
  banner.dataset.sessionBanner = options.id;
  banner.setAttribute("role", "status");
  banner.append(el("span", "session-banner-text", options.message));
  for (const action of options.actions ?? []) {
    const button = el("button", "btn btn-small banner-action", action.label);
    button.type = "button";
    button.addEventListener("click", () => void action.onClick());
    banner.append(button);
  }
  const dismiss = el("button", "icon-btn session-banner-close");
  dismiss.type = "button";
  dismiss.title = t("common.dismiss");
  dismiss.setAttribute("aria-label", t("common.dismiss"));
  dismiss.innerHTML = icon("close", 14);
  dismiss.addEventListener("click", () => {
    banner.remove();
    options.onDismiss?.();
  });
  banner.append(dismiss);
  host.append(banner);
  return () => banner.remove();
}

export interface FileChangedBannerOptions {
  onReload: () => void | Promise<void>;
  onDismiss?: () => void;
}

export function showFileChangedBanner(
  host: HTMLElement,
  options: FileChangedBannerOptions,
): () => void {
  return showSessionBanner(host, {
    id: "file-changed",
    tone: "warning",
    message: t("sessionRecovery.fileChanged"),
    actions: [{ label: t("sessionRecovery.reload"), onClick: options.onReload }],
    onDismiss: options.onDismiss,
  });
}

export function showReadOnlyBanner(
  host: HTMLElement,
  options: { onSaveCopy: () => void | Promise<unknown>; onDismiss?: () => void },
): () => void {
  return showSessionBanner(host, {
    id: "read-only",
    message: t("sessionRecovery.readOnly.banner"),
    actions: [{ label: t("sessionRecovery.saveCopy"), onClick: options.onSaveCopy }],
    onDismiss: options.onDismiss,
  });
}

export function showStaleLeaseBanner(
  host: HTMLElement,
  lease: ProjectLease,
  onClear: () => void | Promise<void>,
): () => void {
  return showSessionBanner(host, {
    id: "stale-lease",
    message: t("sessionRecovery.staleLease", {
      host: lease.hostLabel,
      time: formatDate(lease.heartbeatAt, { dateStyle: "medium", timeStyle: "short" }),
    }),
    actions: [{ label: t("sessionRecovery.clearStaleLock"), onClick: onClear }],
  });
}

export function leaseStateIsBlocking(state: LeaseState): boolean {
  return state === "liveOther";
}
