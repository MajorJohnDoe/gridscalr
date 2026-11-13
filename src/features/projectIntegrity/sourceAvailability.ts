import { t } from "../../i18n";
import { formatBytes, isTauri } from "../../io/platform";
import { pathComparisonKey } from "../../io/writeGuard";
import type { Project } from "../../model/types";
import { checkSourceStatuses } from "../../source/sourceStatus";
import { confirmDialog } from "../../ui/dialogs";
import { listManagedCopies, removeManagedCopies, type ManagedCopyEntry } from "./sourceFiles";
import {
  buildSourceSnapshot,
  classifyManagedCopies,
  emptySourceSnapshot,
  referencedSourceKeys,
  type DoctorSourceSnapshot,
} from "./sourceModel";

export interface DoctorSourceCleanupResult {
  removed: number;
  skipped: number;
  failed: number;
  /** How many removed copies went to the operating system trash. */
  trashed: number;
  /** The fallback folder, set only when the OS trash was unavailable. */
  folder: string | null;
}

/**
 * App-facing boundary for the doctor's source section. Reading is always
 * allowed; changing a source, copying it into the project or deleting an unused
 * managed copy is only offered for an open, writable desktop project.
 */
export interface DoctorSourceHost {
  canChange: boolean;
  load: (project: Project) => Promise<DoctorSourceSnapshot>;
  confirmCleanup: (entries: readonly ManagedCopyEntry[]) => Promise<boolean>;
  delete: (
    project: Project,
    entries: readonly ManagedCopyEntry[],
  ) => Promise<DoctorSourceCleanupResult>;
  relink?: (documentId: string) => Promise<void>;
  copyIntoProject?: (documentId: string) => Promise<boolean>;
}

/**
 * Checks every external source and classifies the managed-copy folder.
 *
 * The browser fallback has no file system, so it reports `checked: false`
 * instead of turning every drawing into a false "missing" warning. A failure
 * to list the drawings folder is also reported, never guessed around.
 */
export async function loadDoctorSources(
  project: Project,
  projectPath: string | null,
): Promise<DoctorSourceSnapshot> {
  if (!isTauri) return emptySourceSnapshot(false);
  const statuses = await checkSourceStatuses(project, projectPath);
  let managed: ManagedCopyEntry[] = [];
  let listingFailed = false;
  if (projectPath) {
    try {
      managed = await listManagedCopies(projectPath);
    } catch {
      listingFailed = true;
    }
  }
  const references = referencedSourceKeys(project, projectPath);
  const { referenced, orphans } = classifyManagedCopies(managed, references);
  return buildSourceSnapshot({
    checked: true,
    listingFailed,
    statuses,
    managed,
    referenced,
    orphans,
  });
}

/** Explicit confirmation with the full set, the count and the total size. */
export async function confirmUnusedDrawings(
  entries: readonly ManagedCopyEntry[],
): Promise<boolean> {
  if (!entries.length) return false;
  const total = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  return confirmDialog(
    t("projectIntegrity.sources.cleanupTitle"),
    t("projectIntegrity.sources.cleanupMessage", {
      count: entries.length,
      size: formatBytes(total),
      files: entries.map((entry) => entry.fileName).join("\n"),
    }),
    t("projectIntegrity.sources.cleanupAction"),
    { danger: true },
  );
}

/**
 * Re-verifies immediately before moving. The folder is listed again and the
 * referenced set is rebuilt from the current project, so a copy that is now
 * referenced, or a file that vanished, is skipped instead of moved. The Rust
 * command re-reads the folder again inside the removal call. A failed move is
 * counted and never retried automatically.
 */
export async function deleteUnusedDrawings(
  project: Project,
  entries: readonly ManagedCopyEntry[],
  projectPath: string | null,
): Promise<DoctorSourceCleanupResult> {
  const result: DoctorSourceCleanupResult = {
    removed: 0,
    skipped: 0,
    failed: 0,
    trashed: 0,
    folder: null,
  };
  const unique = [
    ...new Map(entries.map((entry) => [pathComparisonKey(entry.path), entry])).values(),
  ];
  if (!isTauri || !projectPath || !unique.length) {
    result.skipped = unique.length;
    return result;
  }
  let listing: ManagedCopyEntry[];
  try {
    listing = await listManagedCopies(projectPath);
  } catch {
    result.failed = unique.length;
    return result;
  }
  const current = new Map(listing.map((entry) => [pathComparisonKey(entry.path), entry]));
  // The reference set comes from the open project at this exact moment, so a
  // document added or relinked while the confirmation was open protects its
  // copy here.
  const references = referencedSourceKeys(project, projectPath);
  const selected: string[] = [];
  for (const entry of unique) {
    const fresh = current.get(pathComparisonKey(entry.path));
    if (!fresh || references.has(pathComparisonKey(fresh.path))) {
      result.skipped += 1;
      continue;
    }
    selected.push(fresh.fileName);
  }
  if (!selected.length) return result;
  try {
    const removal = await removeManagedCopies(projectPath, selected);
    result.removed = removal.removed.length;
    result.trashed = removal.removed.filter((entry) => entry.destination === "trash").length;
    result.folder = removal.folder;
    result.skipped += removal.skipped.length;
    result.failed += removal.failed.length;
  } catch {
    result.failed += selected.length;
  }
  return result;
}

/** Builds the host used by the doctor flow; paths are resolved per call. */
export function createDoctorSourceHost(
  projectPath: () => string | null,
  options: {
    canChange: boolean;
    relink?: (documentId: string) => Promise<void>;
    copyIntoProject?: (documentId: string) => Promise<boolean>;
  },
): DoctorSourceHost {
  return {
    canChange: options.canChange,
    load: (project) => loadDoctorSources(project, projectPath()),
    confirmCleanup: confirmUnusedDrawings,
    delete: (project, entries) => deleteUnusedDrawings(project, entries, projectPath()),
    relink: options.relink,
    copyIntoProject: options.copyIntoProject,
  };
}
