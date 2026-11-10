import type { DocumentRef, Project } from "../../model/types";
import { isManagedDocument } from "./mode";

/** Verified result returned by the Rust copy command. */
export interface ManagedCopyInfo {
  destinationPath: string;
  relativePath: string;
  sha256: string;
  sizeBytes: number;
}

export interface ConsolidateCandidate {
  documentId: string;
  name: string;
  path: string;
  sha256: string;
}

/**
 * A stable identity for one physical source file. The package uses it to
 * include a managed drawing exactly once, even if several document records
 * point at the same copy (for example a copied page and its origin).
 */
export function documentSourceKey(document: DocumentRef): string {
  if (document.kind === "template") return `template:${document.id}`;
  if (isManagedDocument(document) && document.relativePath) {
    return `managed:${document.relativePath.replace(/\\/g, "/").toLowerCase()}`;
  }
  if (document.path) return `path:${document.path.replace(/\\/g, "/").toLowerCase()}`;
  if (document.relativePath) {
    return `path:${document.relativePath.replace(/\\/g, "/").toLowerCase()}`;
  }
  return `document:${document.id}`;
}

export function managedRelativePath(projectPath: string, destinationPath: string): string | null {
  const normalize = (value: string) => value.replace(/\\/g, "/");
  const projectFolder = normalize(projectPath).split("/").slice(0, -1).join("/");
  const destination = normalize(destinationPath);
  if (!projectFolder) return null;
  const base = projectFolder.split("/");
  const parts = destination.split("/");
  if (base[0] !== parts[0]) return null;
  let index = 0;
  while (index < base.length && index < parts.length && base[index] === parts[index]) index += 1;
  return [...Array(base.length - index).fill(".."), ...parts.slice(index)].join("/");
}

/** Rewrites one document to a verified managed copy, preserving provenance. */
export function applyManagedCopy(
  document: DocumentRef,
  info: ManagedCopyInfo,
  original: { path: string | null; sha256: string },
): void {
  document.storage = "managed";
  document.path = info.destinationPath;
  document.relativePath = info.relativePath;
  document.sha256 = info.sha256;
  document.sizeBytes = info.sizeBytes;
  document.originalPath = original.path;
  document.originalSha256 = original.sha256 || info.sha256;
}

/** Keeps the managed copy and clears the provenance link to the original. */
export function detachManagedCopy(document: DocumentRef): void {
  document.originalPath = null;
  delete document.originalSha256;
}

/**
 * Every reference PDF that a consolidation would copy. TIF documents carry an
 * embedded derived PDF and template sheets have no file, so neither is copied.
 */
export function consolidateCandidates(
  project: Project,
  resolvePath: (document: DocumentRef) => string | null,
): ConsolidateCandidate[] {
  const candidates: ConsolidateCandidate[] = [];
  for (const document of project.documents) {
    if (document.kind !== "pdf" || isManagedDocument(document)) continue;
    const path = resolvePath(document);
    if (!path) continue;
    if (candidates.some((candidate) => candidate.path === path)) continue;
    candidates.push({
      documentId: document.id,
      name: document.name,
      path,
      sha256: document.sha256,
    });
  }
  return candidates;
}

export function hasConsolidatableDocuments(
  project: Project,
  resolvePath: (document: DocumentRef) => string | null,
): boolean {
  return consolidateCandidates(project, resolvePath).length > 0;
}
