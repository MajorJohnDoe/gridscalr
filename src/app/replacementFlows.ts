import { t } from "../i18n";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { pageNumber, pageRecordById } from "../model/pages";
import type { PageSize, Project } from "../model/types";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import type { PageThumbnailService } from "../pdf/thumbnails";
import { store } from "../state/store";
import { recordStructuralCheckpoint } from "../features/sessionRecovery";
import {
  applySourceReplacement,
  defaultReplacementMappings,
  pageSizeChanged,
  pagesForDocument,
  replacementWarnings,
  sourceReplacementDialog,
  type SourceReplacementResult,
} from "../features/pageModel";
import { pickDrawing } from "../io/platform";
import { isTiff } from "../io/tiff";
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

/**
 * Swaps the renderer document for a replacement and publishes the structural
 * project change. The store listener derives the new page order from the
 * project, so notifying it is what keeps the canvas on the mapped pages; a
 * silent mutation would keep rendering the old mapping.
 */
export function commitSourceReplacement(
  applied: SourceReplacementResult,
  renderer: PdfRenderer,
  documentIndex: number,
  proxy: PDFDocumentProxy,
  newPageCount: number,
): void {
  // An older undo snapshot could restore a superseded document reference that
  // no longer matches the renderer, so replacement stays a history boundary.
  store.clearHistory();
  const pageMap = Array.from({ length: newPageCount }, (_, index) => index + 1);
  if (applied.updatedDocument && documentIndex >= 0) {
    renderer.replaceDocument(documentIndex, proxy, pageMap);
  } else {
    renderer.addDocument(proxy, pageMap);
  }
  store.dirty = true;
  store.revision += 1;
  store.emit("project");
}

/**
 * Counts mapped pages whose size differs between the loaded source and the
 * picked revision. Only page viewports are read; no page is rendered.
 */
async function countChangedPageSizes(
  renderer: PdfRenderer,
  documentIndex: number,
  project: Project,
  pageIds: readonly string[],
  newProxy: PDFDocumentProxy,
  mappings: readonly { pageId: string; newLocalPage: number }[],
): Promise<number> {
  const oldProxy = renderer.documents[documentIndex];
  if (!oldProxy) return 0;
  const mapped = new Map(mappings.map((mapping) => [mapping.pageId, mapping.newLocalPage]));
  let changed = 0;
  for (const pageId of pageIds) {
    const record = pageRecordById(project, pageId);
    const newLocalPage = mapped.get(pageId);
    if (!record || !newLocalPage) continue;
    try {
      const [oldPage, newPage] = await Promise.all([
        oldProxy.getPage(record.localPage),
        newProxy.getPage(newLocalPage),
      ]);
      if (pageSizeChanged(oldPage.getViewport({ scale: 1 }), newPage.getViewport({ scale: 1 }))) {
        changed += 1;
      }
    } catch {
      // An unreadable page is reported by the mapping dialog itself.
    }
  }
  return changed;
}

/** **Replace source…** flow for one document. Source files are never written. */
export async function replaceSourceFlow(
  host: ReplacementFlowHost,
  documentId: string,
): Promise<void> {
  const project = store.project;
  const renderer = host.renderer();
  if (!project || !renderer || store.readOnly) return;
  const document = project.documents.find((entry) => entry.id === documentId);
  if (!document) return;
  if (document.kind !== "pdf" && document.kind !== "tiff") {
    toast(t("replace.unsupportedKind"), "warning");
    return;
  }
  const oldPageIds = pagesForDocument(project, documentId);
  if (!oldPageIds.length) return;
  const documentIndex = project.documents.findIndex((entry) => entry.id === documentId);

  try {
    const picked = await pickDrawing();
    if (!picked) return;
    const pickedIsTiff = isTiff(picked.bytes);
    if (pickedIsTiff !== (document.kind === "tiff")) {
      toast(t("replace.sameKind"), "warning");
      return;
    }
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
    const defaultMappings = defaultReplacementMappings(project, documentId, newPageCount);
    const warnings = replacementWarnings({
      oldPageCount: oldPageIds.length,
      newPageCount,
      calibratedPages: rows.filter((row) => row.calibrated).length,
      scaleLockedPages: rows.filter((row) => row.scaleLocked).length,
      sizeChangedPages: await countChangedPageSizes(
        renderer,
        documentIndex,
        project,
        oldPageIds,
        proxy,
        defaultMappings,
      ),
    });
    const result = await sourceReplacementDialog({
      documentName: document.name,
      newFileName: picked.name,
      newPageCount,
      rows,
      defaultMappings,
      warnings,
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

    commitSourceReplacement(applied, renderer, documentIndex, proxy, newPageCount);
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
