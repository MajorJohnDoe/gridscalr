import {
  AUTOSAVE_RECORDS_PER_PROJECT,
  CHECKPOINTS_PER_PROJECT,
  sortRecoveryRecords,
} from "./record";
import type { RecoveryKind, RecoveryRecord } from "./record";

/**
 * Local recovery storage limits. The per-origin budget keeps the whole recovery
 * database below a predictable share of a finite IndexedDB quota, and the
 * per-project budget stops one large project from crowding out every other.
 * The values are documented in `docs/limitations.md`.
 */
export interface RecoveryBudget {
  /** Whole recovery store on this origin. */
  totalBytes: number;
  /** All records of one project. */
  projectBytes: number;
}

export const RECOVERY_BUDGET: RecoveryBudget = {
  totalBytes: 256 * 1024 * 1024,
  projectBytes: 64 * 1024 * 1024,
};

/** UTF-8 bytes of one serialized snapshot, the part the store actually holds. */
export function textBytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/**
 * Snapshot size in bytes. New records persist the value at write time; older
 * records fall back to encoding once, so a list can still show a size.
 */
export function serializedBytes(
  record: Pick<RecoveryRecord, "serialized" | "serializedBytes">,
): number {
  const stored = record.serializedBytes;
  // A stored value can never exceed three UTF-8 bytes per UTF-16 code unit;
  // anything larger is corrupt metadata, so the snapshot is measured again.
  if (
    typeof stored === "number" &&
    Number.isFinite(stored) &&
    stored >= 0 &&
    stored <= record.serialized.length * 3
  ) {
    return Math.trunc(stored);
  }
  return textBytes(record.serialized);
}

export interface RecoveryProjectUsage {
  projectId: string;
  bytes: number;
  records: number;
  autosaves: number;
  checkpoints: number;
}

export interface RecoveryUsage {
  totalBytes: number;
  records: number;
  /** Largest first, so the reporting order is stable and useful. */
  projects: RecoveryProjectUsage[];
}

export const EMPTY_RECOVERY_USAGE: RecoveryUsage = { totalBytes: 0, records: 0, projects: [] };

/** Storage footprint per project plus the store total. */
export function recoveryUsage(records: readonly RecoveryRecord[]): RecoveryUsage {
  const projects = new Map<string, RecoveryProjectUsage>();
  let totalBytes = 0;
  for (const record of records) {
    const bytes = serializedBytes(record);
    totalBytes += bytes;
    let usage = projects.get(record.projectId);
    if (!usage) {
      usage = { projectId: record.projectId, bytes: 0, records: 0, autosaves: 0, checkpoints: 0 };
      projects.set(record.projectId, usage);
    }
    usage.bytes += bytes;
    usage.records += 1;
    if (record.kind === "autosave") usage.autosaves += 1;
    else usage.checkpoints += 1;
  }
  return {
    totalBytes,
    records: records.length,
    projects: [...projects.values()].sort(
      (left, right) => right.bytes - left.bytes || left.projectId.localeCompare(right.projectId),
    ),
  };
}

/** Bytes per project, for the pruning loop. */
function projectByteTotals(records: readonly RecoveryRecord[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const record of records) {
    totals.set(record.projectId, (totals.get(record.projectId) ?? 0) + serializedBytes(record));
  }
  return totals;
}

/**
 * The newest autosave and the newest checkpoint of every project are never
 * removed by normal rotation. They are the two records a recovery is actually
 * made from, and a project can be larger than the whole budget by itself.
 */
export function protectedRecordIds(records: readonly RecoveryRecord[]): Set<string> {
  const newest = new Map<string, string>();
  for (const record of sortRecoveryRecords(records)) {
    const key = `${record.projectId}|${record.kind}`;
    if (!newest.has(key)) newest.set(key, record.id);
  }
  return new Set(newest.values());
}

export interface RecoveryPruneOptions {
  budget?: RecoveryBudget;
  /** A record that is being written now and must survive its own rotation. */
  keepId?: string | null;
}

const COUNT_CAPS: Record<RecoveryKind, number> = {
  autosave: AUTOSAVE_RECORDS_PER_PROJECT,
  checkpoint: CHECKPOINTS_PER_PROJECT,
};

interface PruneState {
  records: Map<string, RecoveryRecord>;
  totalBytes: number;
  projectBytes: Map<string, number>;
}

function removeRecord(state: PruneState, record: RecoveryRecord): void {
  if (!state.records.delete(record.id)) return;
  const bytes = serializedBytes(record);
  state.totalBytes -= bytes;
  state.projectBytes.set(record.projectId, (state.projectBytes.get(record.projectId) ?? 0) - bytes);
}

function withinBudget(state: PruneState, budget: RecoveryBudget): boolean {
  if (state.totalBytes > budget.totalBytes) return false;
  for (const bytes of state.projectBytes.values()) {
    if (bytes > budget.projectBytes) return false;
  }
  return true;
}

/**
 * Count rotation first (the historical two autosaves and ten checkpoints), then
 * the byte budget. Within one step the oldest record goes first; at the same
 * timestamp a checkpoint is worth less than an autosave of the same project, so
 * the checkpoint is removed first. Returns the ids to delete in removal order.
 */
export function planRecoveryPrune(
  records: readonly RecoveryRecord[],
  options: RecoveryPruneOptions = {},
): string[] {
  const budget = options.budget ?? RECOVERY_BUDGET;
  const protectedIds = protectedRecordIds(records);
  if (options.keepId) protectedIds.add(options.keepId);

  const state: PruneState = {
    records: new Map(records.map((record) => [record.id, record])),
    totalBytes: 0,
    projectBytes: projectByteTotals(records),
  };
  for (const record of records) state.totalBytes += serializedBytes(record);

  const removed: string[] = [];

  // Count rotation per project and kind, oldest first.
  const groups = new Map<string, RecoveryRecord[]>();
  for (const record of sortRecoveryRecords(records)) {
    const key = `${record.projectId}|${record.kind}`;
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }
  for (const group of groups.values()) {
    const cap = COUNT_CAPS[group[0].kind];
    // `group` is newest first, so its tail is the oldest overflow; reverse it
    // so the removal list itself is ordered oldest first.
    for (const record of group.slice(cap).reverse()) {
      if (protectedIds.has(record.id)) continue;
      removeRecord(state, record);
      removed.push(record.id);
    }
  }

  if (withinBudget(state, budget)) return removed;

  // Oldest or lowest-value first, never a protected record.
  const candidates = [...state.records.values()].sort((left, right) => {
    const byTime = left.savedAt.localeCompare(right.savedAt);
    if (byTime !== 0) return byTime;
    if (left.kind !== right.kind) return left.kind === "checkpoint" ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
  for (const record of candidates) {
    if (withinBudget(state, budget)) break;
    if (protectedIds.has(record.id)) continue;
    removeRecord(state, record);
    removed.push(record.id);
  }
  return removed;
}
