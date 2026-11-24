import { showModal } from "../../ui/dialogs";
import { el } from "../../ui/dom";
import { toast } from "../../ui/toast";
import { t } from "../../i18n";
import { attachmentSizeMb, type AttachmentChoice, type ComposeOutcome } from "./model";

/** The 20 MB guide: continue, export to disk instead, or cancel. */
export function largeAttachmentDialog(bytes: number): Promise<AttachmentChoice | null> {
  const body = el("div", "form-stack");
  body.append(
    el("p", "modal-message", t("shareByEmail.largeMessage", { size: attachmentSizeMb(bytes) })),
  );
  return showModal({
    title: t("shareByEmail.largeTitle"),
    body,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("shareByEmail.exportInstead"), value: "export" },
      { label: t("shareByEmail.continue"), value: "continue", primary: true },
    ],
  }).then((value) => (value === "continue" || value === "export" ? value : null));
}

/**
 * A no-client or failed launch is never silent: the dialog names the written
 * file and offers to reveal it. Reveal failures are reported too.
 */
export async function showOutcomeDialog(
  outcome: ComposeOutcome,
  reveal: (path: string) => Promise<void>,
): Promise<void> {
  const body = el("div", "form-stack");
  if (outcome.status === "no_client") {
    body.append(
      el("p", "modal-message", t("shareByEmail.noClientMessage", { path: outcome.path })),
    );
  } else {
    body.append(el("p", "modal-message", t("shareByEmail.failedMessage", { path: outcome.path })));
  }
  if (outcome.detail) body.append(el("p", "modal-hint", outcome.detail));
  const choice = await showModal({
    title:
      outcome.status === "no_client"
        ? t("shareByEmail.noClientTitle")
        : t("shareByEmail.failedTitle"),
    body,
    actions: [
      { label: t("common.close"), value: "close" },
      { label: t("shareByEmail.reveal"), value: "reveal", primary: true },
    ],
  });
  if (choice !== "reveal") return;
  try {
    await reveal(outcome.path);
  } catch {
    toast(t("shareByEmail.revealFailed"), "warning");
  }
}
