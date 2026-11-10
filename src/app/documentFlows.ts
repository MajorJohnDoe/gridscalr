import type { PDFDocumentProxy } from "pdfjs-dist";
import { base64ToBytes } from "../io/base64";
import { addRecent, basename, isTauri, pathExists, pickPdf, readFileBytes } from "../io/platform";
import { describeError } from "../io/platformError";
import { parseProjectWithReport, resolveRelativePath } from "../io/projectFile";
import { loadGlobalStampPresets } from "../io/stampDefaults";
import { createProject } from "../model/layers";
import { excludedSourcePages, totalPageCount } from "../model/documents";
import type { DocumentRef, PageSize, Project } from "../model/types";
import { currentLocale, t } from "../i18n";
import { store } from "../state/store";
import { logEvent } from "../features/diagnostics/log";
import { recordStructuralCheckpoint } from "../features/sessionRecovery";
import { messageDialog } from "../ui/dialogs";
import { toast } from "../ui/toast";
import {
  chooseImportPages,
  confirmChecksumMismatch,
  createImportedDocument,
  hashBytes,
  openDocument,
} from "./documentImport";
import { sheetBytes } from "./sheetFlows";

export interface DocumentFlowHost {
  closeSearch(): void;
  confirmReplace(message: string): Promise<boolean>;
  rendererBusy(): boolean;
  installDocuments(
    documents: PDFDocumentProxy[],
    project: Project,
    path: string | null,
    dirty: boolean,
  ): Promise<void>;
  addDocumentToRenderer(document: PDFDocumentProxy, pages: number[]): void;
  enqueuePageSize(page: number): Promise<PageSize | undefined>;
  fitPage(): void;
  invalidate(): void;
  /** Returns true when the user accepted a managed-copy recommendation. */
  recommendSourceStorage(
    path: string | null,
    name: string,
    kind: DocumentRef["kind"],
  ): Promise<boolean>;
  /** Applies a recommended managed copy once the document exists in the store. */
  applySourceStorage(documentId: string): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : describeError(error);
}

export function describePages(count: number, total: number): string {
  if (count === total) {
    return total === 1 ? t("app.pageCountOne") : t("app.pageCountMany", { count: total });
  }
  return t("app.pagesOfTotal", { count, total });
}

export async function loadNewPdf(
  host: DocumentFlowHost,
  bytes: Uint8Array,
  name: string,
  path: string | null,
): Promise<void> {
  const imported = await createImportedDocument(bytes, name, path);
  if (!imported) return;
  const { documentRef, pdfBytes, dpiWarning } = imported;
  const copyRecommended = await host.recommendSourceStorage(path, name, documentRef.kind);

  const project = store.project;

  if (!project) {
    const pdf = await openDocument(pdfBytes, name);
    if (!pdf) return;
    const pages = await chooseImportPages(pdf, name, null, host.rendererBusy);
    if (!pages) {
      await pdf.loadingTask.destroy();
      return;
    }
    documentRef.pageCount = pdf.numPages;
    documentRef.excludedPages = excludedSourcePages(pdf.numPages, pages);
    const created = createProject(documentRef);
    created.settings.stampPresets = loadGlobalStampPresets();
    await host.installDocuments([pdf], created, null, false);
    if (copyRecommended) await host.applySourceStorage(documentRef.id);
    if (path) {
      addRecent({ kind: "pdf", path, name, at: new Date().toISOString() });
    }
    if (dpiWarning) toast(t("app.dpiAssumed"), "warning");
    toast(
      pages.length === pdf.numPages
        ? t("app.openedFile", { name })
        : t("app.openedPages", {
            pages: describePages(pages.length, pdf.numPages),
            name,
          }),
      "success",
    );
    return;
  }

  const pdf = await openDocument(pdfBytes, name);
  if (!pdf) return;
  const lastPage = totalPageCount(project.documents);
  const startPage = lastPage + 1;
  const pages = await chooseImportPages(pdf, name, lastPage, host.rendererBusy);
  if (!pages) {
    await pdf.loadingTask.destroy();
    return;
  }

  documentRef.pageCount = pdf.numPages;
  documentRef.excludedPages = excludedSourcePages(pdf.numPages, pages);
  if (documentRef.kind === "tiff") documentRef.relativePath = null;
  await recordStructuralCheckpoint(t("sessionRecovery.checkpoint.addPages", { name }));
  store.addDocument(documentRef);
  host.addDocumentToRenderer(pdf, pages);
  store.setPage(startPage);
  await host.enqueuePageSize(startPage);
  host.fitPage();
  host.invalidate();
  if (copyRecommended) await host.applySourceStorage(documentRef.id);
  if (dpiWarning) toast(t("app.dpiAssumed"), "warning");
  toast(
    t("app.addedPages", {
      pages: describePages(pages.length, pdf.numPages),
      name,
    }),
    "success",
  );
}

