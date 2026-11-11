import { resolveRelativePath } from "../../io/projectFile";
import type { DocumentRef, Project } from "../../model/types";

/**
 * Where a restored backup's relative drawing links may resolve from. The origin
 * is the project path recorded with the backup; the current path is the project
 * open in the window, which is the moved folder when the project moved.
 */
export type RestoreBaseKind = "origin" | "current";

export interface RestoreLinkBase {
  kind: RestoreBaseKind;
  path: string;
}

export type RestoreLinkReason = "resolved" | "staleAbsolute" | "missing" | "noLink";

export type RestoreMatch = RestoreBaseKind | "absolute";

export interface RestoreLinkEntry {
  documentId: string;
  name: string;
  /** Every path that was tried, in order. */
  candidates: string[];
  resolvedPath: string | null;
  matched: RestoreMatch | null;
  reason: RestoreLinkReason;
}

export interface RestoreLinkPlan {
  entries: RestoreLinkEntry[];
  resolved: RestoreLinkEntry[];
  /** Drawings that must be reported and offered for relink before loading. */
  unresolved: RestoreLinkEntry[];
}

function comparablePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

/**
 * The recorded origin first, then the open project's folder. A missing origin
 * still resolves through the open project, which covers backups written before
 * the origin manifest existed. Duplicates are tried once.
 */
export function restoreLinkBases(
  originPath: string | null,
  currentPath: string | null,
): RestoreLinkBase[] {
  const bases: RestoreLinkBase[] = [];
  const seen = new Set<string>();
  const add = (kind: RestoreBaseKind, path: string | null): void => {
    if (!path) return;
    const key = comparablePath(path);
    if (seen.has(key)) return;
    seen.add(key);
    bases.push({ kind, path });
  };
  add("origin", originPath);
  add("current", currentPath);
  return bases;
}

/** Embedded template sheets, derived TIF pages and copied documents need no file. */
export function documentNeedsSource(document: DocumentRef): boolean {
  if (document.kind === "template") return false;
  if (document.kind === "tiff" && document.embeddedPdf) return false;
  if (document.copiedFrom) return false;
  return true;
}

/**
 * Resolves each document of a restored project against the recordable bases.
 *
 * A document with a relative link is only ever resolved through that link: a
 * stale absolute path is reported as `staleAbsolute` instead of being loaded
 * silently, because it names the location the project was moved away from.
 * A document without a relative link falls back to its stored absolute path,
 * which is the only reference it has.
 */
export async function planRestoreLinks(
  project: Project,
  originPath: string | null,
  currentPath: string | null,
  exists: (path: string) => Promise<boolean>,
): Promise<RestoreLinkPlan> {
  const bases = restoreLinkBases(originPath, currentPath);
  const entries: RestoreLinkEntry[] = [];
  for (const document of project.documents) {
    if (!documentNeedsSource(document)) continue;
    const tried: Array<{ path: string; matched: RestoreMatch }> = [];
    if (document.relativePath && bases.length) {
      for (const base of bases) {
        const resolved = resolveRelativePath(base.path, document.relativePath);
        if (!resolved) continue;
        if (tried.some((item) => comparablePath(item.path) === comparablePath(resolved))) continue;
        tried.push({ path: resolved, matched: base.kind });
      }
    } else if (document.path) {
      tried.push({ path: document.path, matched: "absolute" });
    }
    let resolvedPath: string | null = null;
    let matched: RestoreMatch | null = null;
    for (const candidate of tried) {
      if (!(await exists(candidate.path))) continue;
      resolvedPath = candidate.path;
      matched = candidate.matched;
      break;
    }
    const staleAbsolute = document.path
      ? !resolvedPath && Boolean(document.relativePath) && (await exists(document.path))
      : false;
    entries.push({
      documentId: document.id,
      name: document.name,
      candidates: tried.map((item) => item.path),
      resolvedPath,
      matched,
      reason: resolvedPath
        ? "resolved"
        : staleAbsolute
          ? "staleAbsolute"
          : tried.length
            ? "missing"
            : "noLink",
    });
  }
  return {
    entries,
    resolved: entries.filter((entry) => entry.reason === "resolved"),
    unresolved: entries.filter((entry) => entry.reason !== "resolved"),
  };
}

/** Points every resolved document at the file that is actually on disk. */
export function applyRestoreLinkPlan(project: Project, plan: RestoreLinkPlan): void {
  for (const entry of plan.resolved) {
    const document = project.documents.find((item) => item.id === entry.documentId);
    if (document && entry.resolvedPath) document.path = entry.resolvedPath;
  }
}

/**
 * Applies one explicitly picked replacement drawing. The relative folder link
 * no longer describes the file, so it is cleared and the document becomes a
 * plain reference; the load still verifies the checksum before it is accepted.
 */
export function applyRestoreRelink(document: DocumentRef, path: string, name: string): void {
  document.path = path;
  document.name = name;
  document.relativePath = null;
  document.storage = "reference";
  document.originalPath = undefined;
  document.originalSha256 = undefined;
}
