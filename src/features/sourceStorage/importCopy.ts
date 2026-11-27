import type { Project } from "../../model/types";
import { applyManagedCopy, type ManagedCopyInfo } from "./managedCopy";

/**
 * A verified managed copy prepared before an import commits. The import flow
 * writes the file first, then applies this record inside the same store
 * mutation as the imported pages, so one Undo removes the import and its copy
 * together.
 */
export interface PreparedImportCopy {
  documentId: string;
  copy: ManagedCopyInfo;
  originalPath: string | null;
  originalSha256: string;
}

/** Rewrites the imported document to the prepared copy inside a transaction. */
export function applyImportManagedCopy(project: Project, prepared: PreparedImportCopy): boolean {
  const document = project.documents.find((entry) => entry.id === prepared.documentId);
  if (!document) return false;
  applyManagedCopy(document, prepared.copy, {
    path: prepared.originalPath,
    sha256: prepared.originalSha256,
  });
  return true;
}
