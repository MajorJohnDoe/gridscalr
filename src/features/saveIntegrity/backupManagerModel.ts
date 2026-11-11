import type { BackupEntry } from "./backup";

/** The explicit outcomes of the backup manager dialog. */
export type BackupManagerAction = "restore-copy" | "replace" | "delete" | "delete-all" | "cancel";

export interface BackupManagerChoice {
  action: BackupManagerAction;
  entry: BackupEntry | null;
}

/** Newest backup first; the manager preselects it. */
export function defaultBackupSelection(entries: readonly BackupEntry[]): string | null {
  return entries[0]?.path ?? null;
}

export function findBackup(
  entries: readonly BackupEntry[],
  path: string | null,
): BackupEntry | null {
  if (!path) return null;
  return entries.find((entry) => entry.path === path) ?? null;
}

/**
 * Replacing the open project keeps the current file path, so it is only
 * offered when the project is already saved to a file.
 */
export function canReplaceOpenProject(projectPath: string | null): boolean {
  return Boolean(projectPath);
}

/**
 * A backup written from another path cannot resolve that project's relative
 * drawing links through the current project path. Until F-005 is fixed the
 * manager warns instead of silently resolving from the wrong folder.
 */
export function originNeedsWarning(
  entry: BackupEntry | null,
  currentProjectPath: string | null,
): boolean {
  if (!entry || !entry.projectPath) return false;
  return entry.projectPath !== currentProjectPath;
}

export function totalBackupBytes(entries: readonly BackupEntry[]): number {
  return entries.reduce((total, entry) => total + entry.sizeBytes, 0);
}
