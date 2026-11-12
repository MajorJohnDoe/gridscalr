import { t } from "../i18n";
import { isTauri, readFileBytes } from "../io/platform";
import { describeError } from "../io/platformError";
import { includedLocalPages } from "../model/documents";
import type { PageSize } from "../model/types";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import type { PageThumbnailService } from "../pdf/thumbnails";
import { store } from "../state/store";
import { sourceStatus } from "../source/sourceStatus";
import { logEvent } from "../features/diagnostics/log";
import { SourceStorageController } from "../features/sourceStorage";
import { recordStructuralCheckpoint } from "../features/sessionRecovery";
import { openDocument } from "./documentImport";

export interface SourceStorageAppHost {
  saveProject: () => Promise<boolean>;
  replaceSource: (documentId: string) => void;
  bannerHost: HTMLElement;
  notify: (message: string, kind?: "info" | "success" | "warning" | "error") => void;
  renderer: () => PdfRenderer | null;
  thumbnails: () => PageThumbnailService | null;
  resetPageSizes: () => void;
  enqueuePageSize: (page: number) => Promise<PageSize | undefined>;
  invalidate: () => void;
  renderAll: () => void;
}

/**
 * Wires the source-storage controller into the app shell. App.ts keeps one
 * field and one dispose call; renderer replacement and page-size refreshes
 * stay here as wiring, not as feature business logic.
 */
export function createSourceStorageController(host: SourceStorageAppHost): SourceStorageController {
  return new SourceStorageController({
    desktop: isTauri,
    bannerHost: host.bannerHost,
    notify: host.notify,
    ensureSaved: () => host.saveProject(),
    replaceSource: (documentId) => host.replaceSource(documentId),
    probePdf: async (bytes) => {
      const proxy = await openDocument(bytes, t("app.untitledProject"));
      if (!proxy) return null;
      const count = proxy.numPages;
      await proxy.loadingTask.destroy().catch(() => undefined);
      return count;
    },
    reloadDocument: (documentId) => reloadSourceDocument(host, documentId),
    checkpoint: (label) => recordStructuralCheckpoint(label),
    afterChange: () => {
      store.emit("project");
      void sourceStatus.refresh();
      host.resetPageSizes();
      host.invalidate();
      host.renderAll();
    },
  });
}

async function reloadSourceDocument(
  host: SourceStorageAppHost,
  documentId: string,
): Promise<boolean> {
  const project = store.project;
  const index = project?.documents.findIndex((entry) => entry.id === documentId) ?? -1;
  if (!project || index < 0) return false;
  const document = project.documents[index];
  if (!document.path) return false;
  try {
    const proxy = await openDocument(await readFileBytes(document.path), document.name);
    if (!proxy) return false;
    // Reloading a source keeps every page and its position; the store-derived
    // page order is unchanged, so only the replaced document needs refreshing.
    host.renderer()?.replaceDocument(index, proxy, includedLocalPages(document));
    host.thumbnails()?.clear();
    host.resetPageSizes();
    void host.enqueuePageSize(store.ui.page);
    host.invalidate();
    host.renderAll();
    return true;
  } catch (error) {
    logEvent("warn", `source reload failed: ${describeError(error)}`);
    return false;
  }
}
