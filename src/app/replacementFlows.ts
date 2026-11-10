import { t } from "../i18n";
import { pageNumber, pageRecordById } from "../model/pages";
import type { PageSize } from "../model/types";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import type { PageThumbnailService } from "../pdf/thumbnails";
import { store } from "../state/store";
import { recordStructuralCheckpoint } from "../features/sessionRecovery";
import {
  applySourceReplacement,
  defaultReplacementMappings,
  pagesForDocument,
  sourceReplacementDialog,
} from "../features/pageModel";
import { pickDrawing } from "../io/platform";
import { describeError } from "../io/platformError";
import { messageDialog } from "../ui/dialogs";
import { toast } from "../ui/toast";
import { createImportedDocument, openDocument } from "./documentImport";

export interface ReplacementFlowHost {
  renderer(): PdfRenderer | null;
  thumbnails(): PageThumbnailService | null;
  resetPageSizes(): void;
  enqueuePageSize(page: number): Promise<PageSize | undefined>;
  fitPage(): void;
  invalidate(): void;
  renderAll(): void;
}

/** **Replace source…** flow for one document. Source files are never written. */
export async function replaceSourceFlow(
  host: ReplacementFlowHost,
  documentId: string,
): Promise<void> {
  const project = store.project;
  const renderer = host.renderer();
  if (!project || !renderer) return;
  const document = project.documents.find((entry) => entry.id === documentId);
  if (!document) return;
  if (document.kind !== "pdf") {
    toast(t("replace.pdfOnly"), "warning");
    return;
  }
  const oldPageIds = pagesForDocument(project, documentId);
  if (!oldPageIds.length) return;

  try {
    const picked = await pickDrawing();
    if (!picked) return;
    const imported = await createImportedDocument(picked.bytes, picked.name, picked.path);
    if (!imported) return;
    const proxy = await openDocument(imported.pdfBytes, picked.name);
    if (!proxy) return;
    const newPageCount = proxy.numPages;
    imported.documentRef.pageCount = newPageCount;

    const temporaryRenderer = new (await import("../pdf/pdfRenderer")).PdfRenderer(
      [proxy],
      [Array.from({ length: newPageCount }, (_, index) => index + 1)],
      Array.from({ length: newPageCount }, (_, index) => ({
        documentIndex: 0,
        localPage: index + 1,
      })),
    );
    const requestThumbnail = async (page: number) => {
      const canvas = await temporaryRenderer.renderPageThumbnail(page, 180);
      return canvas.toDataURL("image/jpeg", 0.72);
    };

    const rows = oldPageIds.map((pageId) => {
      const record = pageRecordById(project, pageId)!;
      return {
        pageId,
        page: pageNumber(project, pageId),
        localPage: record.localPage,
        name: record.state.name,
        calibrated: Boolean(record.state.calibration),
        scaleLocked: record.state.scaleLocked === true,
      };
    });
    const result = await sourceReplacementDialog({
      documentName: document.name,
      newFileName: picked.name,
      newPageCount,
      rows,
      defaultMappings: defaultReplacementMappings(project, documentId, newPageCount),
      requestThumbnail,
    });
    temporaryRenderer.cancel();
    if (!result) {
      await proxy.loadingTask.destroy().catch(() => undefined);
      return;
    }

    await recordStructuralCheckpoint(
      t("sessionRecovery.checkpoint.replaceSource", { name: document.name }),
    );
    const applied = applySourceReplacement(project, {
      documentId,
      newDocument: imported.documentRef,
      mappings: result.mappings,
    });
    if (!applied) {
      await proxy.loadingTask.destroy().catch(() => undefined);
      toast(t("replace.failed"), "warning");
      return;
    }

    // Replacing a source is structural: an older undo snapshot could restore a
    // superseded document reference that no longer matches the renderer.
    store.clearHistory();
    const documentIndex = project.documents.findIndex((entry) => entry.id === documentId);
    if (applied.updatedDocument && documentIndex >= 0) {
      renderer.replaceDocument(
        documentIndex,
        proxy,
        Array.from({ length: newPageCount }, (_, index) => index + 1),
      );
    } else {
      renderer.addDocument(
        proxy,
        Array.from({ length: newPageCount }, (_, index) => index + 1),
      );
    }
    const { documentPageOrder } = await import("../model/pages");
    renderer.setPageOrder(documentPageOrder(project));
    store.dirty = true;
    store.revision += 1;
    host.thumbnails()?.clear();
    host.resetPageSizes();
    await host.enqueuePageSize(store.ui.page);
    host.fitPage();
    host.invalidate();
    host.renderAll();
    toast(
      t("replace.done", {
        mapped: applied.mappedPages,
        superseded: applied.supersededPages,
      }),
      applied.supersededPages ? "info" : "success",
    );
  } catch (error) {
    await messageDialog(t("replace.failed"), describeError(error), "warning");
  }
}
