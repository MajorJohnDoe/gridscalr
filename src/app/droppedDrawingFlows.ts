import type { PDFDocumentProxy } from "pdfjs-dist";
import { t } from "../i18n";
import { readFileBytes } from "../io/platform";
import { describeError } from "../io/platformError";
import type { PageSize } from "../model/types";
import { createProject } from "../model/layers";
import { documentPageOrder, pageNumber } from "../model/pages";
import { excludedSourcePages, includedLocalPages } from "../model/documents";
import {
  commitProjectImport,
  prepareProjectImport,
  type ImportDocumentOverride,
} from "../features/projectImport/model";
import { buildImportPreflight } from "../features/projectImport/preflight";
import { projectImportPreflightDialog } from "../features/projectImport/preflightUi";
import type { DroppedFile } from "../features/pageFileDrop";
import { logEvent } from "../features/diagnostics/log";
import { recordStructuralCheckpoint } from "../features/sessionRecovery";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import { store } from "../state/store";
import { messageDialog } from "../ui/dialogs";
import { toast } from "../ui/toast";
import { chooseImportPages, createImportedDocument, openDocument } from "./documentImport";
import { describePages } from "./documentFlows";
import type { ImportedRendererDocument } from "./rendererDocuments";

/**
 * A PDF/TIF dropped on the Pages panel. The selection, preflight, provenance
 * and commit are the project-import engine; only the source page loading is
 * specific to a single drawing. One `store.mutate` around the commit keeps the
 * whole import as one undo step.
 */
export interface DroppedDrawingHost {
  renderer(): PdfRenderer | null;
  rendererBusy(): boolean;
  recommendSourceStorage(
    path: string | null,
    name: string,
    kind: "pdf" | "tiff" | "template",
  ): Promise<boolean>;
  applySourceStorage(documentId: string): Promise<void>;
  addImportedDocuments(entries: readonly ImportedRendererDocument[]): void;
  enqueuePageSize(page: number): Promise<PageSize | undefined>;
  resetPageSizes(): void;
  fitPage(): void;
  invalidate(): void;
  renderAll(): void;
  closeSearch(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : describeError(error);
}

async function droppedBytes(file: DroppedFile): Promise<Uint8Array | null> {
  if (file.file) return new Uint8Array(await file.file.arrayBuffer());
  if (file.path) return readFileBytes(file.path);
  return null;
}

export async function importDroppedDrawing(
  host: DroppedDrawingHost,
  file: DroppedFile,
  insertIndex: number,
): Promise<void> {
  if (store.readOnly) return;
  const destination = store.project;
  if (!destination) return;

  let pdf: PDFDocumentProxy | null = null;
  try {
    const bytes = await droppedBytes(file);
    if (!bytes) return;
    const imported = await createImportedDocument(bytes, file.name, file.path);
    if (!imported) return;
    const { documentRef, pdfBytes, dpiWarning } = imported;
    const copyRecommended = await host.recommendSourceStorage(
      file.path,
      file.name,
      documentRef.kind,
    );
    pdf = await openDocument(pdfBytes, file.name);
    if (!pdf) return;
    documentRef.pageCount = pdf.numPages;

    const insertAt = Math.max(
      0,
      Math.min(store.project?.pages.length ?? destination.pages.length, Math.round(insertIndex)),
    );
    const destinationPages = store.project?.pages.length ?? destination.pages.length;
    const selected = await chooseImportPages(pdf, file.name, destinationPages, host.rendererBusy, {
      index: insertAt,
      destinationPages,
    });
    if (!selected) {
      await pdf.loadingTask.destroy();
      return;
    }

    documentRef.excludedPages = excludedSourcePages(pdf.numPages, selected);
    if (documentRef.kind === "tiff") documentRef.relativePath = null;

    const source = createProject(documentRef);
    source.name = documentRef.name.replace(/\.(pdf|tiff?)$/i, "");
    // A drawing has no measurement references, so matching units avoids a
    // misleading units warning in the preflight.
    source.settings.lengthUnit = destination.settings.lengthUnit;
    source.settings.areaUnit = destination.settings.areaUnit;
    const overrides = new Map<string, ImportDocumentOverride>([
      [
        documentRef.id,
        {
          pageCount: pdf.numPages,
          path: file.path,
          sha256: documentRef.sha256,
          sizeBytes: documentRef.sizeBytes,
        },
      ],
    ]);
    const prepared = prepareProjectImport(
      destination,
      source,
      source.pages.map((_page, index) => index + 1),
      overrides,
      insertAt,
    );
    const preflight = buildImportPreflight({
      prepared,
      sourceName: file.name,
      skipped: [],
      warnings: [],
    });
    if (
      !(await projectImportPreflightDialog({
        preflight,
        sources: [],
      }))
    ) {
      await pdf.loadingTask.destroy();
      return;
    }

    const renderer = host.renderer();
    const importedDocument = prepared.documents[0];
    if (!renderer || !importedDocument) {
      await pdf.loadingTask.destroy();
      toast(t("projectImport.failed"), "warning");
      return;
    }

    await recordStructuralCheckpoint(
      t("sessionRecovery.checkpoint.importPages", {
        count: prepared.pageMap.length,
        name: file.name,
      }),
    );
    try {
      store.mutate((project) => {
        commitProjectImport(project, prepared);
      }, "project");
    } catch (error) {
      await pdf.loadingTask.destroy();
      logEvent("error", `dropped drawing commit failed: ${errorMessage(error)}`);
      await messageDialog(t("projectImport.failed"), errorMessage(error), "warning");
      return;
    }

    host.addImportedDocuments([
      {
        id: importedDocument.id,
        proxy: pdf,
        pageMap: includedLocalPages(importedDocument),
      },
    ]);
    renderer.setPageOrder(documentPageOrder(store.project ?? destination));

    const firstPageId = prepared.pageMap[0]?.newPageId;
    const firstPage = firstPageId
      ? pageNumber(store.project ?? destination, firstPageId)
      : store.ui.page;
    store.setPage(firstPage);
    host.closeSearch();
    host.resetPageSizes();
    await host.enqueuePageSize(firstPage);
    host.fitPage();
    host.invalidate();
    host.renderAll();

    // The managed-copy prompt is a separate structural step and therefore a
    // later history boundary. The import itself stays one undo step.
    if (copyRecommended) await host.applySourceStorage(importedDocument.id);
    if (dpiWarning) toast(t("app.dpiAssumed"), "warning");
    toast(
      t("app.addedPages", {
        pages: describePages(selected.length, pdf.numPages),
        name: file.name,
      }),
      "success",
    );
  } catch (error) {
    if (pdf) await pdf.loadingTask.destroy().catch(() => undefined);
    logEvent("error", `dropped drawing import failed: ${errorMessage(error)}`);
    await messageDialog(t("projectImport.failed"), errorMessage(error), "warning");
  }
}
