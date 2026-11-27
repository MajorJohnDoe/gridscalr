import { t } from "../../i18n";
import { describeError } from "../../io/platformError";
import { managedCopyProtectedPaths } from "../../io/projectFile";
import { store } from "../../state/store";
import { confirmDialog, messageDialog } from "../../ui/dialogs";
import { copySourceToProject, sourceFileHash } from "./files";
import { applyManagedCopy, consolidateCandidates, type ManagedCopyInfo } from "./managedCopy";
import { isManagedDocument } from "./mode";
import type { SourceStorageHost } from "./ports";
import { checksumMatches } from "./relink";
import { findDocument, resolveDocumentPath } from "./documents";

async function requireProjectPath(host: SourceStorageHost): Promise<string | null> {
  if (store.projectPath) return store.projectPath;
  const saved = await host.ensureSaved();
  if (!saved) {
    await messageDialog(
      t("sourceStorage.saveFirstTitle"),
      t("sourceStorage.saveFirstMessage"),
      "info",
    );
    return null;
  }
  return store.projectPath;
}

/** Raw source fields a drop import has before the document exists in the store. */
export interface ImportCopyRequest {
  path: string;
  name: string;
  sha256: string;
}

/**
 * Copies a dropped drawing into the project before its import commits. The
 * caller applies the returned record inside the same store mutation as the
 * imported pages, so the copy and the pages share one undo step. It performs
 * no checkpoint and no project write itself.
 */
export async function prepareImportCopy(
  host: SourceStorageHost,
  request: ImportCopyRequest,
): Promise<ManagedCopyInfo | null> {
  const project = store.project;
  if (!project || !host.desktop) return null;
  const projectPath = await requireProjectPath(host);
  if (!projectPath) return null;
  try {
    const info = await sourceFileHash(request.path);
    if (!info) {
      await messageDialog(
        t("sourceStorage.copyFailedTitle"),
        t("sourceStorage.sourceMissing", { name: request.name }),
        "warning",
      );
      return null;
    }
    if (request.sha256 && !checksumMatches(request.sha256, info.sha256)) {
      await messageDialog(
        t("sourceStorage.copyFailedTitle"),
        t("sourceStorage.sourceChangedBeforeCopy", { name: request.name }),
        "warning",
      );
      return null;
    }
    const copy = await copySourceToProject({
      sourcePath: request.path,
      projectPath,
      displayName: request.name,
      protectedPaths: managedCopyProtectedPaths(project, projectPath),
    });
    if (!checksumMatches(info.sha256, copy.sha256)) {
      throw new Error(t("sourceStorage.copyVerifyFailed", { name: request.name }));
    }
    return copy;
  } catch (error) {
    await messageDialog(t("sourceStorage.copyFailedTitle"), describeError(error), "warning");
    return null;
  }
}

/** Explicit **Copy drawing into project** for one document. */
export async function copyDocumentIntoProject(
  host: SourceStorageHost,
  documentId: string,
): Promise<boolean> {
  const project = store.project;
  const document = project ? findDocument(project, documentId) : undefined;
  if (!project || !document) return false;
  if (document.kind !== "pdf") {
    host.notify(t("sourceStorage.pdfOnly"), "warning");
    return false;
  }
  if (isManagedDocument(document)) return true;
  if (!host.desktop) {
    host.notify(t("sourceStorage.desktopOnly"), "warning");
    return false;
  }
  const hadProjectPath = Boolean(store.projectPath);
  const projectPath = await requireProjectPath(host);
  if (!projectPath) return false;
  const sourcePath = resolveDocumentPath(document, projectPath);
  if (!sourcePath) {
    await messageDialog(
      t("sourceStorage.copyFailedTitle"),
      t("sourceStorage.sourceMissing", { name: document.name }),
      "warning",
    );
    return false;
  }
  try {
    const info = await sourceFileHash(sourcePath);
    if (!info) {
      await messageDialog(
        t("sourceStorage.copyFailedTitle"),
        t("sourceStorage.sourceMissing", { name: document.name }),
        "warning",
      );
      return false;
    }
    if (document.sha256 && !checksumMatches(document.sha256, info.sha256)) {
      await messageDialog(
        t("sourceStorage.copyFailedTitle"),
        t("sourceStorage.sourceChangedBeforeCopy", { name: document.name }),
        "warning",
      );
      return false;
    }
    const copy = await copySourceToProject({
      sourcePath,
      projectPath,
      displayName: document.name,
      protectedPaths: managedCopyProtectedPaths(project, projectPath),
    });
    if (!checksumMatches(info.sha256, copy.sha256)) {
      throw new Error(t("sourceStorage.copyVerifyFailed", { name: document.name }));
    }
    await host.checkpoint(t("sourceStorage.checkpoint.copy", { name: document.name }));
    store.applySourceStorageChange((documents) => {
      const target = documents.find((entry) => entry.id === documentId);
      if (target) applyManagedCopy(target, copy, { path: sourcePath, sha256: info.sha256 });
    });
    host.afterChange();
    if (!hadProjectPath) await host.ensureSaved();
    host.notify(t("sourceStorage.copied", { name: document.name }), "success");
    return true;
  } catch (error) {
    await messageDialog(t("sourceStorage.copyFailedTitle"), describeError(error), "warning");
    return false;
  }
}

