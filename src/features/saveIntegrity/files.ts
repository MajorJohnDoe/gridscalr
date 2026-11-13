import { t } from "../../i18n";
import { readFileBytes, readFileText, sha256Hex } from "../../io/platform";
import type { BackupEntry } from "./backup";
import type { ProjectFileStamp } from "./stamp";

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function stampFrom(value: unknown): ProjectFileStamp | null {
  const item = record(value);
  if (!item) return null;
  if (
    typeof item.sha256 !== "string" ||
    typeof item.sizeBytes !== "number" ||
    typeof item.modifiedAt !== "number"
  ) {
    return null;
  }
  return {
    sha256: item.sha256,
    sizeBytes: item.sizeBytes,
    modifiedAt: item.modifiedAt,
  };
}

/** A conditional write saw a different file on disk than the editor loaded. */
export class ProjectWriteConflictError extends Error {
  constructor(readonly current: ProjectFileStamp | null) {
    super(t("error.projectConflict"));
    this.name = "ProjectWriteConflictError";
  }
}

export interface ProjectFileMetadata {
  sizeBytes: number;
  modifiedAt: number;
}

function metadataFrom(value: unknown): ProjectFileMetadata | null {
  const item = record(value);
  if (!item || typeof item.sizeBytes !== "number" || typeof item.modifiedAt !== "number") {
    return null;
  }
  return { sizeBytes: item.sizeBytes, modifiedAt: item.modifiedAt };
}

/** Current hash, size and mtime of a project file, or null when it is missing. */
export async function computeFileStamp(path: string): Promise<ProjectFileStamp | null> {
  return stampFrom(await tauriInvoke<unknown>("project_file_stamp", { path }));
}

/** Size and mtime only. Used by the watcher before it spends a hash read. */
export async function computeFileMetadata(path: string): Promise<ProjectFileMetadata | null> {
  return metadataFrom(await tauriInvoke<unknown>("project_file_metadata", { path }));
}

/**
 * Writes through the Rust conditional command and verifies the bytes by
 * reading the target back. A missing or changed target rejects with a
 * `ProjectWriteConflictError` that carries the disk stamp.
 */
export async function writeProjectConditional(
  path: string,
  contents: string,
  expectedSha256: string | null,
  protectedPaths: readonly string[],
): Promise<ProjectFileStamp> {
  let stamp: ProjectFileStamp | null;
  try {
    stamp = stampFrom(
      await tauriInvoke<unknown>("write_project_conditional", {
        path,
        contents,
        expectedSha256,
        protectedPaths: [...protectedPaths],
      }),
    );
  } catch (error) {
    const failure = record(error);
    if (failure?.code === "projectConflict") {
      throw new ProjectWriteConflictError(stampFrom(failure.current));
    }
    throw error;
  }
  if (!stamp) throw new Error(t("saveIntegrity.readBackMismatch"));
  const bytes = await readFileBytes(path);
  const sha256 = await sha256Hex(bytes);
  if (sha256 !== stamp.sha256 || bytes.byteLength !== stamp.sizeBytes) {
    throw new Error(t("saveIntegrity.readBackMismatch"));
  }
  return stamp;
}

export async function readProjectFileText(path: string): Promise<string> {
  return readFileText(path);
}

/**
 * Removes stale app-created temporaries after a project loads: flushed save
 * siblings next to the project, staging folders from a crashed package
 * extraction and stale managed-copy siblings (F-046). The Rust command only
 * touches its own generated names, only entries older than the documented age,
 * and never a file owned by the running process, so a source drawing or a
 * project file can never match.
 */
export async function cleanProjectTemporaries(path: string): Promise<number> {
  const removed = await tauriInvoke<unknown>("clean_project_temporaries", {
    projectPath: path,
  });
  return typeof removed === "number" ? removed : 0;
}

/** Writes one rolling backup under the app data folder, keyed by project id. */
export async function saveProjectBackup(
  projectId: string,
  contents: string,
  projectPath: string | null,
  retention: number,
): Promise<BackupEntry> {
  const entry = record(
    await tauriInvoke<unknown>("save_project_backup", {
      projectId,
      contents,
      projectPath,
      retention,
    }),
  );
  const parsed = backupEntryFrom(entry);
  if (!parsed) {
    throw new Error(t("saveIntegrity.backupFailed"));
  }
  return parsed;
}

function backupEntryFrom(item: Record<string, unknown> | null): BackupEntry | null {
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
    projectPath: typeof item.projectPath === "string" ? item.projectPath : null,
  };
}

export async function listProjectBackups(projectId: string): Promise<BackupEntry[]> {
  const result = await tauriInvoke<unknown>("list_project_backups", { projectId });
  if (!Array.isArray(result)) return [];
  return result
    .map((item) => backupEntryFrom(record(item)))
    .filter((item): item is BackupEntry => item !== null);
}

/** Deletes one generated backup file from the project's app-data folder. */
export async function deleteProjectBackup(projectId: string, fileName: string): Promise<void> {
  await tauriInvoke<unknown>("delete_project_backup", { projectId, fileName });
}

/** Deletes every backup for one project. A failure leaves the set listed as before. */
export async function deleteAllProjectBackups(projectId: string): Promise<void> {
  await tauriInvoke<unknown>("delete_all_project_backups", { projectId });
}

export async function readBackupText(path: string): Promise<string> {
  return readFileText(path);
}
