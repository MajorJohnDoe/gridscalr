/** A recovery snapshot or an explicit structural checkpoint. */
export type RecoveryKind = "autosave" | "checkpoint";

/**
 * One record in the local recovery store. The record is outside the project
 * file, never part of a package and never uploaded.
 */
export interface RecoveryRecord {
  id: string;
  kind: RecoveryKind;
  projectId: string;
  projectName: string;
  projectPath: string | null;
  instanceId: string;
  baseFileSha256: string | null;
  savedAt: string;
  serialized: string;
  /** Localized label for a structural checkpoint, for example "Before deleting page 12". */
  label?: string;
  appVersion: string;
}

export interface RecoveryPreview {
  projectName: string;
  savedAt: string;
}

export interface RecoverySummary {
  count: number;
  checkpoints: number;
  latest: RecoveryPreview | null;
}

export const EMPTY_RECOVERY_SUMMARY: RecoverySummary = {
  count: 0,
  checkpoints: 0,
  latest: null,
};

export const AUTOSAVE_RECORDS_PER_PROJECT = 2;
export const CHECKPOINTS_PER_PROJECT = 10;

export function autosaveRecordId(projectId: string, instanceId: string): string {
  return `autosave:${projectId}:${instanceId}`;
}

export function newCheckpointRecordId(prefix = "checkpoint"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isRecoveryRecord(value: unknown): value is RecoveryRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<RecoveryRecord>;
  return (
    (record.kind === "autosave" || record.kind === "checkpoint") &&
    typeof record.id === "string" &&
    typeof record.projectId === "string" &&
    typeof record.projectName === "string" &&
    (record.projectPath === null || typeof record.projectPath === "string") &&
    typeof record.instanceId === "string" &&
    (record.baseFileSha256 === null || typeof record.baseFileSha256 === "string") &&
    typeof record.savedAt === "string" &&
    typeof record.serialized === "string" &&
    typeof record.appVersion === "string" &&
    (record.label === undefined || typeof record.label === "string")
  );
}

export function recoveryPreview(record: RecoveryRecord): RecoveryPreview {
  return { projectName: record.projectName, savedAt: record.savedAt };
}

/** Newest first, and autosaves before checkpoints of the same timestamp. */
export function sortRecoveryRecords(records: readonly RecoveryRecord[]): RecoveryRecord[] {
  return [...records].sort((left, right) => {
    const time = right.savedAt.localeCompare(left.savedAt);
    if (time !== 0) return time;
    if (left.kind !== right.kind) return left.kind === "autosave" ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
}
