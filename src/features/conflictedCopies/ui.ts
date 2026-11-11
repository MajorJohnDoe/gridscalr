import { t } from "../../i18n";
import { formatDate } from "../../i18n/format";
import { formatBytes } from "../../io/platform";
import { confirmDialog, showModal } from "../../ui/dialogs";
import { el } from "../../ui/dom";
import { totalConflictedCopyBytes, type ConflictedCopyEntry } from "./model";

export type ConflictedCopyAction = "open" | "compare" | "delete" | "cancel";

export interface ConflictedCopyChoice {
  action: ConflictedCopyAction;
  entry: ConflictedCopyEntry | null;
}

function row(entry: ConflictedCopyEntry, selected: string | null): HTMLElement {
  const label = el("label", "recovery-row");
  label.dataset.conflictedCopyPath = entry.path;
  label.title = entry.path;
  const radio = el("input");
  radio.type = "radio";
  radio.name = "conflicted-copy-choice";
  radio.value = entry.path;
  radio.checked = entry.path === selected;
  const text = el("span", "recovery-row-text");
  text.append(
    el("span", "recovery-row-heading", entry.fileName),
    el(
      "span",
      "recovery-row-meta",
      t("conflictedCopies.rowMeta", {
        time: formatDate(entry.modifiedAt, { dateStyle: "medium", timeStyle: "short" }),
        size: formatBytes(entry.sizeBytes),
      }),
    ),
  );
  label.append(radio, text);
  return label;
}

/**
 * Lists the copies found in the project's folder with their time and size.
 * Every action is returned to the controller, which owns the confirmation,
 * the only-copy guard and the deletion; this dialog never touches the disk.
 */
export async function showConflictedCopies(
  entries: readonly ConflictedCopyEntry[],
  options: {
    selectedPath?: string | null;
    projectFileName: string;
  },
): Promise<ConflictedCopyChoice> {
  let selected = entries[0]?.path ?? null;
  if (options.selectedPath && entries.some((entry) => entry.path === options.selectedPath)) {
    selected = options.selectedPath;
  }
  const body = el("div", "form-stack conflicted-copies");
  body.append(
    el("p", "modal-message", t("conflictedCopies.subtitle", { name: options.projectFileName })),
    el("p", "settings-note", t("conflictedCopies.intro")),
  );

  if (!entries.length) {
    const empty = el("div", "recovery-empty");
    empty.append(
      el("strong", "", t("conflictedCopies.emptyTitle")),
      el("p", "settings-note", t("conflictedCopies.emptyNote")),
    );
    body.append(empty);
    await showModal({
      title: t("conflictedCopies.title"),
      body,
      wide: true,
      actions: [{ label: t("common.close"), value: "close", primary: true }],
    });
    return { action: "cancel", entry: null };
  }

  body.append(
    el(
      "p",
      "recovery-storage",
      t("conflictedCopies.total", {
        count: entries.length,
        size: formatBytes(totalConflictedCopyBytes(entries)),
      }),
    ),
  );

  const list = el("div", "recovery-list");
  for (const entry of entries) list.append(row(entry, selected));
  list.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    selected = target.value;
  });
  body.append(
    list,
    el("p", "settings-note", t("conflictedCopies.openNote")),
    el("p", "settings-note", t("conflictedCopies.compareNote")),
    el("p", "settings-note", t("conflictedCopies.deleteNote")),
  );

  const value = await showModal({
    title: t("conflictedCopies.title"),
    body,
    wide: true,
    className: "modal-conflicted-copies",
    actions: [
      { label: t("common.close"), value: "close" },
      { label: t("conflictedCopies.delete"), value: "delete", danger: true },
      { label: t("conflictedCopies.compare"), value: "compare" },
      { label: t("conflictedCopies.open"), value: "open", primary: true },
    ],
  });
  const entry = entries.find((item) => item.path === selected) ?? null;
  if (!entry) return { action: "cancel", entry: null };
  if (value === "open" || value === "compare" || value === "delete") {
    return { action: value, entry };
  }
  return { action: "cancel", entry: null };
}

/** A permanent single-file delete, named before it happens. */
export function confirmDeleteCopy(entry: ConflictedCopyEntry): Promise<boolean> {
  return confirmDialog(
    t("conflictedCopies.deleteTitle"),
    t("conflictedCopies.deleteNoteConfirm", { name: entry.fileName }),
    t("conflictedCopies.deleteConfirm"),
    { danger: true },
  );
}
