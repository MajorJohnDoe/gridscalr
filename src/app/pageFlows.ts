import type { PDFDocumentProxy } from "pdfjs-dist";
import { pageDisplayName, pageNumber, pageRecordById } from "../model/pages";
import { findItem } from "../model/layers";
import type { MarkupItem, PageId, PageSize } from "../model/types";
import { store } from "../state/store";
import { recordStructuralCheckpoint } from "../features/sessionRecovery";
import { pageWindowState } from "../features/pageWindow";
import { openDocument } from "./documentImport";
import { sheetBytes } from "./sheetFlows";
import { confirmDialog, targetIdentity } from "../ui/dialogs";
import { bulkDuplicatePageDialog, duplicatePageDialog } from "../ui/duplicatePageDialog";
import { toast } from "../ui/toast";
import { t } from "../i18n";

/**
 * Loads renderer proxies for template documents a page action just created. A
 * cloned sheet owns its own document record, so the renderer needs that
 * document before the store-derived page order can point at it.
 */
export async function registerCreatedPageDocuments(
  addDocument: (documentId: string, proxy: PDFDocumentProxy, pageMap: number[]) => void,
  knownDocuments: ReadonlySet<string>,
): Promise<void> {
  const project = store.project;
  if (!project) return;
  for (const document of project.documents) {
    if (knownDocuments.has(document.id) || document.kind !== "template" || !document.template) {
      continue;
    }
    const bytes = await sheetBytes(document.template);
    const proxy = await openDocument(bytes, document.name);
    if (proxy) addDocument(document.id, proxy, [1]);
  }
}

export interface PageFlowHost {
  /** Registers a document the page operation created; the store derives its order. */
  addDocumentToRenderer(documentId: string, proxy: PDFDocumentProxy, pageMap: number[]): void;
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
  if (store.readOnly) return;
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
  const knownDocuments = new Set(project.documents.map((entry) => entry.id));
  const result = store.duplicatePage(pageId, options);
  if (!result) {
    toast(t("app.pageDuplicateFailed"), "warning");
    return;
  }
  // A duplicated template sheet owns a cloned document. Load its proxy so the
  // renderer document list stays aligned with project.documents.
  await registerCreatedPageDocuments(
    (documentId, proxy, pageMap) => host.addDocumentToRenderer(documentId, proxy, pageMap),
    knownDocuments,
  );
  // The copy is appended, so it can be outside the mounted Pages window. Ask
  // the panel to focus the new card when that tab is the one on screen; the
  // extra view notification repaints the panel so the request is consumed.
  if (store.ui.leftTab === "pages") {
    pageWindowState.requestFocus(result.pageId);
    store.emit("project");
  }
  await host.enqueuePageSize(result.pageNumber);
  host.fitPage();
  host.invalidate();
  host.renderAll();
  toast(t("app.pageDuplicated", { from: sourcePage, to: result.pageNumber }), "success");
}

export async function deletePageFlow(host: PageFlowHost, pageId: PageId): Promise<void> {
  if (store.readOnly) return;
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
    {
      danger: true,
      target: {
        kind: "page",
        id: pageId,
        name: targetLabel,
        resolve: () => (store.project?.pages.some((entry) => entry.id === pageId) ? pageId : null),
      },
    },
  );
  if (!confirmed) return;
  await recordStructuralCheckpoint(t("sessionRecovery.checkpoint.deletePage", { page: target }));
  const result = store.deletePage(pageId);
  if (!result) {
    toast(t("app.pageDeleteFailed"), "warning");
    return;
  }
  await host.enqueuePageSize(store.ui.page);
  host.fitPage();
  host.invalidate();
  host.renderAll();
  toast(t("app.pageDeleted", { page: result.pageNumber }), "info");
  if (result.clearedSpaces > 0) {
    toast(t("spaces.pageDeleteCleared", { count: result.clearedSpaces }), "info");
  }
  if (result.clearedScheduleFilters > 0) {
    toast(t("schedules.pageDeleteCleared", { count: result.clearedScheduleFilters }), "info");
  }
}

/**
 * Duplicates the Pages-panel selection as one undo step. Every existing page
 * keeps its ID and state; each copy appends with a fresh ID. A cloned template
 * document is registered before the renderer derives the new order.
 */
