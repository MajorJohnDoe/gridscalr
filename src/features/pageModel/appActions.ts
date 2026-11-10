import { t } from "../../i18n";
import { createProject } from "../../model/layers";
import { pageNumber } from "../../model/pages";
import type { PageId, PageSize, Project } from "../../model/types";
import type { PdfRenderer } from "../../pdf/pdfRenderer";
import type { PageThumbnailService } from "../../pdf/thumbnails";
import { store } from "../../state/store";
import { recordStructuralCheckpoint } from "../sessionRecovery";
import { confirmDialog } from "../../ui/dialogs";
import { toast } from "../../ui/toast";
import { removeDocumentAndPages } from "./pageList";

export interface PageActionHost {
  renderer(): PdfRenderer | null;
  thumbnails(): PageThumbnailService | null;
  resetPageSizes(): void;
  enqueuePageSize(page: number): Promise<PageSize | undefined>;
  fitPage(): void;
  invalidate(): void;
  renderAll(): void;
  closeSearch(): void;
  closeReference(): Promise<void>;
  afterStructuralChange(): void;
  installProject(project: Project): Promise<void>;
  /** Detach one renderer document while project document indices still match. */
  detachDocument(documentId: string): void;
}

/** Small app-level page actions kept out of App.ts wiring. */

export async function createEmptyProject(host: PageActionHost): Promise<void> {
  const project = createProject();
  await host.installProject(project);
  toast(t("app.blankProjectOpened"), "success");
}

export async function reorderPage(
  host: PageActionHost,
  pageId: PageId,
  targetIndex: number,
): Promise<boolean> {
  const project = store.project;
  if (!project) return false;
  await recordStructuralCheckpoint(
    t("sessionRecovery.checkpoint.reorderPage", { page: pageNumber(project, pageId) }),
  );
  if (!store.reorderPage(pageId, targetIndex)) return false;
  host.afterStructuralChange();
  return true;
}

export async function insertPage(
  host: PageActionHost,
  pageId: PageId,
  index: number,
): Promise<void> {
  const project = store.project;
  if (!project) return;
  await recordStructuralCheckpoint(
    t("sessionRecovery.checkpoint.insertPage", { page: pageNumber(project, pageId) }),
  );
  if (!store.insertPageRecord(pageId, index)) return;
  host.afterStructuralChange();
  void host.enqueuePageSize(store.ui.page);
}

export async function cleanupSupersededPages(
  host: PageActionHost,
  documentId: string,
): Promise<void> {
  const project = store.project;
  if (!project) return;
  const document = project.documents.find((entry) => entry.id === documentId);
  if (!document?.superseded) return;
  const count = project.pages.filter((page) => page.documentId === documentId).length;
  if (!count) return;
  const confirmed = await confirmDialog(
    t("replace.cleanupTitle"),
    t("replace.cleanupMessage", { name: document.name, count }),
    t("replace.cleanupAction"),
    { danger: true },
  );
  if (!confirmed) return;
  await recordStructuralCheckpoint(t("sessionRecovery.checkpoint.deletePage", { page: count }));
  host.detachDocument(documentId);
  removeDocumentAndPages(project, documentId);
  host.afterStructuralChange();
  toast(t("replace.cleanupDone", { count }), "info");
}
