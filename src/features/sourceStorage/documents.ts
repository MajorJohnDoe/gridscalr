import { resolveRelativePath } from "../../io/projectFile";
import type { DocumentRef, Project } from "../../model/types";

export function resolveDocumentPath(
  document: DocumentRef,
  projectPath: string | null,
): string | null {
  if (document.path) return document.path;
  if (projectPath && document.relativePath) {
    return resolveRelativePath(projectPath, document.relativePath);
  }
  return null;
}

export function findDocument(project: Project, documentId: string): DocumentRef | undefined {
  return project.documents.find((document) => document.id === documentId);
}

/** Shallow snapshot for reverting scalar reference fields on a failed reload. */
export function cloneDocument(document: DocumentRef): DocumentRef {
  return { ...document };
}

export function restoreDocument(target: DocumentRef, snapshot: DocumentRef): void {
  for (const key of Object.keys(target) as (keyof DocumentRef)[]) delete target[key];
  Object.assign(target, snapshot);
}
