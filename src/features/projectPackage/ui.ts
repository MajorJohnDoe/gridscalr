import { formatBytes } from "../../io/platform";
import { showModal } from "../../ui/dialogs";
import { el } from "../../ui/dom";
import {
  DEFAULT_PACKAGE_OPTIONS,
  desktopOnlyMessage,
  normalizePackageFailure,
  type PackageFailure,
  type PackageOptions,
  type PackageProgress,
} from "./model";
import { t } from "../../i18n";

function checkboxRow(
  label: string,
  note: string,
  checked: boolean,
  disabled = false,
): { row: HTMLElement; input: HTMLInputElement } {
  const row = el("label", "check-row export-check");
  const input = el("input");
  input.type = "checkbox";
  input.checked = checked;
  input.disabled = disabled;
  const text = el("span", "export-check-text");
  text.append(el("strong", "", label), el("span", "export-check-note", note));
  row.append(input, text);
  return { row, input };
}

/** Options shown before a package is written. Everything optional is off. */
export function packageOptionsDialog(
  documentCount: number,
  tifCount: number,
  desktop: boolean,
  estimateBytes?: (options: PackageOptions) => number,
): Promise<PackageOptions | null> {
  const body = el("div", "form-stack");
  body.append(el("p", "modal-message", t("package.optionsIntro", { count: documentCount })));

  const quantity = checkboxRow(
    t("package.includeQuantity"),
    t("package.includeQuantityNote"),
    DEFAULT_PACKAGE_OPTIONS.includeQuantityExports,
  );
  const drawing = checkboxRow(
    t("package.includeDrawing"),
    t("package.includeDrawingNote"),
    DEFAULT_PACKAGE_OPTIONS.includeDrawingPdf,
  );
  const scans = checkboxRow(
    t("package.includeScans"),
    tifCount ? t("package.includeScansNote") : t("package.noScans"),
    DEFAULT_PACKAGE_OPTIONS.includeSourceScans,
    tifCount === 0,
  );
  body.append(quantity.row, drawing.row, scans.row);

  const selected = (): PackageOptions => ({
    includeQuantityExports: quantity.input.checked,
    includeDrawingPdf: drawing.input.checked,
    includeSourceScans: scans.input.checked,
  });

  // The expected uncompressed size is known before anything is written, so the
  // user sees it here instead of discovering an over-limit package later (F-044).
  let sizeLine: HTMLElement | null = null;
  if (estimateBytes) {
    sizeLine = el("p", "modal-message package-estimated-size", "");
    const updateSize = () => {
      if (!sizeLine) return;
      sizeLine.textContent = t("package.expectedSize", {
        size: formatBytes(estimateBytes(selected())),
      });
    };
    body.append(sizeLine);
    for (const input of [quantity.input, drawing.input, scans.input]) {
      input.addEventListener("change", updateSize);
    }
    updateSize();
  }

  if (!desktop) {
    body.append(el("p", "form-error", desktopOnlyMessage()));
  }

  return showModal({
    title: t("package.optionsTitle"),
    subtitle: t("package.optionsSubtitle"),
    body,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("package.createAction"), value: "create", primary: true },
    ],
    wide: true,
    onValidate: () => (desktop ? null : desktopOnlyMessage()),
    onMount: (modal) => {
      if (desktop) return;
      for (const button of modal.querySelectorAll<HTMLButtonElement>("button.btn-primary")) {
        button.disabled = true;
      }
    },
  }).then((value) => (value === "create" ? selected() : null));
}

export type PackageDestinationChoice = "extract" | "replace" | "reuse" | "choose";

