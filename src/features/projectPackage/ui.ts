import { formatBytes } from "../../io/platform";
import { showModal } from "../../ui/dialogs";
import { el } from "../../ui/dom";
import {
  DEFAULT_PACKAGE_OPTIONS,
  DESKTOP_ONLY_MESSAGE,
  normalizePackageFailure,
  type PackageFailure,
  type PackageOptions,
  type PackageProgress,
} from "./model";

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
): Promise<PackageOptions | null> {
  const body = el("div", "form-stack");
  body.append(
    el(
      "p",
      "modal-message",
      `Create a portable ZIP with the project file, ${documentCount} referenced drawing${documentCount === 1 ? "" : "s"} and a manifest. Absolute paths from this computer are removed.`,
    ),
  );

  const quantity = checkboxRow(
    "Include quantity exports",
    "Adds quantity CSV, Excel and PDF reports under exports/. They are generated when the package is created.",
    DEFAULT_PACKAGE_OPTIONS.includeQuantityExports,
  );
  const drawing = checkboxRow(
    "Include drawing PDF",
    "Adds a flattened PDF with every page, visible layers, labels and the calibration line. This can take a while.",
    DEFAULT_PACKAGE_OPTIONS.includeDrawingPdf,
  );
  const scans = checkboxRow(
    "Include original TIF scans",
    tifCount
      ? "Adds the original TIF files under source-scans/. Not needed to open or edit the project; the embedded PDF is enough."
      : "No TIF documents in this project.",
    DEFAULT_PACKAGE_OPTIONS.includeSourceScans,
    tifCount === 0,
  );
  body.append(quantity.row, drawing.row, scans.row);

  if (!desktop) {
    body.append(el("p", "form-error", DESKTOP_ONLY_MESSAGE));
  }

  return showModal({
    title: "Package project",
    subtitle: "Share the project and its drawings as one standard ZIP file.",
    body,
    actions: [
      { label: "Cancel", value: "__cancel__" },
      { label: "Create package", value: "create", primary: true },
    ],
    wide: true,
    onValidate: () => (desktop ? null : DESKTOP_ONLY_MESSAGE),
    onMount: (modal) => {
      if (desktop) return;
      for (const button of modal.querySelectorAll<HTMLButtonElement>("button.btn-primary")) {
        button.disabled = true;
      }
    },
  }).then((value) =>
    value === "create"
      ? {
          includeQuantityExports: quantity.input.checked,
          includeDrawingPdf: drawing.input.checked,
          includeSourceScans: scans.input.checked,
        }
      : null,
  );
}

export type PackageDestinationChoice = "extract" | "replace" | "reuse" | "choose";

export function packageDestinationDialog(
  projectName: string,
  destination: string,
  exists: boolean,
): Promise<PackageDestinationChoice | null> {
  const body = el("div", "form-stack");
  body.append(
    el("p", "modal-message", `“${projectName}” will be extracted to this folder:`),
    el("p", "package-destination", destination),
  );
  if (exists) {
    body.append(
      el(
        "p",
        "modal-message",
        "The folder already exists. Open the extracted copy or replace the folder with a fresh extraction.",
      ),
    );
  }

  const actions: { label: string; value: string; primary?: boolean; danger?: boolean }[] = [
    { label: "Cancel", value: "__cancel__" },
    { label: "Choose another folder…", value: "choose" },
  ];
  if (exists) {
    actions.push(
      { label: "Replace folder", value: "replace", danger: true },
      { label: "Open existing", value: "reuse", primary: true },
    );
  } else {
    actions.push({ label: "Extract here", value: "extract", primary: true });
  }

  return showModal({
    title: "Open project package",
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
    const status = el("p", "modal-message", "Starting…");
    const bar = el("progress", "package-progress-bar");
    bar.max = 100;
    bar.value = 0;
    const file = el("p", "package-progress-file", "");
    const cancelButton = el("button", "btn", "Cancel");
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
          file.textContent = `${progress.currentFile || "Package"} · ${formatBytes(progress.processedBytes)} of ${formatBytes(progress.totalBytes)}`;
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
      status.textContent = "Cancelling…";
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
