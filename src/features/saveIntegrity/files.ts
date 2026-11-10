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

/** Writes one rolling backup under the app data folder, keyed by project id. */
export async function saveProjectBackup(projectId: string, contents: string): Promise<BackupEntry> {
  const entry = record(await tauriInvoke<unknown>("save_project_backup", { projectId, contents }));
  if (
    !entry ||
    typeof entry.path !== "string" ||
    typeof entry.fileName !== "string" ||
    typeof entry.sizeBytes !== "number" ||
    typeof entry.modifiedAt !== "number"
  ) {
    throw new Error(t("saveIntegrity.backupFailed"));
  }
  return {
    path: entry.path,
    fileName: entry.fileName,
    sizeBytes: entry.sizeBytes,
    modifiedAt: entry.modifiedAt,
  };
}

export async function listProjectBackups(projectId: string): Promise<BackupEntry[]> {
  const result = await tauriInvoke<unknown>("list_project_backups", { projectId });
  if (!Array.isArray(result)) return [];
  return result
    .map((item) => record(item))
    .filter((item): item is Record<string, unknown> => item !== null)
    .map((item) => ({
      path: String(item.path ?? ""),
      fileName: String(item.fileName ?? ""),
      sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : 0,
      modifiedAt: typeof item.modifiedAt === "number" ? item.modifiedAt : 0,
    }))
    .filter((item) => Boolean(item.path));
}

export async function readBackupText(path: string): Promise<string> {
  return readFileText(path);
}
