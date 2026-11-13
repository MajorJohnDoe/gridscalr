import { t } from "../../i18n";
import { managedCopyProtectedPaths } from "../../io/projectFile";
import { describeError } from "../../io/platformError";
import type { DocumentRef, Project } from "../../model/types";
import { messageDialog } from "../../ui/dialogs";
import { copySourceToProject } from "./files";
import { applyManagedCopy } from "./managedCopy";
import { isManagedDocument } from "./mode";
import { checksumMatches } from "./relink";

/**
 * Replacement keeps a managed source managed. Only a PDF has a real file that
 * can be copied; a TIF carries its derived PDF inside the project, so its
 * source stays a reference.
 */
export function preservesManagedStorage(document: DocumentRef): boolean {
  return document.kind === "pdf" && isManagedDocument(document);
}

export interface ReplacementCopyRequest {
  project: Project;
  projectPath: string;
  /** The document whose source is being replaced. */
  oldDocument: DocumentRef;
  /** The prepared replacement reference from the picked file. */
  newDocument: DocumentRef;
  /** Absolute path of the picked replacement file. */
  sourcePath: string;
}

/**
 * Prepares the document value a replacement should apply.
 *
 * A reference result is returned unchanged: `applySourceReplacement()` clears
 * the replaced managed provenance explicitly. A managed result is copied into
 * `<project>.drawings/` first, so replacing the source never silently degrades
 * managed storage to a reference, and the new copy is verified before any
 * project field changes. The old managed file is never removed here; it becomes
 * an unreferenced copy that the project doctor offers for explicit cleanup.
 *
 * Returns `null` when the copy failed; the caller must abort the replacement
 * instead of applying a reference over a managed document.
 */
export async function prepareReplacementDocument(
  request: ReplacementCopyRequest,
): Promise<DocumentRef | null> {
  if (!preservesManagedStorage(request.oldDocument)) return request.newDocument;
  try {
    const copy = await copySourceToProject({
      sourcePath: request.sourcePath,
      projectPath: request.projectPath,
      displayName: request.newDocument.name,
      protectedPaths: managedCopyProtectedPaths(request.project, request.projectPath),
    });
    if (!checksumMatches(request.newDocument.sha256, copy.sha256)) {
      throw new Error(t("sourceStorage.copyVerifyFailed", { name: request.newDocument.name }));
    }
    const document: DocumentRef = { ...request.newDocument };
    // The replacement file is the provenance of the new managed copy, exactly
    // as an explicit copy into the project records it.
    applyManagedCopy(document, copy, {
      path: request.sourcePath,
      sha256: request.newDocument.sha256,
    });
    return document;
  } catch (error) {
    await messageDialog(t("sourceStorage.copyFailedTitle"), describeError(error), "warning");
    return null;
  }
}
