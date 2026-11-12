import { t } from "../../i18n";
import { showModal } from "../../ui/dialogs";
import { el } from "../../ui/dom";
import { sourceNeedsConfirmation, summarizeImportPreflight } from "./relink";
import type { ImportPreflightSnapshot, ImportSourceState } from "./relink";

/**
 * The app wires these two actions to the in-memory import loader. Both return a
 * fresh snapshot and never touch the open project; `null` from `relink` means
 * the user closed the file picker, so the previous state stays.
 */
export interface ImportPreflightRelinkHost {
  relink(documentId: string): Promise<ImportPreflightSnapshot | null>;
  unrelink(documentId: string): Promise<ImportPreflightSnapshot>;
}

function countRow(label: string, count: number): HTMLElement {
  const row = el("div", "settings-note");
  row.append(el("strong", "", label), el("span", "", `: ${count}`));
  return row;
}

function statusLabel(state: ImportSourceState, confirmed: boolean): string {
  if (state.missing) return t("projectImport.preflight.statusSourceMissing");
  if (confirmed) return t("projectImport.preflight.statusConfirmed");
  if (state.checksumChanged && state.pageCountChanged) {
    return t("projectImport.preflight.statusChanged");
  }
  if (state.checksumChanged) return t("projectImport.preflight.statusChecksum");
  if (state.pageCountChanged) return t("projectImport.preflight.statusPageCount");
  return t("projectImport.preflight.statusReady");
}

/**
 * Lists page, item, merge and source-file facts before an import mutates
 * anything. Missing PDF sources can be relinked here; a changed checksum or page
 * count blocks the commit until the user explicitly accepts it. Cancel returns
 * false and leaves the project and every source file untouched.
 */
