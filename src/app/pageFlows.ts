import { pageDisplayName, pageNumber, pageRecordById, documentPageOrder } from "../model/pages";
import { findItem } from "../model/layers";
import type { MarkupItem, PageId, PageSize } from "../model/types";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import type { PageThumbnailService } from "../pdf/thumbnails";
import { store } from "../state/store";
import { recordStructuralCheckpoint } from "../features/sessionRecovery";
import { confirmDialog } from "../ui/dialogs";
import { duplicatePageDialog } from "../ui/duplicatePageDialog";
import { toast } from "../ui/toast";
import { t } from "../i18n";

export interface PageFlowHost {
  renderer(): PdfRenderer | null;
  thumbnails(): PageThumbnailService | null;
  resetPageSizes(): void;
  enqueuePageSize(page: number): Promise<PageSize | undefined>;
  fitPage(): void;
  focusItem(item: MarkupItem): void;
  invalidate(): void;
  renderAll(): void;
  closeSearch(): void;
  closeReference(): Promise<void>;
  closeSplitView(): void;
  destroyRenderer(): Promise<void>;
}

/** Keeps the renderer's display-page order in sync with the project page list. */
export function syncRendererPageOrder(host: PageFlowHost): void {
  const project = store.project;
  if (!project) return;
  host.renderer()?.setPageOrder(documentPageOrder(project));
  host.thumbnails()?.clear();
  host.resetPageSizes();
}

export async function goToPage(host: PageFlowHost, page: number, fit = true): Promise<void> {
  const project = store.project;
  if (!project) return;
  const target = Math.max(1, Math.min(Math.max(1, project.pages.length), Math.round(page)));
  if (target !== store.ui.page) store.setPage(target);
  const size = await host.enqueuePageSize(target);
  if (size && fit) {
    host.fitPage();
    host.invalidate();
  }
}

export async function navigateToItem(
  host: PageFlowHost,
  pageId: PageId,
  layerId: string,
  itemId: string,
): Promise<void> {
  const project = store.project;
  if (!project) return;
  const target = pageNumber(project, pageId);
  if (!target) return;
  if (target !== store.ui.page) store.setPage(target);
  await host.enqueuePageSize(target);
  const found = findItem(project, itemId);
  store.setSelection({ layerId, itemId });
  if (found) host.focusItem(found.item);
  host.invalidate();
}

export async function duplicatePageFlow(host: PageFlowHost, pageId: PageId): Promise<void> {
  const project = store.project;
  if (!project) return;
  const source = pageRecordById(project, pageId);
  if (!source) return;
  const sourcePage = pageNumber(project, pageId);
  const total = project.pages.length;
  const sourceName = pageDisplayName(project, pageId);
  const defaultName = sourceName
    ? t("app.pageCopyName", { name: sourceName })
    : t("app.pageCopyDefault", { page: sourcePage });
  const hasScale = Boolean(source.state.calibration);
  const options = await duplicatePageDialog({
    page: sourcePage,
    newPage: total + 1,
    defaultName,
    hasScale,
  });
  if (!options) return;

  await recordStructuralCheckpoint(
    t("sessionRecovery.checkpoint.duplicatePage", { page: sourcePage }),
  );
  const result = store.duplicatePage(pageId, options);
  if (!result) {
    toast(t("app.pageDuplicateFailed"), "warning");
    return;
  }
  syncRendererPageOrder(host);
  await host.enqueuePageSize(result.pageNumber);
  host.fitPage();
  host.invalidate();
  host.renderAll();
  toast(t("app.pageDuplicated", { from: sourcePage, to: result.pageNumber }), "success");
}

export async function deletePageFlow(host: PageFlowHost, pageId: PageId): Promise<void> {
  const project = store.project;
  if (!project) return;
  const record = pageRecordById(project, pageId);
  if (!record) return;
  const total = project.pages.length;
  if (total <= 0) return;
  const target = pageNumber(project, pageId);
  const document = project.documents.find((entry) => entry.id === record.documentId);
  const pageName = pageDisplayName(project, pageId);
  const targetLabel = pageName
    ? t("app.deletePageNamed", { name: pageName, page: target })
    : t("app.deletePageNumbered", { page: target });
  const sourceLabel = document ? t("app.deletePageFromSource", { name: document.name }) : "";
  const confirmed = await confirmDialog(
    t("app.deletePageTitle"),
    t("app.deletePageMessage", { target: targetLabel, source: sourceLabel }),
    t("app.deletePageConfirm"),
    { danger: true },
  );
  if (!confirmed) return;
  await recordStructuralCheckpoint(t("sessionRecovery.checkpoint.deletePage", { page: target }));
  const result = store.deletePage(pageId);
  if (!result) {
    toast(t("app.pageDeleteFailed"), "warning");
    return;
  }
  syncRendererPageOrder(host);
  await host.enqueuePageSize(store.ui.page);
  host.fitPage();
  host.invalidate();
  host.renderAll();
  toast(t("app.pageDeleted", { page: result.pageNumber }), "info");
}

export async function resetProject(host: PageFlowHost): Promise<void> {
  host.closeSearch();
  await host.closeReference();
  host.closeSplitView();
  store.closeProject();
  await host.destroyRenderer();
  host.resetPageSizes();
  host.fitPage();
  host.invalidate();
  host.renderAll();
}
