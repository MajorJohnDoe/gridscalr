/** Automatic rolling backups keep a small restore window in app data. */
import { DEFAULT_BACKUP_RETENTION } from "../../io/appPreferences";

export const BACKUP_LIMIT = DEFAULT_BACKUP_RETENTION;

export interface BackupEntry {
  path: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: number;
  /** The project file path this backup was written from, when it was saved. */
  projectPath: string | null;
}

/** Names are ordered oldest first; this returns the names that should remain. */
export function newestBackupNames(names: readonly string[], limit = BACKUP_LIMIT): string[] {
  return [...names].sort().slice(Math.max(0, names.length - Math.max(0, limit)));
}

/** A deterministic, file-name-safe backup name for a millisecond timestamp. */
export function backupFileName(millis: number): string {
  return `backup-${String(Math.max(0, Math.round(millis))).padStart(13, "0")}.gridscalr`;
}

/** Newest first, with the file name as the stable tie-breaker. */
export function sortBackupsNewestFirst(entries: readonly BackupEntry[]): BackupEntry[] {
  return [...entries].sort((left, right) => right.fileName.localeCompare(left.fileName));
}
