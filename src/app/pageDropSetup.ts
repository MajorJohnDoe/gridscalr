import { t } from "../i18n";
import { PageFileDropController, type PageDropRejection } from "../features/pageFileDrop";
import type { SourceStorageController } from "../features/sourceStorage";
import { toast } from "../ui/toast";
import { importDroppedDrawing, type DroppedDrawingHost } from "./droppedDrawingFlows";
import type { ProjectImportHost } from "./projectImportFlows";

/**
 * Wiring for a PDF/TIF drop on the Pages panel. The controller owns the DOM and
 * the target decision; the dropped drawing goes through the project-import
 * host so the selection, preflight and commit stay the existing path.
 */
export interface PageDropSetupHost {
  dockBody: HTMLElement;
  projectImportHost: () => ProjectImportHost;
  sourceStorage: () => Pick<SourceStorageController, "recommendImport" | "applyImportChoice">;
}

function createDroppedDrawingHost(host: PageDropSetupHost): DroppedDrawingHost {
  return {
    ...host.projectImportHost(),
    recommendSourceStorage: (path, name, kind) =>
      host.sourceStorage().recommendImport(path, name, kind),
    applySourceStorage: (documentId) => host.sourceStorage().applyImportChoice(documentId),
  };
}

function rejectPageDrop(reason: PageDropRejection, name?: string, count?: number): void {
  const message =
    reason === "project"
      ? t("app.dropProjectOnPages", { name: name ?? "" })
      : reason === "unsupported"
        ? t("app.dropUnsupportedPages", { name: name ?? "" })
        : reason === "multiple"
          ? t("app.dropOneAtATime", { count: count ?? 0 })
          : t("viewOnly.actionBlocked");
  toast(message, "warning");
}

export function installPageFileDrop(host: PageDropSetupHost): PageFileDropController {
  const controller = new PageFileDropController({
    addDrawing: (file, insertionIndex) =>
      void importDroppedDrawing(createDroppedDrawingHost(host), file, insertionIndex),
    reject: rejectPageDrop,
  });
  controller.bindPanel(host.dockBody);
  return controller;
}
