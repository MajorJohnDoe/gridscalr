import { resolveRelativePath } from "../../io/projectFile";
import { pathComparisonKey } from "../../io/writeGuard";
import type { Project } from "../../model/types";
import type { SourceFileStatus } from "../../source/sourceStatus";
import type { ManagedCopyEntry } from "./sourceFiles";

/**
 * Source availability as the project doctor shows it.
 *
 * `checked` is false in the browser fallback, where there is no file system to
 * inspect. A missing or changed drawing never becomes a validation error: this
 * snapshot is a warning layer with explicit actions, not a save gate.
 */
export interface DoctorSourceSnapshot {
  checked: boolean;
  listingFailed: boolean;
  statuses: SourceFileStatus[];
  managed: ManagedCopyEntry[];
  referencedManaged: number;
  orphans: ManagedCopyEntry[];
  missing: number;
  changed: number;
  orphanBytes: number;
}

/** An empty snapshot for a state where no file system check is possible. */
export function emptySourceSnapshot(checked: boolean): DoctorSourceSnapshot {
  return {
    checked,
    listingFailed: false,
    statuses: [],
    managed: [],
    referencedManaged: 0,
    orphans: [],
    missing: 0,
    changed: 0,
    orphanBytes: 0,
  };
}

/**
 * Every path a document can reach. The stored path, the path resolved from the
 * portable relative reference and a managed copy's original source all count.
 *
 * Keys are canonical and case-insensitive on every platform, matching the write
 * guard: a false positive only protects one extra copy from cleanup, while a
 * false negative could delete a file a document still points at.
 */
export function referencedSourceKeys(project: Project, projectPath: string | null): Set<string> {
  const keys = new Set<string>();
  const add = (path: string | null | undefined): void => {
    if (!path) return;
    const key = pathComparisonKey(path);
    if (key) keys.add(key);
  };
  for (const document of project.documents) {
    add(document.path);
    if (projectPath && document.relativePath) {
      add(resolveRelativePath(projectPath, document.relativePath));
    }
    add(document.originalPath);
  }
  return keys;
}

/**
 * Splits a non-recursive drawings-folder listing into referenced copies and
 * orphans. Only an exact canonical path match protects a file; a similar name,
 * size or checksum is never enough.
 */
export function classifyManagedCopies(
  entries: readonly ManagedCopyEntry[],
  referencedKeys: ReadonlySet<string>,
): { referenced: ManagedCopyEntry[]; orphans: ManagedCopyEntry[] } {
  const referenced: ManagedCopyEntry[] = [];
  const orphans: ManagedCopyEntry[] = [];
  for (const entry of entries) {
    if (referencedKeys.has(pathComparisonKey(entry.path))) referenced.push(entry);
    else orphans.push(entry);
  }
  return { referenced, orphans };
}

/** Pure summary used by the controller and by tests. */
export function buildSourceSnapshot(input: {
  checked: boolean;
  listingFailed?: boolean;
  statuses?: readonly SourceFileStatus[];
  managed?: readonly ManagedCopyEntry[];
  referenced?: readonly ManagedCopyEntry[];
  orphans?: readonly ManagedCopyEntry[];
}): DoctorSourceSnapshot {
  const statuses = [...(input.statuses ?? [])];
  const managed = [...(input.managed ?? [])];
  const orphans = [...(input.orphans ?? [])];
  return {
    checked: input.checked,
    listingFailed: input.listingFailed ?? false,
    statuses,
    managed,
    referencedManaged: input.referenced?.length ?? managed.length - orphans.length,
    orphans,
    missing: statuses.filter((entry) => entry.state === "missing").length,
    changed: statuses.filter((entry) => entry.state === "changed").length,
    orphanBytes: orphans.reduce((total, entry) => total + entry.sizeBytes, 0),
  };
}
