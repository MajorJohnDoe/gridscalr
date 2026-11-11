import { resolveDocumentPath } from "./documents";
import type { ProjectIssue } from "../../model/integrity";
import type { Project } from "../../model/types";
import { isPathInside } from "../../io/writeGuard";
import { isManagedDocument } from "./mode";

/** One source drawing that lives outside the project folder (F-034). */
export interface OutsideReference {
  documentId: string;
  name: string;
  path: string;
}

function folderOf(path: string | null): string | null {
  if (!path) return null;
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index > 0 ? path.slice(0, index) : null;
}

/**
 * Documents whose drawing resolves outside the project folder and its managed
 * drawings folder.
 *
 * This is a trust-model warning, not a boundary: reference mode deliberately
 * allows a drawing that lives in a shared folder. A project is input, so an
 * untrusted project can point at any readable PDF. The result drives a
 * dismissible banner and never blocks the project from opening.
 */
export function outsideProjectReferences(
  project: Project,
  projectPath: string | null,
): OutsideReference[] {
  const root = folderOf(projectPath);
  if (!root) return [];
  const references: OutsideReference[] = [];
  for (const document of project.documents) {
    if (document.kind !== "pdf" || isManagedDocument(document)) continue;
    const resolved = resolveDocumentPath(document, projectPath);
    if (!resolved) continue;
    if (isPathInside(resolved, root)) continue;
    references.push({ documentId: document.id, name: document.name, path: resolved });
  }
  return references;
}

/** Project-doctor warning rows for the same references. */
export function outsideReferenceIssues(
  project: Project,
  projectPath: string | null,
): ProjectIssue[] {
  return outsideProjectReferences(project, projectPath).map((reference) => ({
    severity: "warning",
    code: "outsideProjectReference",
    message: "outsideProjectReference",
    entity: { kind: "document", id: reference.documentId },
  }));
}

/** Short, non-path list of names for the banner message. */
export function describeOutsideReferences(references: readonly OutsideReference[]): string {
  return references.map((reference) => reference.name).join(", ");
}