export async function projectImportPreflightDialog(
  initial: ImportPreflightSnapshot,
  host?: ImportPreflightRelinkHost,
): Promise<boolean> {
  let current = initial;
  let busy = false;
  let primary: HTMLButtonElement | null = null;
  let modal: HTMLElement | null = null;
  const confirmed = new Set<string>();
  const relinked = new Set<string>();

  const counts = el("div", "preflight-counts");
  const sources = el("div", "preflight-sources");
  const notes = el("div", "preflight-notes");
  const summary = el("div", "preflight-summary");
  summary.setAttribute("role", "status");
  summary.setAttribute("aria-live", "polite");
  const body = el("div", "form-stack");
  body.append(el("p", "modal-message", t("projectImport.preflight.intro")), counts, sources, notes);

  const renderCounts = (): void => {
    counts.replaceChildren(
      countRow(t("projectImport.preflight.pages"), current.preflight.pages),
      countRow(t("projectImport.preflight.items"), current.preflight.items),
      countRow(t("projectImport.preflight.documents"), current.preflight.documents),
      countRow(t("projectImport.preflight.categories"), current.preflight.categories),
      countRow(t("projectImport.preflight.countTypes"), current.preflight.countTypes),
      countRow(t("projectImport.preflight.lineTypes"), current.preflight.lineTypes),
      countRow(t("projectImport.preflight.assets"), current.preflight.assets),
    );
  };

  const renderNotes = (): void => {
    notes.replaceChildren();
    if (current.preflight.skippedPages.length) {
      notes.append(
        el(
          "p",
          "settings-note",
          t("projectImport.preflight.skippedPages", {
            pages: current.preflight.skippedPages.join(", "),
          }),
        ),
      );
    }
    if (current.preflight.warnings.length) {
      notes.append(
        el(
          "p",
          "settings-note",
          t("projectImport.preflight.importWarnings", {
            count: current.preflight.warnings.length,
          }),
        ),
      );
    }
  };

  const updateFooter = (): void => {
    const info = summarizeImportPreflight(current, confirmed);
    if (info.pages === 0) {
      summary.textContent = t("projectImport.preflight.summaryNothing");
    } else if (info.unconfirmedDocuments) {
      summary.textContent = t("projectImport.preflight.summaryBlocked", {
        count: info.unconfirmedDocuments,
      });
    } else if (info.missingDocuments) {
      summary.textContent = t("projectImport.preflight.summaryMissing", {
        documents: info.missingDocuments,
        pages: info.skippedPages,
      });
    } else {
      summary.textContent = t("projectImport.preflight.summaryReady", { pages: info.pages });
    }
    if (primary) primary.disabled = busy || info.blocked;
  };

  const setBusy = (value: boolean): void => {
    busy = value;
    for (const button of modal?.querySelectorAll<HTMLButtonElement>(".preflight-action") ?? []) {
      button.disabled = busy;
    }
    updateFooter();
  };

  const focusDocument = (documentId: string, fallback?: string): void => {
    const row = modal?.querySelector<HTMLElement>(
      `.preflight-document[data-document="${documentId}"]`,
    );
    const target =
      row?.querySelector<HTMLButtonElement>(".preflight-action") ??
      (fallback
        ? modal?.querySelector<HTMLButtonElement>(`[data-focus="${fallback}"]`)
        : undefined) ??
      primary;
    target?.focus();
  };

  const runAction = async (
    documentId: string,
    kind: "relink" | "unrelink",
    task: () => Promise<ImportPreflightSnapshot | null>,
  ): Promise<void> => {
    if (busy || !host) return;
    setBusy(true);
    try {
      const next = await task();
      if (next) {
        current = next;
        confirmed.delete(documentId);
        if (kind === "relink") relinked.add(documentId);
        else relinked.delete(documentId);
        renderCounts();
        renderSources();
        renderNotes();
      }
    } finally {
      setBusy(false);
      focusDocument(documentId, "import");
    }
  };

  const actionButton = (
    label: string,
    documentId: string,
    kind: "relink" | "unrelink" | "confirm",
    onClick: () => void,
  ): HTMLButtonElement => {
    const button = el("button", "btn btn-small btn-ghost preflight-action", label);
    button.type = "button";
    button.dataset.document = documentId;
    button.dataset.action = kind;
    button.dataset.focus = `${documentId}:${kind}`;
    button.addEventListener("click", onClick);
    return button;
  };

  const sourceRow = (state: ImportSourceState): HTMLElement => {
    const accepted = confirmed.has(state.documentId);
    const row = el("div", "preflight-document");
    row.dataset.document = state.documentId;
    row.classList.toggle("is-missing", state.missing);
    row.classList.toggle("is-changed", sourceNeedsConfirmation(state) && !accepted);

    const head = el("div", "preflight-document-head");
    head.append(
      el("strong", "", state.name || t("projectImport.unknownDocument")),
      el(
        "span",
        `preflight-status${state.missing ? " is-missing" : ""}`,
        statusLabel(state, accepted),
      ),
    );
    row.append(head);

    if (state.pageCountChanged && state.actualPageCount !== null) {
      row.append(
        el(
          "p",
          "settings-note",
          t("projectImport.preflight.sourcePageCountChanged", {
            actual: state.actualPageCount,
            expected: state.expectedPageCount,
          }),
        ),
      );
    }
    row.append(
      el(
        "p",
        "settings-note",
        state.missing
          ? t("projectImport.preflight.sourcePagesMissing", { count: state.selectedPages })
          : t("projectImport.preflight.sourcePages", {
              importable: state.importablePages,
              selected: state.selectedPages,
            }),
      ),
    );

    const actions = el("div", "preflight-document-actions");
    if (host && state.kind === "pdf") {
      if (state.missing || sourceNeedsConfirmation(state) || relinked.has(state.documentId)) {
        actions.append(
          actionButton(t("projectImport.preflight.relink"), state.documentId, "relink", () => {
            void runAction(state.documentId, "relink", () => host.relink(state.documentId));
          }),
        );
      }
      if (relinked.has(state.documentId)) {
        actions.append(
          actionButton(t("projectImport.preflight.unrelink"), state.documentId, "unrelink", () => {
            void runAction(state.documentId, "unrelink", () => host.unrelink(state.documentId));
          }),
        );
      }
    }
    if (sourceNeedsConfirmation(state) && !accepted) {
      actions.append(
        actionButton(
          t("projectImport.preflight.confirmChanged"),
          state.documentId,
          "confirm",
          () => {
            confirmed.add(state.documentId);
            renderSources();
            updateFooter();
            focusDocument(state.documentId, "import");
          },
        ),
      );
    }
    if (actions.childElementCount) row.append(actions);
    return row;
  };

  const renderSources = (): void => {
    sources.replaceChildren();
    if (!current.sources.length) return;
    sources.append(
      el("p", "settings-note preflight-section-title", t("projectImport.preflight.sourcesTitle")),
    );
    for (const state of current.sources) sources.append(sourceRow(state));
  };

  renderCounts();
  renderSources();
  renderNotes();

  const value = await showModal({
    title: t("projectImport.preflight.title"),
    subtitle: current.preflight.sourceName,
    body,
    wide: true,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("projectImport.preflight.import"), value: "import", primary: true },
    ],
    onValidate: () => {
      const info = summarizeImportPreflight(current, confirmed);
      return info.blocked ? t("projectImport.preflight.blockedHint") : null;
    },
    onMount: (mount) => {
      modal = mount;
      primary = mount.querySelector<HTMLButtonElement>(".modal-footer .btn-primary");
      const footer = mount.querySelector<HTMLElement>(".modal-footer");
      footer?.insertBefore(summary, footer.firstChild);
      updateFooter();
    },
  });
  modal = null;
  primary = null;
  return value === "import";
}
