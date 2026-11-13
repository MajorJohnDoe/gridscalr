import { invoke } from "@tauri-apps/api/core";

/** One regular PDF directly inside `<project>.drawings/`. */
export interface ManagedCopyEntry {
  path: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: number;
}

/** Where an explicitly removed managed copy went. */
export type RemovalDestination = "trash" | "folder";

export interface RemovedManagedCopy {
  fileName: string;
  destination: RemovalDestination;
}

/** The Rust report for one explicit removal request. */
export interface ManagedCopyRemoval {
  removed: RemovedManagedCopy[];
  /** Names that were no longer listed when the folder was re-read. */
  skipped: string[];
  failed: string[];
  /** The timestamped fallback folder, when the OS trash was unavailable. */
  folder: string | null;
}

/**
 * Lists the managed-copy folder. The command derives the folder from the
 * project path with the same helper that writes a copy; a missing folder is an
 * empty list, not an error.
 */
export async function listManagedCopies(projectPath: string): Promise<ManagedCopyEntry[]> {
  return invoke<ManagedCopyEntry[]>("source_list_managed_copies", { projectPath });
}

/**
 * Moves the listed managed copies out of the drawings folder. The command
 * re-reads the folder and refuses a name that is not a current regular PDF copy
 * of this project; a listed copy goes to the operating system trash when that
 * is available and into one timestamped folder beside the project otherwise.
 */
export async function removeManagedCopies(
  projectPath: string,
  fileNames: readonly string[],
): Promise<ManagedCopyRemoval> {
  return invoke<ManagedCopyRemoval>("source_remove_managed_copies", {
    projectPath,
    fileNames: [...fileNames],
  });
}