/** Copies every referenced PDF into the project in one explicit action. */
export async function consolidateDrawings(host: SourceStorageHost): Promise<void> {
  const project = store.project;
  if (!project) return;
  if (!host.desktop) {
    host.notify(t("sourceStorage.desktopOnly"), "warning");
    return;
  }
  const hadProjectPath = Boolean(store.projectPath);
  const projectPath = await requireProjectPath(host);
  if (!projectPath) return;
  const candidates = consolidateCandidates(project, (document) =>
    resolveDocumentPath(document, projectPath),
  );
  if (!candidates.length) {
    host.notify(t("sourceStorage.consolidateNothing"), "info");
    return;
  }
  const confirmed = await confirmDialog(
    t("sourceStorage.consolidateTitle"),
    t("sourceStorage.consolidateMessage", { count: candidates.length }),
    t("sourceStorage.consolidateAction"),
  );
  if (!confirmed) return;

  try {
    // Verify every source before writing a single copy.
    const changes: {
      documentIds: string[];
      copy: ManagedCopyInfo;
      originalPath: string;
      originalSha256: string;
    }[] = [];
    for (const candidate of candidates) {
      const info = await sourceFileHash(candidate.path);
      if (!info) throw new Error(t("sourceStorage.sourceMissing", { name: candidate.name }));
      if (candidate.sha256 && !checksumMatches(candidate.sha256, info.sha256)) {
        throw new Error(t("sourceStorage.sourceChangedBeforeCopy", { name: candidate.name }));
      }
      changes.push({
        documentIds: candidate.documentIds,
        copy: { destinationPath: "", relativePath: "", sha256: "", sizeBytes: 0 },
        originalPath: candidate.path,
        originalSha256: info.sha256,
      });
    }
    await host.checkpoint(t("sourceStorage.checkpoint.consolidate"));
    for (const change of changes) {
      const candidate = candidates.find((entry) => entry.documentId === change.documentIds[0])!;
      const copy = await copySourceToProject({
        sourcePath: candidate.path,
        projectPath,
        displayName: candidate.name,
        protectedPaths: managedCopyProtectedPaths(project, projectPath),
      });
      if (!checksumMatches(change.originalSha256, copy.sha256)) {
        throw new Error(t("sourceStorage.copyVerifyFailed", { name: candidate.name }));
      }
      change.copy = copy;
    }
    store.applySourceStorageChange((documents) => {
      for (const change of changes) {
        for (const documentId of change.documentIds) {
          const target = documents.find((entry) => entry.id === documentId);
          if (!target) continue;
          applyManagedCopy(target, change.copy, {
            path: change.originalPath,
            sha256: change.originalSha256,
          });
        }
      }
    });
    host.afterChange();
    if (!hadProjectPath) await host.ensureSaved();
    await messageDialog(
      t("sourceStorage.consolidateTitle"),
      t("sourceStorage.consolidateDone", { count: changes.length }),
      "info",
    );
  } catch (error) {
    await messageDialog(t("sourceStorage.consolidateFailed"), describeError(error), "warning");
  }
}