export async function duplicatePagesFlow(
  host: PageFlowHost,
  pageIds: readonly PageId[],
): Promise<void> {
  if (store.readOnly) return;
  const project = store.project;
  if (!project) return;
  const selected = new Set(pageIds);
  const pages = project.pages.filter((page) => selected.has(page.id));
  if (!pages.length) return;
  if (pages.length === 1) {
    await duplicatePageFlow(host, pages[0].id);
    return;
  }
  const total = project.pages.length;
  const hasScale = pages.some((page) => Boolean(page.state?.calibration));
  const options = await bulkDuplicatePageDialog({
    count: pages.length,
    firstNewPage: total + 1,
    lastNewPage: total + pages.length,
    hasScale,
  });
  if (!options) return;

  const names = new Map<PageId, string>();
  for (const page of pages) {
    const name = pageDisplayName(project, page.id);
    names.set(
      page.id,
      name
        ? t("app.pageCopyName", { name })
        : t("app.pageCopyDefault", { page: pageNumber(project, page.id) }),
    );
  }
  await recordStructuralCheckpoint(
    t("sessionRecovery.checkpoint.duplicatePages", { count: pages.length }),
  );
  const knownDocuments = new Set(project.documents.map((entry) => entry.id));
  const result = store.duplicatePages(
    pages.map((page) => page.id),
    { ...options, names },
  );
  if (!result) {
    toast(t("app.pageDuplicateFailed"), "warning");
    return;
  }
  await registerCreatedPageDocuments(
    (documentId, proxy, pageMap) => host.addDocumentToRenderer(documentId, proxy, pageMap),
    knownDocuments,
  );
  // The current page is the last copy; the window follows it and the panel
  // focuses that card so the copied block is visible and reachable.
  const lastCopy = result.pageIds[result.pageIds.length - 1];
  if (lastCopy && store.ui.leftTab === "pages") {
    pageWindowState.requestFocus(lastCopy);
    store.emit("project");
  }
  await host.enqueuePageSize(result.lastPageNumber);
  host.fitPage();
  host.invalidate();
  host.renderAll();
  toast(t("app.pagesDuplicated", { count: result.pageIds.length }), "success");
}

/**
 * Deletes the Pages-panel selection with one confirmation, one recovery
 * checkpoint and one history clear. It is never undoable.
 */
export async function deletePagesFlow(
  host: PageFlowHost,
  pageIds: readonly PageId[],
): Promise<void> {
  if (store.readOnly) return;
  const project = store.project;
  if (!project) return;
  const selected = new Set(pageIds);
  const pages = project.pages.filter((page) => selected.has(page.id));
  if (!pages.length) return;
  if (pages.length === 1) {
    await deletePageFlow(host, pages[0].id);
    return;
  }
  const ids = pages.map((page) => page.id);
  const identity = targetIdentity(ids);
  const confirmed = await confirmDialog(
    t("app.deletePagesTitle"),
    t("app.deletePagesMessage", {
      count: ids.length,
    }),
    t("app.deletePagesConfirm"),
    {
      danger: true,
      target: {
        kind: "page",
        id: identity,
        name: t("app.deletePagesTarget", { count: ids.length }),
        resolve: () => {
          const live = store.project?.pages.filter((page) => selected.has(page.id)) ?? [];
          return live.length === ids.length ? targetIdentity(ids) : null;
        },
      },
    },
  );
  if (!confirmed) return;
  await recordStructuralCheckpoint(
    t("sessionRecovery.checkpoint.deletePages", { count: ids.length }),
  );
  const result = store.deletePages(ids);
  if (!result) {
    toast(t("app.pageDeleteFailed"), "warning");
    return;
  }
  await host.enqueuePageSize(store.ui.page);
  host.fitPage();
  host.invalidate();
  host.renderAll();
  toast(t("app.pagesDeleted", { count: result.pageIds.length }), "info");
  if (result.clearedSpaces > 0) {
    toast(t("spaces.pageDeleteCleared", { count: result.clearedSpaces }), "info");
  }
  if (result.clearedScheduleFilters > 0) {
    toast(t("schedules.pageDeleteCleared", { count: result.clearedScheduleFilters }), "info");
  }
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
