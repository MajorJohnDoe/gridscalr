import {
  commitProjectImport,
  inspectProjectImport,
  prepareProjectImport,
  ProjectImportError,
} from "../features/projectImport/model";
import type { ImportWarning, PreparedProjectImport } from "../features/projectImport/model";
import type { ProjectImportGroupOption } from "../features/projectImport/ui";
import { projectImportDialog } from "../features/projectImport/ui";
import type { ImportedRendererDocument } from "./rendererDocuments";
import { t } from "../i18n";
import { pickProject } from "../io/platform";
import { describeError } from "../io/platformError";
import { parseProject } from "../io/projectFile";
import { sameFilePath } from "../io/writeGuard";
import { includedLocalPages, totalPageCount } from "../model/documents";
import type { PageSize, Project } from "../model/types";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import { store } from "../state/store";
import { messageDialog } from "../ui/dialogs";
import { toast } from "../ui/toast";
import { logEvent } from "../features/diagnostics/log";
import { recordStructuralCheckpoint } from "../features/sessionRecovery";
import type { SourceSelection } from "./projectImportSource";
import { ProjectImportSource } from "./projectImportSource";

export interface ProjectImportHost {
  renderer(): PdfRenderer | null;
  rendererBusy(): boolean;
  enqueuePageSize(page: number): Promise<PageSize | undefined>;
  resetPageSizes(): void;
  fitPage(): void;
  invalidate(): void;
  renderAll(): void;
  addImportedDocuments(entries: readonly ImportedRendererDocument[]): void;
  closeSearch(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : describeError(error);
}

export async function importProjectPagesFlow(host: ProjectImportHost): Promise<void> {
  const destination = store.project;
  if (!destination) return;

  const picked = await pickProject();
  if (!picked) return;
  if (picked.path && store.projectPath && sameFilePath(picked.path, store.projectPath)) {
    toast(t("projectImport.sameFile"), "warning");
    return;
  }

  let source: Project;
  try {
    source = parseProject(picked.text);
  } catch (error) {
    logEvent("error", `import project parse failed: ${errorMessage(error)}`);
    await messageDialog(t("app.couldNotOpenProject"), errorMessage(error), "warning");
    return;
  }

  const groups = inspectProjectImport(source);
  if (!groups.some((group) => group.pages.length)) {
    await messageDialog(t("projectImport.title"), t("projectImport.empty"), "warning");
    return;
  }

  const loader = new ProjectImportSource(source, picked.path, host.rendererBusy);
  let selection: number[] | null;
  try {
    const availability = await loader.checkAvailability();
    const dialogGroups: ProjectImportGroupOption[] = groups.map((group) => ({
      documentId: group.documentId,
      documentName: group.documentName,
      documentKind: group.documentKind,
      pageCount: group.pageCount,
      canLocate: group.documentKind === "pdf",
      pages: group.pages.map((page) => ({
        page: page.page,
        name: page.name,
        building: page.building,
        floor: page.floor,
        itemCount: page.itemCount,
        available: availability.get(group.documentId) ?? false,
      })),
    }));
    selection = await projectImportDialog({
      sourceName: source.name,
      fileName: picked.name,
      destinationPage: totalPageCount(destination.documents) + 1,
      groups: dialogGroups,
      requestThumbnail: (page) => loader.preview(page),
      locateDocument: (documentId) => loader.locate(documentId),
    });
  } catch (error) {
    logEvent("error", `import project picker failed: ${errorMessage(error)}`);
    loader.dispose(new Set());
    await messageDialog(t("projectImport.failed"), errorMessage(error), "warning");
    return;
  }

  if (!selection) {
    loader.dispose(new Set());
    return;
  }

  let resolved: SourceSelection;
  try {
    resolved = await loader.ensure(selection);
  } catch (error) {
    logEvent("error", `import project load failed: ${errorMessage(error)}`);
    loader.dispose(new Set());
    await messageDialog(t("projectImport.failed"), errorMessage(error), "warning");
    return;
  }

  if (!resolved.pages.length) {
    loader.dispose(new Set());
    await showWarnings(resolved);
    return;
  }

  let prepared: PreparedProjectImport;
  try {
    prepared = prepareProjectImport(destination, source, resolved.pages, resolved.overrides);
  } catch (error) {
    loader.dispose(new Set());
    const message =
      error instanceof ProjectImportError ? t("projectImport.failed") : errorMessage(error);
    await messageDialog(t("projectImport.failed"), message, "warning");
    return;
  }

  const renderer = host.renderer();
  if (!renderer) {
    loader.dispose(new Set());
    toast(t("projectImport.failed"), "warning");
    return;
  }

  const proxies = new Map(
    resolved.documents.map((document) => [document.documentId, document.proxy]),
  );
  const sourceByNewDocument = new Map(
    prepared.pageMap.map((entry) => [entry.newDocumentId, entry.sourceDocumentId]),
  );
  const entries: ImportedRendererDocument[] = [];
  for (const document of prepared.documents) {
    const sourceDocumentId = sourceByNewDocument.get(document.id);
    const proxy = sourceDocumentId ? proxies.get(sourceDocumentId) : undefined;
    if (!proxy) {
      loader.dispose(new Set());
      await messageDialog(t("projectImport.failed"), t("projectImport.failed"), "warning");
      return;
    }
    entries.push({
      id: document.id,
      proxy,
      pageMap: includedLocalPages(document),
    });
  }

  let importWarnings: ImportWarning[] = [];
  await recordStructuralCheckpoint(
    t("sessionRecovery.checkpoint.importPages", {
      count: prepared.pageMap.length,
      name: source.name,
    }),
  );
  try {
    store.mutate((project) => {
      importWarnings = commitProjectImport(project, prepared).warnings;
    }, "project");
    host.addImportedDocuments(entries);
  } catch (error) {
    loader.dispose(new Set(entries.map((entry) => entry.proxy)));
    logEvent("error", `import project commit failed: ${errorMessage(error)}`);
    await messageDialog(t("projectImport.failed"), errorMessage(error), "warning");
    return;
  }

  loader.dispose(new Set(entries.map((entry) => entry.proxy)));
  const firstPage = prepared.pageMap[0]?.newPage ?? store.ui.page;
  store.setPage(firstPage);
  host.closeSearch();
  host.resetPageSizes();
  await host.enqueuePageSize(firstPage);
  host.fitPage();
  host.invalidate();
  host.renderAll();
  toast(
    t("projectImport.success", {
      count: prepared.pageMap.length,
      name: source.name,
    }),
    "success",
  );
  await showWarnings(resolved, importWarnings);
}

async function showWarnings(
  selection: SourceSelection,
  importWarnings: readonly ImportWarning[] = [],
): Promise<void> {
  const skipped = new Map<string, number[]>();
  const other: string[] = [];
  for (const warning of selection.warnings) {
    if (warning.code === "skippedPage") {
      const pages = skipped.get(warning.documentName) ?? [];
      pages.push(warning.page);
      skipped.set(warning.documentName, pages);
    } else if (warning.code === "checksum") {
      other.push(t("projectImport.warning.checksum", { name: warning.documentName }));
    } else if (warning.code === "pageCount") {
      other.push(
        t("projectImport.warning.pageCount", {
          name: warning.documentName,
          expected: warning.expected,
          actual: warning.actual,
        }),
      );
    }
  }
  for (const [name, pages] of skipped) {
    other.push(
      t("projectImport.warning.skippedPages", {
        name: name || t("projectImport.unknownDocument"),
        pages: [...new Set(pages)].sort((a, b) => a - b).join(", "),
      }),
    );
  }
  other.push(...importWarnings.map(warningMessage));
  if (!other.length) return;
  await messageDialog(t("projectImport.warningsTitle"), other.join("\n\n"), "warning");
}

function warningMessage(warning: ImportWarning): string {
  switch (warning.code) {
    case "units":
      return t("projectImport.warning.units", {
        source: `${warning.sourceLengthUnit}/${warning.sourceAreaUnit}`,
        destination: `${warning.destinationLengthUnit}/${warning.destinationAreaUnit}`,
      });
    case "missingCategory":
      return t("projectImport.warning.missingCategory", { count: warning.count });
    case "missingCountType":
      return t("projectImport.warning.missingCountType", { count: warning.count });
    case "missingLineType":
      return t("projectImport.warning.missingLineType", { count: warning.count });
    case "missingImage":
      return t("projectImport.warning.missingImage", { count: warning.count });
    case "ocrDropped":
      return t("projectImport.warning.ocrDropped", { count: warning.count });
  }
}
