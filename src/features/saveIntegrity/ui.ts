import { formatDate } from "../../i18n/format";
import { t } from "../../i18n";
import { formatBytes } from "../../io/platform";
import { el, option } from "../../ui/dom";
import { showModal } from "../../ui/dialogs";
import type { BackupEntry } from "./backup";
import type { ConflictAction, VersionSummary } from "./conflict";
import type { ProjectFileStamp } from "./stamp";

function summaryBlock(title: string, summary: VersionSummary | null): HTMLElement {
  const block = el("div", "form-stack");
  block.append(el("h3", "", title));
  if (!summary) {
    block.append(el("p", "modal-message", t("saveIntegrity.versionUnknown")));
    return block;
  }
  block.append(
    el("p", "modal-message", summary.name),
    el(
      "p",
      "modal-message",
      t("saveIntegrity.versionStats", {
        pages: summary.pages,
        items: summary.items,
        size: formatBytes(summary.sizeBytes),
      }),
    ),
  );
  if (summary.updatedAt) {
    block.append(
      el(
        "p",
        "modal-message",
        t("saveIntegrity.versionUpdated", { time: formatDate(summary.updatedAt) }),
      ),
    );
  }
  if (summary.sha256) {
    block.append(
      el(
        "p",
        "modal-message",
        t("saveIntegrity.versionHash", { hash: summary.sha256.slice(0, 12) }),
      ),
    );
  }
  if (summary.modifiedAt) {
    block.append(
      el(
        "p",
        "modal-message",
        t("saveIntegrity.versionModified", {
          time: formatDate(summary.modifiedAt, { dateStyle: "medium", timeStyle: "short" }),
        }),
      ),
    );
  }
  return block;
}

export interface ConflictDialogInfo {
  targetPath: string;
  current: ProjectFileStamp | null;
  local: VersionSummary;
  disk: VersionSummary | null;
}

/** The conflict dialog. Save as conflicted copy is the focused default. */
export function conflictDialog(info: ConflictDialogInfo): Promise<ConflictAction> {
  const body = el("div", "form-stack");
  body.append(
    el(
      "p",
      "modal-message",
      info.current ? t("saveIntegrity.conflictMessage") : t("saveIntegrity.conflictMissing"),
    ),
    el("p", "modal-message", info.targetPath),
  );
  const versions = el("div", "form-stack");
  versions.append(
    summaryBlock(t("saveIntegrity.localVersion"), info.local),
    summaryBlock(t("saveIntegrity.diskVersion"), info.disk),
  );
  body.append(versions);
  return showModal({
    title: t("saveIntegrity.conflictTitle"),
    body,
    actions: [
      {
        label: t("saveIntegrity.conflictedCopy"),
        value: "conflicted-copy",
        primary: true,
      },
      { label: t("saveIntegrity.compare"), value: "compare" },
      { label: t("saveIntegrity.reload"), value: "reload" },
      { label: t("saveIntegrity.overwrite"), value: "overwrite", danger: true },
      { label: t("common.cancel"), value: "__cancel__" },
    ],
  }).then((value) => (value as ConflictAction | null) ?? "cancel");
}

/** Side-by-side metadata comparison; the visual diff stays a later phase. */
export function compareDialog(local: VersionSummary, disk: VersionSummary | null): Promise<void> {
  const body = el("div", "form-stack");
  body.append(
    el("p", "modal-message", t("saveIntegrity.compareNote")),
    summaryBlock(t("saveIntegrity.localVersion"), local),
    summaryBlock(t("saveIntegrity.diskVersion"), disk),
  );
  return showModal({
    title: t("saveIntegrity.compareTitle"),
    body,
    actions: [{ label: t("common.close"), value: "close", primary: true }],
  }).then(() => undefined);
}

export function chooseBackupDialog(entries: readonly BackupEntry[]): Promise<string | null> {
  const body = el("div", "form-stack");
  body.append(el("p", "modal-message", t("saveIntegrity.restoreMessage")));
  const select = el("select", "select");
  for (const entry of entries) {
    select.append(
      option(
        entry.path,
        t("saveIntegrity.backupEntry", {
          time: formatDate(entry.modifiedAt, { dateStyle: "medium", timeStyle: "short" }),
          size: formatBytes(entry.sizeBytes),
        }),
        entry === entries[0],
      ),
    );
  }
  body.append(select);
  return showModal({
    title: t("saveIntegrity.restoreTitle"),
    body,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("saveIntegrity.restore"), value: "restore", primary: true },
    ],
  }).then((value) => (value === "restore" ? select.value : null));
}
