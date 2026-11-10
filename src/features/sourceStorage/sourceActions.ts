import { t } from "../../i18n";
import { pickPdf, readFileBytes, sha256Hex } from "../../io/platform";
import { describeError } from "../../io/platformError";
import { relativeDocumentPath } from "../../io/projectFile";
import { sourceFileHash } from "./files";
import { store } from "../../state/store";
import { confirmDialog, messageDialog } from "../../ui/dialogs";
import { cloneDocument, findDocument, resolveDocumentPath, restoreDocument } from "./documents";
import { detachManagedCopy } from "./managedCopy";
import { isManagedDocument } from "./mode";
import type { SourceStorageHost } from "./ports";
import { checksumMatches, findRelinkSource, pageCountChanged } from "./relink";

export async function detachDocumentFromSource(
  host: SourceStorageHost,
  documentId: string,
): Promise<void> {
  const project = store.project;
  const document = project ? findDocument(project, documentId) : undefined;
  if (!project || !document || !isManagedDocument(document)) return;
  const confirmed = await confirmDialog(
    t("sourceStorage.detachTitle"),
    t("sourceStorage.detachMessage", { name: document.name }),
    t("sourceStorage.detachAction"),
  );
  if (!confirmed) return;
  await host.checkpoint(t("sourceStorage.checkpoint.detach", { name: document.name }));
  store.applySourceStorageChange((documents) => {
    const target = documents.find((entry) => entry.id === documentId);
    if (target) detachManagedCopy(target);
  });
  host.afterChange();
  host.notify(t("sourceStorage.detached", { name: document.name }), "success");
}

/** Accepts the current on-disk checksum without re-rendering the drawing. */
export async function acceptCurrentSource(
  host: SourceStorageHost,
  documentId: string,
): Promise<void> {
  const project = store.project;
  const document = project ? findDocument(project, documentId) : undefined;
  if (!project || !document) return;
  const path = resolveDocumentPath(document, store.projectPath);
  if (!path) return;
  const info = await sourceFileHash(path);
  if (!info) {
    host.notify(t("sourceStorage.sourceMissing", { name: document.name }), "warning");
    return;
  }
  const confirmed = await confirmDialog(
    t("sourceStorage.useCurrentTitle"),
    t("sourceStorage.useCurrentMessage", { name: document.name }),
    t("sourceStorage.useCurrentAction"),
  );
  if (!confirmed) return;
  await host.checkpoint(t("sourceStorage.checkpoint.accept", { name: document.name }));
  store.applySourceStorageChange((documents) => {
    const target = documents.find((entry) => entry.id === documentId);
    if (!target) return;
    target.sha256 = info.sha256;
    target.sizeBytes = info.sizeBytes;
  });
  host.afterChange();
  host.notify(t("sourceStorage.useCurrentDone", { name: document.name }), "success");
}

/** Re-reads the current source and routes a page-count change to Replace source. */
export async function reloadSource(host: SourceStorageHost, documentId: string): Promise<void> {
  const project = store.project;
  const document = project ? findDocument(project, documentId) : undefined;
  if (!project || !document) return;
  const path = resolveDocumentPath(document, store.projectPath);
  if (!path) {
    await relinkSource(host, documentId);
    return;
  }
  try {
    const info = await sourceFileHash(path);
    if (!info) {
      await relinkSource(host, documentId);
      return;
    }
    const bytes = await readFileBytes(path);
    const pageCount = await host.probePdf(bytes);
    if (pageCount === null) throw new Error(t("sourceStorage.reloadFailed"));
    if (pageCountChanged(document.pageCount, pageCount)) {
      const replace = await confirmDialog(
        t("sourceStorage.pageCountChangedTitle"),
        t("sourceStorage.pageCountChangedMessage", {
          name: document.name,
          expected: document.pageCount,
          actual: pageCount,
        }),
        t("sourceStorage.replaceSourceAction"),
      );
      if (replace) host.replaceSource(documentId);
      return;
    }
    const hash = await sha256Hex(bytes);
    const before = cloneDocument(document);
    await host.checkpoint(t("sourceStorage.checkpoint.reload", { name: document.name }));
    store.applySourceStorageChange((documents) => {
      const target = documents.find((entry) => entry.id === documentId);
      if (!target) return;
      target.path = path;
      target.sha256 = hash;
      target.sizeBytes = bytes.byteLength;
    });
    if (!(await host.reloadDocument(documentId))) {
      store.applySourceStorageChange((documents) => {
        const target = documents.find((entry) => entry.id === documentId);
        if (target) restoreDocument(target, before);
      });
      throw new Error(t("sourceStorage.reloadFailed"));
    }
    host.afterChange();
    host.notify(t("sourceStorage.reloaded", { name: document.name }), "success");
  } catch (error) {
    await messageDialog(t("sourceStorage.reloadFailedTitle"), describeError(error), "warning");
  }
}