export async function loadProjectText(
  host: DocumentFlowHost,
  text: string,
  projectPath: string | null,
): Promise<boolean> {
  if (!(await host.confirmReplace(t("app.replaceProject")))) return false;
  let project: Project;
  let migrationWarnings: number;
  try {
    const parsed = parseProjectWithReport(text);
    project = parsed.project;
    migrationWarnings = parsed.report.warnings.length;
  } catch (error) {
    logEvent("error", `open project failed: ${errorMessage(error)}`);
    await messageDialog(t("app.couldNotOpenProject"), errorMessage(error), "warning");
    return false;
  }
  const loaded = await loadProjectData(host, project, projectPath, false);
  if (loaded && migrationWarnings > 0) {
    toast(t("projectFile.migrationWarnings", { count: migrationWarnings }), "warning");
  }
  return loaded;
}

export async function loadProjectData(
  host: DocumentFlowHost,
  project: Project,
  projectPath: string | null,
  dirty: boolean,
): Promise<boolean> {
  host.closeSearch();
  const loaded: PDFDocumentProxy[] = [];
  const loadedById = new Map<string, PDFDocumentProxy>();
  const loadedByKey = new Map<string, PDFDocumentProxy>();
  const cacheKeyFor = (documentRef: DocumentRef): string | null =>
    documentRef.kind === "tiff"
      ? `tiff:${documentRef.sha256}:${documentRef.pageCount}:${documentRef.sizeBytes}`
      : documentRef.path || documentRef.sha256
        ? `pdf:${documentRef.path ?? ""}:${documentRef.sha256}`
        : null;

  for (const documentRef of project.documents) {
    if (documentRef.kind === "template") {
      if (!documentRef.template) return false;
      const cacheKey = `template:${documentRef.template.id}:${documentRef.template.version}:${documentRef.template.paper}:${currentLocale()}`;
      const cached = loadedByKey.get(cacheKey);
      if (cached) {
        documentRef.pageCount = 1;
        loaded.push(cached);
        loadedById.set(documentRef.id, cached);
        continue;
      }
      const bytes = await sheetBytes(documentRef.template);
      const document = await openDocument(bytes, documentRef.name);
      if (!document) return false;
      documentRef.pageCount = 1;
      loaded.push(document);
      loadedById.set(documentRef.id, document);
      loadedByKey.set(cacheKey, document);
      continue;
    }

    const copiedSource = documentRef.copiedFrom
      ? loadedById.get(documentRef.copiedFrom.documentId)
      : undefined;
    if (copiedSource) {
      documentRef.pageCount = copiedSource.numPages;
      loaded.push(copiedSource);
      loadedById.set(documentRef.id, copiedSource);
      continue;
    }
    const cacheKey = cacheKeyFor(documentRef);
    const cached = cacheKey ? loadedByKey.get(cacheKey) : undefined;
    if (cached) {
      documentRef.pageCount = cached.numPages;
      loaded.push(cached);
      loadedById.set(documentRef.id, cached);
      continue;
    }

    let bytes: Uint8Array | null = null;
    let pdfPath = documentRef.path;

    if (documentRef.kind === "tiff" && documentRef.embeddedPdf) {
      bytes = base64ToBytes(documentRef.embeddedPdf);
      pdfPath = null;
    } else if (isTauri) {
      const candidates: string[] = [];
      if (documentRef.path) candidates.push(documentRef.path);
      if (projectPath && documentRef.relativePath) {
        const resolved = resolveRelativePath(projectPath, documentRef.relativePath);
        if (resolved) candidates.push(resolved);
      }
      for (const candidate of candidates) {
        if (!(await pathExists(candidate))) continue;
        try {
          bytes = await readFileBytes(candidate);
          pdfPath = candidate;
          break;
        } catch {
          // Try the next candidate.
        }
      }
    }

    if (!bytes) {
      const picked = await pickPdf();
      if (!picked) return false;
      bytes = picked.bytes;
      pdfPath = picked.path;
      documentRef.name = picked.name;
      documentRef.kind = "pdf";
    }

    // A TIF document carries the hash of the original .tif while `bytes` is
    // the derived PDF, so only referenced PDFs can be checksum verified here.
    const hash = documentRef.kind === "pdf" ? await hashBytes(bytes) : "";
    if (!(await confirmChecksumMismatch(documentRef, hash))) return false;

    const document = await openDocument(bytes, documentRef.name);
    if (!document) return false;

    if (documentRef.pageCount !== document.numPages) {
      toast(
        t("app.pageCountChanged", {
          name: documentRef.name,
          count: document.numPages,
          expected: documentRef.pageCount,
        }),
        "warning",
      );
      documentRef.pageCount = document.numPages;
    }

    if (documentRef.kind === "pdf") {
      documentRef.path = isTauri ? pdfPath : null;
      // A managed copy keeps its relative link even when it was resolved
      // through that link, so moving the project folder keeps working.
      if (documentRef.storage !== "managed") documentRef.relativePath = null;
      documentRef.sizeBytes = bytes.byteLength;
      if (hash) documentRef.sha256 = hash;
    }
    loaded.push(document);
    loadedById.set(documentRef.id, document);
    if (cacheKey) loadedByKey.set(cacheKey, document);
  }

  await host.installDocuments(loaded, project, projectPath, dirty);
  if (projectPath) {
    addRecent({
      kind: "project",
      path: projectPath,
      name: basename(projectPath),
      at: new Date().toISOString(),
    });
  }
  toast(
    dirty ? t("app.autosavedRestored") : t("app.loadedProject", { name: project.name }),
    "success",
  );
  return true;
}
