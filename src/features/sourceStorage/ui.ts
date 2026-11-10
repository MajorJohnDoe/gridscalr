import { t } from "../../i18n";
import { confirmDialog } from "../../ui/dialogs";
import { showSessionBanner, type BannerAction } from "../sessionRecovery";
import type { SourceLocationHint } from "./mode";

/** Explains why a cloud or network source is recommended for copying. */
export function sourceLocationReason(hint: SourceLocationHint): string {
  if (hint.reason === "unc") return t("sourceStorage.reasonNetwork");
  if (hint.reason === "cloud") return t("sourceStorage.reasonCloud");
  return "";
}

/**
 * Import recommendation. It is non-blocking: declining keeps the ordinary
 * reference and never copies or moves the original.
 */
export function recommendManagedCopy(name: string, hint: SourceLocationHint): Promise<boolean> {
  return confirmDialog(
    t("sourceStorage.recommendTitle"),
    t("sourceStorage.recommendMessage", {
      name,
      reason: sourceLocationReason(hint),
    }),
    t("sourceStorage.copyIntoProject"),
  );
}

export interface SourceBannerOptions {
  documentId: string;
  name: string;
  state: "missing" | "changed";
  actions: BannerAction[];
  onDismiss: () => void;
}

/** A non-blocking source-changed banner that mirrors the Phase 2 file banner. */
export function showSourceChangedBanner(
  host: HTMLElement,
  options: SourceBannerOptions,
): () => void {
  return showSessionBanner(host, {
    id: `source-${options.documentId}`,
    tone: "warning",
    message:
      options.state === "missing"
        ? t("sourceStorage.missingBanner", { name: options.name })
        : t("sourceStorage.changedBanner", { name: options.name }),
    actions: options.actions,
    onDismiss: options.onDismiss,
  });
}