/** Relinks a reference PDF after a move, verifying page count and checksum. */
export async function relinkSource(host: SourceStorageHost, documentId: string): Promise<void> {
  const project = store.project;
  const document = project ? findDocument(project, documentId) : undefined;
  if (!project || !document) return;
  if (!host.desktop) {
    host.notify(t("sourceStorage.desktopOnly"), "warning");
    return;
  }
  let pickedPath: string | null = null;
  let bytes: Uint8Array | null = null;
  const currentPath = resolveDocumentPath(document, store.projectPath);
  if (!currentPath) {
    const found = await findRelinkSource(store.projectPath, document.sha256);
    if (found) {
      const useFound = await confirmDialog(
        t("sourceStorage.relinkTitle"),
        t("sourceStorage.relinkFound", { name: document.name, path: found.path }),
        t("sourceStorage.relinkFoundAction"),
      );
      if (!useFound) return;
      pickedPath = found.path;
      bytes = await readFileBytes(found.path);
    }
  }
  if (!bytes) {
    const picked = await pickPdf();
    if (!picked) return;
    pickedPath = picked.path;
    bytes = picked.bytes;
  }
  if (!pickedPath) return;
  try {
    const hash = await sha256Hex(bytes);
    const pageCount = await host.probePdf(bytes);
    if (pageCount === null) throw new Error(t("sourceStorage.relinkOpenFailed"));
    if (pageCountChanged(document.pageCount, pageCount)) {
      const replace = await confirmDialog(
        t("sourceStorage.pageCountChangedTitle"),
        t("sourceStorage.pageCountChangedMessage", {
          name: document.name,
          expected: document.pageCount,
          actual: pageCount,
        }),
        t("sourceStorage.replaceSourceAction"),
      );
      if (replace) host.replaceSource(documentId);
      return;
    }
    if (document.sha256 && !checksumMatches(document.sha256, hash)) {
      const accept = await confirmDialog(
        t("sourceStorage.relinkMismatchTitle"),
        t("sourceStorage.relinkMismatchMessage", { name: document.name }),
        t("sourceStorage.relinkAnyway"),
        { danger: true },
      );
      if (!accept) return;
    }
    const before = cloneDocument(document);
    await host.checkpoint(t("sourceStorage.checkpoint.relink", { name: document.name }));
    store.applySourceStorageChange((documents) => {
      const target = documents.find((entry) => entry.id === documentId);
      if (!target) return;
      target.path = pickedPath;
      target.relativePath = store.projectPath
        ? relativeDocumentPath(store.projectPath, pickedPath)
        : null;
      target.sha256 = hash;
      target.sizeBytes = bytes.byteLength;
      target.storage = "reference";
      target.originalPath = undefined;
      target.originalSha256 = undefined;
    });
    if (!(await host.reloadDocument(documentId))) {
      store.applySourceStorageChange((documents) => {
        const target = documents.find((entry) => entry.id === documentId);
        if (target) restoreDocument(target, before);
      });
      throw new Error(t("sourceStorage.reloadFailed"));
    }
    host.afterChange();
    host.notify(t("sourceStorage.relinked", { name: document.name }), "success");
  } catch (error) {
    await messageDialog(t("sourceStorage.relinkFailed"), describeError(error), "warning");
  }
}
