import { compareRevisions, type RevisionDiff } from "../../compare/revisionDiff";
import type { Project } from "../../model/types";
import type { VersionSummary } from "./conflict";

/**
 * Read-only comparison shown from a save conflict. It reuses the revision
 * comparison engine on the in-memory project and the parsed disk project.
 * Nothing here mutates either project or writes a file.
 */
export interface ConflictComparisonInfo {
  local: VersionSummary;
  disk: VersionSummary | null;
  /** Null when the disk project could not be parsed or comparison failed. */
  diff: RevisionDiff | null;
  /** True when the disk file exists but its project data is unreadable. */
  diskError: boolean;
}

export function buildConflictComparison(
  local: Project,
  localSummary: VersionSummary,
  diskProject: Project | null,
  diskSummary: VersionSummary | null,
  diskError = false,
): ConflictComparisonInfo {
  let diff: RevisionDiff | null = null;
  if (diskProject) {
    try {
      diff = compareRevisions(local, diskProject);
    } catch {
      diff = null;
    }
  }
  return { local: localSummary, disk: diskSummary, diff, diskError };
}
