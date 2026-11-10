import type { ProjectFileStamp } from "../saveIntegrity";
import {
  EMPTY_RECOVERY_SUMMARY,
  recoveryPreview,
  sortRecoveryRecords,
  type RecoveryRecord,
  type RecoverySummary,
} from "./record";

export type BaseVersionState = "current" | "older" | "unknown" | "missing" | "unsaved";

export interface RecoverableEntry {
  record: RecoveryRecord;
  state: BaseVersionState;
}

export interface StampReader {
  readStamp: (path: string) => Promise<ProjectFileStamp | null>;
  pathExists: (path: string) => Promise<boolean>;
  desktop: boolean;
}

/**
 * Compares the base file hash stored with a recovery record against the file
 * that is on disk now. Only a matching hash is ever offered as current; every
 * other result requires an explicit choice in the recovery chooser.
 */
export function classifyBaseVersion(
  record: Pick<RecoveryRecord, "projectPath" | "baseFileSha256">,
  current: ProjectFileStamp | null,
  fileExists: boolean,
): BaseVersionState {
  if (!record.projectPath) return "unsaved";
  if (!fileExists) return "missing";
  if (!record.baseFileSha256) return "unknown";
  if (!current) return "unknown";
  return record.baseFileSha256.toLowerCase() === current.sha256.toLowerCase() ? "current" : "older";
}

export function isBasedOnOlderFile(entry: RecoverableEntry): boolean {
  return entry.state === "older" || entry.state === "unknown";
}

export async function collectRecoverableEntries(
  records: readonly RecoveryRecord[],
  reader: StampReader,
): Promise<RecoverableEntry[]> {
  const stamps = new Map<string, ProjectFileStamp | null>();
  const exists = new Map<string, boolean>();
  const entries: RecoverableEntry[] = [];
  for (const record of sortRecoveryRecords(records)) {
    const path = record.projectPath;
    if (!path || !reader.desktop) {
      entries.push({ record, state: path ? "unknown" : "unsaved" });
      continue;
    }
    let fileExists = exists.get(path);
    if (fileExists === undefined) {
      fileExists = await reader.pathExists(path).catch(() => false);
      exists.set(path, fileExists);
    }
    if (!fileExists) {
      entries.push({ record, state: "missing" });
      continue;
    }
    let stamp = stamps.get(path);
    if (stamp === undefined) {
      stamp = await reader.readStamp(path).catch(() => null);
      stamps.set(path, stamp);
    }
    entries.push({ record, state: classifyBaseVersion(record, stamp, true) });
  }
  return entries;
}

export function recoverySummary(records: readonly RecoveryRecord[]): RecoverySummary {
  if (!records.length) return EMPTY_RECOVERY_SUMMARY;
  const sorted = sortRecoveryRecords(records);
  return {
    count: sorted.filter((record) => record.kind === "autosave").length,
    checkpoints: sorted.filter((record) => record.kind === "checkpoint").length,
    latest: recoveryPreview(sorted[0]),
  };
}
