import { t } from "../../i18n";
import { formatBytes } from "../../io/platform";
import type { SourceFileStatus } from "../../source/sourceStatus";
import { el } from "../../ui/dom";
import type { DoctorSourceCleanupResult } from "./sourceAvailability";
import type { ManagedCopyEntry } from "./sourceFiles";
import type { DoctorSourceSnapshot } from "./sourceModel";

type MessageKey = Parameters<typeof t>[0];

/** What the source section asks the doctor loop to do next. */
export type DoctorSourceRequest =
  | { kind: "cleanup-sources"; files: ManagedCopyEntry[] }
  | { kind: "source-action"; action: "relink" | "copy"; documentId: string };

const STATE_KEYS: Record<SourceFileStatus["state"], MessageKey> = {
  ok: "projectIntegrity.sources.state.ok",
  missing: "projectIntegrity.sources.state.missing",
  changed: "projectIntegrity.sources.state.changed",
};

function statusLine(status: SourceFileStatus): string {
  return t("projectIntegrity.sources.row", {
    name: status.name,
    storage:
      status.storage === "managed"
        ? t("projectIntegrity.sources.storage.managed")
        : t("projectIntegrity.sources.storage.reference"),
    state: t(STATE_KEYS[status.state]),
  });
}

function sourceRow(
  status: SourceFileStatus,
  options: {
    canRelink: boolean;
    canCopy: boolean;
    request: (request: DoctorSourceRequest) => void;
  },
): HTMLElement {
  const row = el("div", "doctor-source-row");
  const label = el("span", "doctor-source-name", statusLine(status));
  const actions = el("span", "doctor-source-actions");
  const wantsRelink = status.state === "missing" || status.state === "changed";
  if (wantsRelink && options.canRelink) {
    const relink = el("button", "btn btn-small", t("projectIntegrity.sources.relink"));
    relink.type = "button";
    relink.addEventListener("click", () =>
      options.request({
        kind: "source-action",
        action: "relink",
        documentId: status.documentId,
      }),
    );
    actions.append(relink);
  }
  if (status.state === "ok" && status.storage === "reference" && options.canCopy) {
    const copy = el("button", "btn btn-small", t("projectIntegrity.sources.copyIntoProject"));
    copy.type = "button";
    copy.addEventListener("click", () =>
      options.request({
        kind: "source-action",
        action: "copy",
        documentId: status.documentId,
      }),
    );
    actions.append(copy);
  }
  row.append(label, actions);
  return row;
}

function addOrphans(
  body: HTMLElement,
  snapshot: DoctorSourceSnapshot,
  canChange: boolean,
  request: (request: DoctorSourceRequest) => void,
): void {
  body.append(el("h4", "settings-subtitle", t("projectIntegrity.sources.unused.title")));
  // The action is always rendered so a read-only project or an empty folder
  // shows why it is unavailable instead of silently hiding it.
  const remove = el(
    "button",
    "btn btn-small btn-danger",
    t("projectIntegrity.sources.unused.remove"),
  );
  remove.type = "button";
  remove.disabled = !canChange || snapshot.orphans.length === 0;
  if (!snapshot.orphans.length) {
    body.append(el("p", "settings-note", t("projectIntegrity.sources.unused.empty")), remove);
    return;
  }
  body.append(
    el(
      "p",
      "settings-note",
      t("projectIntegrity.sources.unused.summary", {
        count: snapshot.orphans.length,
        size: formatBytes(snapshot.orphanBytes),
      }),
    ),
    el("p", "settings-note", t("projectIntegrity.sources.unused.note")),
  );
  const list = el("div", "doctor-source-list");
  snapshot.orphans.forEach((entry, index) => {
    const row = el("label", "doctor-orphan-row");
    const box = el("input");
    box.type = "checkbox";
    box.checked = true;
    box.dataset.orphanIndex = String(index);
    const text = el(
      "span",
      "doctor-source-name",
      t("projectIntegrity.sources.unused.file", {
        name: entry.fileName,
        size: formatBytes(entry.sizeBytes),
      }),
    );
    row.append(box, text);
    list.append(row);
  });
  remove.addEventListener("click", () => {
    const selected: ManagedCopyEntry[] = [];
    for (const box of list.querySelectorAll<HTMLInputElement>("input[data-orphan-index]")) {
      if (!box.checked) continue;
      const entry = snapshot.orphans[Number(box.dataset.orphanIndex)];
      if (entry) selected.push(entry);
    }
    if (selected.length) request({ kind: "cleanup-sources", files: selected });
  });
  body.append(list, remove);
}

/**
 * Renders the doctor's source section from a snapshot. Nothing here changes a
 * project or a file: the cleanup and source actions are returned to the doctor
 * loop, which owns confirmation, re-verification and the existing source
 * flows. All text is localized and no path is shown.
 */
export function addDoctorSources(
  body: HTMLElement,
  options: {
    snapshot?: DoctorSourceSnapshot;
    notice?: DoctorSourceCleanupResult;
    canChange: boolean;
    canRelink: boolean;
    canCopy: boolean;
    request: (request: DoctorSourceRequest) => void;
  },
): void {
  const snapshot = options.snapshot;
  if (!snapshot) return;
  body.append(el("h3", "settings-subtitle", t("projectIntegrity.sources.title")));
  if (!snapshot.checked) {
    body.append(el("p", "settings-note", t("projectIntegrity.sources.unchecked")));
    return;
  }
  body.append(
    el(
      "p",
      "settings-note",
      t("projectIntegrity.sources.summary", {
        missing: snapshot.missing,
        changed: snapshot.changed,
        managed: snapshot.managed.length,
        unused: snapshot.orphans.length,
      }),
    ),
  );
  if (snapshot.listingFailed) {
    body.append(el("p", "form-error", t("projectIntegrity.sources.listingFailed")));
  }
  if (options.notice) {
    body.append(
      el(
        "p",
        "settings-note",
        t("projectIntegrity.sources.cleanupDone", {
          removed: options.notice.removed,
          skipped: options.notice.skipped,
          failed: options.notice.failed,
        }),
      ),
    );
    if (options.notice.trashed) {
      body.append(
        el(
          "p",
          "settings-note",
          t("projectIntegrity.sources.cleanupTrash", { count: options.notice.trashed }),
        ),
      );
    }
    if (options.notice.folder) {
      body.append(
        el(
          "p",
          "settings-note",
          t("projectIntegrity.sources.cleanupFolder", { path: options.notice.folder }),
        ),
      );
    }
  }
  if (!snapshot.statuses.length) {
    body.append(el("p", "settings-note", t("projectIntegrity.sources.none")));
  } else {
    const list = el("div", "doctor-source-list");
    for (const status of snapshot.statuses) {
      list.append(
        sourceRow(status, {
          canRelink: options.canRelink,
          canCopy: options.canCopy,
          request: options.request,
        }),
      );
    }
    body.append(list);
  }
  addOrphans(body, snapshot, options.canChange, options.request);
}