export function packageDestinationDialog(
  projectName: string,
  destination: string,
  exists: boolean,
  uncompressedBytes = 0,
): Promise<PackageDestinationChoice | null> {
  const body = el("div", "form-stack");
  body.append(
    el("p", "modal-message", t("package.destinationIntro", { name: projectName })),
    el("p", "package-destination", destination),
  );
  if (uncompressedBytes > 0) {
    body.append(
      el(
        "p",
        "modal-message",
        t("package.uncompressedSize", { size: formatBytes(uncompressedBytes) }),
      ),
    );
  }
  if (exists) {
    body.append(el("p", "modal-message", t("package.destinationExists")));
  }

  const actions: { label: string; value: string; primary?: boolean; danger?: boolean }[] = [
    { label: t("common.cancel"), value: "__cancel__" },
    { label: t("package.chooseAnother"), value: "choose" },
  ];
  if (exists) {
    actions.push(
      { label: t("package.replaceFolder"), value: "replace", danger: true },
      { label: t("package.openExisting"), value: "reuse", primary: true },
    );
  } else {
    actions.push({ label: t("package.extractHere"), value: "extract", primary: true });
  }

  return showModal({
    title: t("package.openTitle"),
    body,
    actions,
    wide: true,
  }).then((value) =>
    value === "extract" || value === "replace" || value === "reuse" || value === "choose"
      ? value
      : null,
  );
}

export interface PackageJobReporter {
  update(progress: PackageProgress): void;
  phase(text: string): void;
}

export type PackageJobOutcome<T> =
  { status: "ok"; value: T } | { status: "cancelled" } | { status: "error"; error: PackageFailure };

/**
 * Shows a blocking progress dialog around a Rust package job. Cancel asks the
 * Rust job to stop; the modal stays until the job has cleaned up.
 */
export function runPackageJob<T>(
  title: string,
  start: (report: PackageJobReporter, isCancelled: () => boolean) => Promise<T>,
  cancel: () => void,
): Promise<PackageJobOutcome<T>> {
  return new Promise((resolve) => {
    let done = false;
    let cancelRequested = false;
    let closeModal: (() => void) | null = null;

    const finish = (outcome: PackageJobOutcome<T>) => {
      if (done) return;
      done = true;
      closeModal?.();
      resolve(outcome);
    };

    const body = el("div", "form-stack package-progress");
    const status = el("p", "modal-message", t("package.starting"));
    const bar = el("progress", "package-progress-bar");
    bar.max = 100;
    bar.value = 0;
    const file = el("p", "package-progress-file", "");
    const cancelButton = el("button", "btn", t("common.cancel"));
    cancelButton.type = "button";
    const actions = el("div", "input-row");
    actions.append(cancelButton);
    body.append(status, bar, file, actions);

    const report: PackageJobReporter = {
      update(progress) {
        status.textContent = progress.phase;
        file.textContent = progress.currentFile;
        if (progress.totalBytes > 0) {
          bar.value = Math.min(
            100,
            Math.round((progress.processedBytes / progress.totalBytes) * 100),
          );
        } else {
          bar.removeAttribute("value");
        }
        if (progress.totalBytes > 0) {
          file.textContent = t("package.progressBytes", {
            file: progress.currentFile || t("package.progressFallback"),
            processed: formatBytes(progress.processedBytes),
            total: formatBytes(progress.totalBytes),
          });
        }
      },
      phase(text) {
        status.textContent = text;
        bar.removeAttribute("value");
        file.textContent = "";
      },
    };

    const requestCancel = () => {
      if (cancelRequested) return;
      cancelRequested = true;
      cancelButton.disabled = true;
      status.textContent = t("package.cancelling");
      cancel();
    };
    cancelButton.addEventListener("click", requestCancel);

    const run = async () => {
      try {
        const value = await start(report, () => cancelRequested);
        finish({ status: "ok", value });
      } catch (error) {
        const failure = normalizePackageFailure(error);
        finish(
          failure.kind === "cancelled"
            ? { status: "cancelled" }
            : { status: "error", error: failure },
        );
      }
    };

    void showModal({
      title,
      body,
      actions: [],
      wide: true,
      onClose: () => {
        if (!done) requestCancel();
      },
      onMount: (_modal, close) => {
        closeModal = close;
        void run();
      },
    });
  });
}
