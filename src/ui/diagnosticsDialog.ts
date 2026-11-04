import { copyPlainText } from "../io/clipboardText";
import { showModal } from "./dialogs";
import { el } from "./dom";
import { toast } from "./toast";
import { t } from "../i18n";

export const ISSUE_URL =
  "https://github.com/MajorJohnDoe/gridscalr/issues/new?template=bug_report.yml";

export async function copyDiagnostics(diagnostics: () => string): Promise<boolean> {
  const copied = await copyPlainText(diagnostics());
  toast(
    copied ? t("diagnostics.copied") : t("diagnostics.copyFailed"),
    copied ? "success" : "warning",
  );
  return copied;
}

/**
 * Support path without network access: the diagnostics text and the issue
 * tracker link are selectable and copyable, so a user can attach both to a new
 * GitHub issue.
 */
export function reportProblemDialog(diagnostics: () => string): void {
  const body = el("div", "diagnostics-dialog");
  body.append(el("p", "settings-note", t("diagnostics.note")));

  const pre = el("pre", "diagnostics-text");
  pre.textContent = diagnostics();

  const actions = el("div", "settings-actions");
  const copy = el("button", "btn btn-small", t("diagnostics.copy"));
  copy.type = "button";
  copy.addEventListener("click", () => {
    void copyPlainText(pre.textContent ?? "");
    toast(t("diagnostics.copied"), "success");
  });
  const copyLink = el("button", "btn btn-small btn-ghost", t("diagnostics.copyLink"));
  copyLink.type = "button";
  copyLink.addEventListener("click", () => {
    void copyPlainText(ISSUE_URL);
    toast(t("diagnostics.linkCopied"), "success");
  });
  actions.append(copy, copyLink);

  const link = el("input", "input diagnostics-link");
  link.value = ISSUE_URL;
  link.readOnly = true;
  link.setAttribute("aria-label", t("diagnostics.issueLabel"));

  body.append(pre, el("div", "settings-subhead", t("diagnostics.issue")), link, actions);

  void showModal({
    title: t("diagnostics.title"),
    subtitle: t("diagnostics.subtitle"),
    body,
    wide: true,
    className: "modal-diagnostics",
    actions: [{ label: t("common.close"), value: "close", primary: true }],
  });
}
