import {
  documentIndexForPage,
  documentPageMaps,
  pageDisplayName,
  projectDocumentForPage,
  totalPageCount,
} from "../model/documents";
import { findItem } from "../model/layers";
import type { MarkupItem, PageSize } from "../model/types";
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

export async function goToPage(host: PageFlowHost, page: number, fit = true): Promise<void> {
  const project = store.project;
  if (!project) return;
  const target = Math.max(1, Math.min(totalPageCount(project.documents), Math.round(page)));
  if (target !== store.ui.page) store.setPage(target);
  const size = await host.enqueuePageSize(target);
  if (size && fit) {
    host.fitPage();
    host.invalidate();
  }
}

export async function navigateToItem(
  host: PageFlowHost,
  page: number,
  layerId: string,
  itemId: string,
): Promise<void> {
  const project = store.project;
  if (!project) return;
  const target = Math.max(1, Math.min(totalPageCount(project.documents), Math.round(page)));
  if (target !== store.ui.page) store.setPage(target);
  await host.enqueuePageSize(target);
  const found = findItem(project, itemId);
  store.setSelection({ layerId, itemId });
  if (found) host.focusItem(found.item);
  host.invalidate();
}

export async function duplicatePageFlow(host: PageFlowHost, page: number): Promise<void> {
  const project = store.project;
  if (!project) return;
  const total = totalPageCount(project.documents);
  const target = Math.max(1, Math.min(total, Math.round(page)));
  const sourceName = pageDisplayName(project, target);
  const defaultName = sourceName
    ? t("app.pageCopyName", { name: sourceName })
    : t("app.pageCopyDefault", { page: target });
  const hasScale = Boolean(project.pages[String(target)]?.calibration);
  const options = await duplicatePageDialog({
    page: target,
    newPage: total + 1,
    defaultName,
    hasScale,
  });
  if (!options) return;

  const sourceDocumentIndex = documentIndexForPage(project.documents, target);
  const renderer = host.renderer();
  const sourceProxy = renderer?.documents[sourceDocumentIndex];
  await recordStructuralCheckpoint(t("sessionRecovery.checkpoint.duplicatePage", { page: target }));
  const result = store.duplicatePage(target, options);
  if (!result) {
    toast(t("app.pageDuplicateFailed"), "warning");
    return;
  }
  if (sourceProxy && renderer) renderer.addDocument(sourceProxy, [result.sourceLocalPage]);
  host.thumbnails()?.clear();
  host.resetPageSizes();
  await host.enqueuePageSize(result.page);
  host.fitPage();
  host.invalidate();
  host.renderAll();
  toast(t("app.pageDuplicated", { from: target, to: result.page }), "success");
}

export async function deletePageFlow(host: PageFlowHost, page: number): Promise<void> {
  const project = store.project;
  if (!project) return;
  const source = projectDocumentForPage(project, page);
  const total = totalPageCount(project.documents);
  if (total <= 1) {
    toast(t("app.lastPage"), "warning");
    return;
  }
  const target = Math.max(1, Math.min(total, Math.round(page)));
  const pageName = pageDisplayName(project, target);
  const targetLabel = pageName
    ? t("app.deletePageNamed", { name: pageName, page: target })
    : t("app.deletePageNumbered", { page: target });
  const sourceLabel = source ? t("app.deletePageFromSource", { name: source.name }) : "";
  const confirmed = await confirmDialog(
    t("app.deletePageTitle"),
    t("app.deletePageMessage", { target: targetLabel, source: sourceLabel }),
    t("app.deletePageConfirm"),
    { danger: true },
  );
  if (!confirmed) return;
  await recordStructuralCheckpoint(t("sessionRecovery.checkpoint.deletePage", { page: target }));
  const renderer = host.renderer();
  const result = store.deletePage(target);
  if (!result) {
    toast(t("app.pageDeleteFailed"), "warning");
    return;
  }
  if (result.removedDocumentIndex !== null) renderer?.removeDocument(result.removedDocumentIndex);
  const current = store.project;
  if (current) renderer?.setPageMaps(documentPageMaps(current.documents));
  host.thumbnails()?.clear();
  host.resetPageSizes();
  await host.enqueuePageSize(store.ui.page);
  host.fitPage();
  host.invalidate();
  host.renderAll();
  toast(t("app.pageDeleted", { page: target }), "info");
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
