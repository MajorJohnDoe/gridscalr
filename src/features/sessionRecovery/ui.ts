import { formatDate } from "../../i18n/format";
import { t } from "../../i18n";
import { showModal } from "../../ui/dialogs";
import { el } from "../../ui/dom";
import { icon } from "../../ui/icons";
import type { LeaseState, ProjectLease } from "./lease";

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
