import { derivedCachePath } from "../derivedPdfCache";
import { pathExists } from "../../io/platform";
import { resolveRelativePath, sourceDocumentPaths } from "../../io/projectFile";
import type { DocumentRef, Project } from "../../model/types";
import { store } from "../../state/store";
import { t } from "../../i18n";
import type { PackageSourceRequest } from "./ipc";
import type { DocumentChecksumOverrides } from "./model";

export function protectedPathsFor(project: Project): string[] {
  const paths = sourceDocumentPaths(project, store.projectPath);
  if (store.projectPath && !paths.includes(store.projectPath)) paths.push(store.projectPath);
  return paths;
}

/** Absolute cache file paths for every cache-backed scan in the project. */
export function cacheSourcePaths(
  project: Project,
  projectPath: string | null,
): Map<string, string> {
  const paths = new Map<string, string>();
  for (const document of project.documents) {
    if (document.kind !== "tiff" || !document.derivedPdf) continue;
    const path = derivedCachePath(document, projectPath);
    if (path) paths.set(document.id, path);
  }
  return paths;
}

function sourcePathFor(document: DocumentRef, projectPath: string | null): string | null {
  if (document.path) return document.path;
  if (projectPath && document.relativePath) {
    return resolveRelativePath(projectPath, document.relativePath);
  }
  return null;
}

function sourceRequest(
  document: DocumentRef,
  archivePath: string,
  kind: "pdf" | "tiff",
  overrides: DocumentChecksumOverrides,
): PackageSourceRequest {
  return {
    sourcePath: document.path ?? "",
    archivePath,
    kind,
    expectedSha256: overrides[document.id]?.sha256 ?? document.sha256 ?? "",
  };
}

export async function missingSources(
  project: Project,
  projectPath: string | null,
  includeScans: boolean,
): Promise<{ name: string; path: string }[]> {
  const missing: { name: string; path: string }[] = [];
  for (const document of project.documents) {
    if (document.kind === "template") continue;
    if (document.kind === "tiff") {
      // A cache-backed scan travels as its derived cache; its original scan is
      // never included too, so only the cache has to exist.
      if (document.derivedPdf) {
        const cache = derivedCachePath(document, projectPath);
        if (!cache || !(await pathExists(cache))) {
          missing.push({ name: document.name, path: cache ?? document.name });
        }
        continue;
      }
      if (!includeScans) continue;
    }
    const path = sourcePathFor(document, projectPath);
    if (!path || !(await pathExists(path))) {
      missing.push({ name: document.name, path: path ?? document.name });
    }
  }
  return missing;
}

export function prepareDocuments(
  project: Project,
  documentPaths: Map<string, string>,
  overrides: DocumentChecksumOverrides,
  projectPath: string | null,
): PackageSourceRequest[] {
  const documents: PackageSourceRequest[] = [];
  for (const document of project.documents) {
    if (document.kind !== "pdf") continue;
    const archivePath = documentPaths.get(document.id);
    const path = sourcePathFor(document, projectPath);
    if (!archivePath || !path) continue;
    documents.push(sourceRequest({ ...document, path }, archivePath, "pdf", overrides));
  }
  return documents;
}

export function prepareScans(
  project: Project,
  scanPaths: Map<string, string>,
  overrides: DocumentChecksumOverrides,
  projectPath: string | null,
): PackageSourceRequest[] {
  const scans: PackageSourceRequest[] = [];
  for (const document of project.documents) {
    if (document.kind !== "tiff") continue;
    // Never carry the cache and the original scan for the same document.
    if (document.derivedPdf) continue;
    const archivePath = scanPaths.get(document.id);
    const path = sourcePathFor(document, projectPath);
    if (!archivePath || !path) continue;
    scans.push(sourceRequest({ ...document, path }, archivePath, "tiff", overrides));
  }
  return scans;
}

/** One archive entry per derived cache, keyed by the document that names it. */
export function prepareDerivedCaches(
  project: Project,
  cachePaths: Map<string, string>,
  sourcePaths: Map<string, string>,
): PackageSourceRequest[] {
  const caches: PackageSourceRequest[] = [];
  for (const document of project.documents) {
    if (document.kind !== "tiff" || !document.derivedPdf) continue;
    const archivePath = cachePaths.get(document.id);
    const sourcePath = sourcePaths.get(document.id);
    if (!archivePath || !sourcePath) continue;
    caches.push({
      sourcePath,
      archivePath,
      kind: "derived",
      // The marker does not store a cache checksum: the cache is derived, and a
      // rebuild produces fresh bytes. The manifest records the written hash.
      expectedSha256: "",
    });
  }
  return caches;
}

/** One archive entry per physical source, even with several document records. */
export function uniqueSourceRequests(requests: PackageSourceRequest[]): PackageSourceRequest[] {
  const seen = new Map<string, PackageSourceRequest>();
  for (const request of requests) {
    const key = request.archivePath.toLowerCase();
    if (!seen.has(key)) seen.set(key, request);
  }
  return [...seen.values()];
}

export function checksumMessage(failures: { name: string }[]): string {
  return t("package.checksumMessage", {
    files: failures.map((file) => `• ${file.name}`).join("\n"),
  });
}

export function mapMismatchesToOverrides(
  documentPaths: Map<string, string>,
  scanPaths: Map<string, string>,
  failures: { file: string; actual: string; sizeBytes: number }[],
  overrides: DocumentChecksumOverrides,
): void {
  const byArchive = new Map<string, string>();
  for (const [id, path] of documentPaths) byArchive.set(path, id);
  for (const [id, path] of scanPaths) byArchive.set(path, id);
  for (const failure of failures) {
    const id = byArchive.get(failure.file);
    if (id) overrides[id] = { sha256: failure.actual, sizeBytes: failure.sizeBytes };
  }
}
