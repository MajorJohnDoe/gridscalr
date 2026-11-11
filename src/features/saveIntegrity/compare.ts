import { compareRevisions, type RevisionDiff } from "../../compare/revisionDiff";
import { totalPageCount } from "../../model/documents";
import type { Project } from "../../model/types";
import type { VersionSummary } from "./conflict";
import type { ProjectFileStamp } from "./stamp";

/** Page, item and byte counts for one side of a comparison. */
export function summarizeProjectVersion(
  project: Project,
  contents: string,
  stamp: ProjectFileStamp | null = null,
): VersionSummary {
  return {
    name: project.name,
    pages: totalPageCount(project.documents),
    items: project.layers.reduce((total, layer) => total + layer.items.length, 0),
    sizeBytes: new TextEncoder().encode(contents).byteLength,
    updatedAt: project.updatedAt || null,
    sha256: stamp?.sha256,
    modifiedAt: stamp?.modifiedAt,
  };
}

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
