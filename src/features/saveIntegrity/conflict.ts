import { sameFileVersion, type ProjectFileStamp } from "./stamp";

export type ConflictAction = "conflicted-copy" | "compare" | "reload" | "overwrite" | "cancel";

export type ConflictKind = "clean" | "conflict" | "missing";

/**
 * Classifies the target before a normal Save. A target that exists while the
 * editor has no stamp is treated as a conflict, because the file version the
 * editor loaded is unknown.
 */
export function classifyConflict(
  expected: ProjectFileStamp | null,
  current: ProjectFileStamp | null,
): ConflictKind {
  if (!current) return "missing";
  if (!expected) return "conflict";
  return sameFileVersion(expected, current) ? "clean" : "conflict";
}

/** Saving as a conflicted copy is the safe default; overwrite is never implicit. */
export function defaultConflictAction(): ConflictAction {
  return "conflicted-copy";
}

export interface VersionSummary {
  name: string;
  pages: number;
  items: number;
  sizeBytes: number;
  updatedAt: string | null;
  sha256?: string;
  modifiedAt?: number;
}
