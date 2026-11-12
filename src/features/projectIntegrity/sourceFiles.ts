import { invoke } from "@tauri-apps/api/core";

/** One regular PDF directly inside `<project>.drawings/`. */
export interface ManagedCopyEntry {
  path: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: number;
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
 * Deletes one listed managed copy by leaf name. The command re-reads the folder
 * and refuses a name that is not a current regular PDF copy of this project.
 */
export async function deleteManagedCopy(projectPath: string, fileName: string): Promise<void> {
  await invoke("source_delete_managed_copy", { projectPath, fileName });
}
