import { t } from "../../i18n";
import { showModal } from "../../ui/dialogs";
import { el } from "../../ui/dom";
import type { RestoreLinkEntry } from "./restoreLinks";

export type RestoreLinkDecision = "relink" | "cancel";

function detail(entry: RestoreLinkEntry): string {
  if (entry.reason === "staleAbsolute") {
    return t("saveIntegrity.restoreStaleAbsolute", { name: entry.name });
  }
  if (entry.reason === "noLink") return t("saveIntegrity.restoreNoLink", { name: entry.name });
  return t("saveIntegrity.restoreMissing", {
    name: entry.name,
    path: entry.candidates[0] ?? "",
  });
}

/**
 * Lists the drawings of a restored backup that could not be resolved from the
 * backup's origin or the open project's folder. Nothing is restored until the
 * user either locates them or cancels; a missing drawing is never substituted
 * silently.
 */
export async function showRestoreLinkReport(
  entries: readonly RestoreLinkEntry[],
  originPath: string | null,
): Promise<RestoreLinkDecision> {
  const body = el("div", "form-stack");
  body.append(
    el(
      "p",
      "modal-message",
      originPath
        ? t("saveIntegrity.restoreLinksIntroOrigin", { count: entries.length, path: originPath })
        : t("saveIntegrity.restoreLinksIntro", { count: entries.length }),
    ),
  );
  const list = el("div", "form-stack");
  for (const entry of entries) list.append(el("p", "modal-message", detail(entry)));
  body.append(list, el("p", "settings-note", t("saveIntegrity.restoreLinksNote")));
  const value = await showModal({
    title: t("saveIntegrity.restoreLinksTitle"),
    body,
    wide: true,
    className: "modal-restore-links",
    actions: [
      { label: t("common.cancel"), value: "cancel" },
      { label: t("saveIntegrity.restoreLinksLocate"), value: "relink", primary: true },
    ],
  });
  return value === "relink" ? "relink" : "cancel";
}
