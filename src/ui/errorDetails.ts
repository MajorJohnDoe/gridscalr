import { copyPlainText } from "../io/clipboardText";
import { containsAbsolutePath, sanitizePaths } from "../model/pathText";
import { t } from "../i18n";
import { el } from "./dom";
import { toast } from "./toast";

/**
 * Adds a copy action to a support dialog when the rendered message contains an
 * absolute path. The visible text keeps the raw detail because it helps
 * troubleshooting; the copied text replaces paths and keeps any error code
 * (F-042).
 */
export function appendSanitizedCopy(host: HTMLElement, message: string): void {
  if (!containsAbsolutePath(message)) return;
  const safe = sanitizePaths(message);
  const copy = el("button", "btn btn-small btn-ghost", t("dialogs.copySanitizedDetails"));
  copy.type = "button";
  copy.addEventListener("click", () => {
    void copyPlainText(safe).then((copied) => {
      toast(
        copied ? t("dialogs.detailsCopied") : t("diagnostics.copyFailed"),
        copied ? "success" : "warning",
      );
    });
  });
  host.append(copy);
}
