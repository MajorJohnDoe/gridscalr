import type { ConflictedCopyEntry } from "./model";

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function entryFrom(value: unknown): ConflictedCopyEntry | null {
  const item = record(value);
  if (
    !item ||
    typeof item.path !== "string" ||
    typeof item.fileName !== "string" ||
    typeof item.sizeBytes !== "number" ||
    typeof item.modifiedAt !== "number"
  ) {
    return null;
  }
  return {
    path: item.path,
    fileName: item.fileName,
    sizeBytes: item.sizeBytes,
    modifiedAt: item.modifiedAt,
  };
}

/**
 * Reads the folder of the open project through the Rust command. The command
 * skips anything that is not a regular file with the documented name, and it
 * never follows a symlink. An unreadable folder rejects so the UI can say so.
 */
export async function listConflictedCopies(projectPath: string): Promise<ConflictedCopyEntry[]> {
  const result = await tauriInvoke<unknown>("list_conflicted_copies", { projectPath });
  if (!Array.isArray(result)) return [];
  return result
    .map((item) => entryFrom(record(item)))
    .filter((item): item is ConflictedCopyEntry => item !== null);
}

/**
 * Deletes one validated copy. The Rust command re-validates the name against
 * the project stem, refuses a symlink and the open project's own file, and
 * removes a single file, so a failure cannot leave a half-deleted set.
 */
export async function deleteConflictedCopy(projectPath: string, fileName: string): Promise<void> {
  await tauriInvoke<unknown>("delete_conflicted_copy", { projectPath, fileName });
}

/** Copy count for the status popover. Called once per popover open. */
export async function countConflictedCopies(projectPath: string): Promise<number> {
  return (await listConflictedCopies(projectPath)).length;
}
