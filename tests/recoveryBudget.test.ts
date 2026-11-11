// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOSAVE_RECORDS_PER_PROJECT,
  CHECKPOINTS_PER_PROJECT,
  RECOVERY_BUDGET,
  autosaveRecordId,
  clearAllRecovery,
  listRecoveryRecords,
  planRecoveryPrune,
  protectedRecordIds,
  recoveryUsage,
  serializedBytes,
  textBytes,
  writeAutosaveRecord,
  type RecoveryBudget,
  type RecoveryRecord,
} from "../src/features/sessionRecovery";
import { writeRecord } from "../src/features/sessionRecovery/recoveryStore";

/** A serialized snapshot of exactly `bytes` UTF-8 bytes. */
function snapshot(bytes: number): string {
  return "x".repeat(bytes);
}

function record(overrides: Partial<RecoveryRecord> & { bytes?: number }): RecoveryRecord {
  const bytes = overrides.bytes ?? 1;
  return {
    id: "autosave:p1:a",
    kind: "autosave",
    projectId: "p1",
    projectName: "Plan",
    projectPath: "/drawings/Plan.gridscalr",
    instanceId: "a",
    baseFileSha256: null,
    savedAt: "2026-10-01T10:00:00.000Z",
    serialized: snapshot(bytes),
    serializedBytes: bytes,
    appVersion: "0.23.0",
    ...overrides,
  };
}

function savedAt(day: number): string {
  return `2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`;
}

async function deleteDatabase(name = "gridscalr"): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function autosaveInput(projectId: string, instanceId: string, day: number, bytes: number) {
  return {
    projectId,
    projectName: projectId,
    projectPath: `/drawings/${projectId}.gridscalr`,
    instanceId,
    baseFileSha256: null,
    savedAt: savedAt(day),
    serialized: snapshot(bytes),
    appVersion: "0.23.0",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recovery byte budget", () => {
  it("documents defaults that leave room for repeated full-size snapshots", () => {
    // The reference large project serializes to about 8 MB; the per-project
    // budget must hold several snapshots of it and the total must hold several
    // such projects without becoming an implicit unlimited store.
    const referenceBytes = 8 * 1024 * 1024;
    expect(RECOVERY_BUDGET.projectBytes).toBeGreaterThanOrEqual(referenceBytes * 4);
    expect(RECOVERY_BUDGET.totalBytes).toBeGreaterThanOrEqual(RECOVERY_BUDGET.projectBytes * 3);
    expect(RECOVERY_BUDGET.totalBytes % (1024 * 1024)).toBe(0);
  });

  it("uses the persisted size and falls back to encoding older records", () => {
    expect(serializedBytes({ serialized: "abc", serializedBytes: 3 })).toBe(3);
    expect(serializedBytes({ serialized: "åäö" })).toBe(6);
    // Corrupt metadata is measured again rather than trusted.
    expect(serializedBytes({ serialized: "abc", serializedBytes: 1_000_000 })).toBe(3);
  });

  it("reports total and per-project size, largest project first", () => {
    const usage = recoveryUsage([
      record({ id: "a", projectId: "small", bytes: 10 }),
      record({ id: "b", projectId: "large", bytes: 100, kind: "checkpoint" }),
      record({ id: "c", projectId: "large", bytes: 50 }),
    ]);
    expect(usage.totalBytes).toBe(160);
    expect(usage.records).toBe(3);
    expect(usage.projects).toEqual([
      { projectId: "large", bytes: 150, records: 2, autosaves: 1, checkpoints: 1 },
      { projectId: "small", bytes: 10, records: 1, autosaves: 1, checkpoints: 0 },
    ]);
  });
});

describe("recovery pruning order", () => {
  it("keeps the newest autosave and the newest checkpoint of every project", () => {
    const records = [
      record({ id: "auto-new", savedAt: savedAt(5), bytes: 10 }),
      record({ id: "auto-old", savedAt: savedAt(1), bytes: 10 }),
      record({
        id: "check-new",
        kind: "checkpoint",
        savedAt: savedAt(4),
        bytes: 10,
      }),
      record({
        id: "check-old",
        kind: "checkpoint",
        savedAt: savedAt(2),
        bytes: 10,
      }),
      record({ id: "other-new", projectId: "p2", savedAt: savedAt(3), bytes: 10 }),
    ];
    expect(protectedRecordIds(records)).toEqual(new Set(["auto-new", "check-new", "other-new"]));
  });

  it("removes count overflow oldest first without touching another project", () => {
    const records: RecoveryRecord[] = [];
    for (let index = 1; index <= AUTOSAVE_RECORDS_PER_PROJECT + 2; index += 1) {
      records.push(
        record({ id: `auto-${index}`, instanceId: `i${index}`, savedAt: savedAt(index) }),
      );
    }
    for (let index = 1; index <= CHECKPOINTS_PER_PROJECT + 2; index += 1) {
      records.push(
        record({
          id: `check-${index}`,
          kind: "checkpoint",
          instanceId: `c${index}`,
          savedAt: savedAt(index),
        }),
      );
    }
    records.push(record({ id: "other", projectId: "p2", savedAt: savedAt(1) }));

    const removed = planRecoveryPrune(records);

    expect(removed).toEqual(["check-1", "check-2", "auto-1", "auto-2"]);
    expect(removed).not.toContain("other");
    expect(removed).not.toContain(`auto-${AUTOSAVE_RECORDS_PER_PROJECT + 2}`);
    expect(removed).not.toContain(`check-${CHECKPOINTS_PER_PROJECT + 2}`);
  });

  it("prunes oldest first until the per-project byte budget is met", () => {
    const budget: RecoveryBudget = { totalBytes: 10_000, projectBytes: 250 };
    const records = [
      record({ id: "newest", savedAt: savedAt(9), bytes: 100 }),
      record({ id: "old-1", savedAt: savedAt(1), bytes: 100 }),
      record({ id: "old-2", savedAt: savedAt(2), bytes: 100 }),
      record({ id: "newer", savedAt: savedAt(8), bytes: 100 }),
    ];

    const removed = planRecoveryPrune(records, { budget });

    expect(removed).toEqual(["old-1", "old-2"]);
    expect(removed).not.toContain("newest");
  });

  it("prunes checkpoints before an autosave with the same timestamp", () => {
    const budget: RecoveryBudget = { totalBytes: 10_000, projectBytes: 100 };
    const records = [
      record({ id: "auto", savedAt: savedAt(1), bytes: 50 }),
      record({ id: "auto-new", savedAt: savedAt(3), bytes: 50 }),
      record({ id: "check", kind: "checkpoint", savedAt: savedAt(1), bytes: 50 }),
      record({ id: "check-new", kind: "checkpoint", savedAt: savedAt(2), bytes: 50 }),
    ];

    expect(planRecoveryPrune(records, { budget })).toEqual(["check", "auto"]);
  });

  it("keeps the newest records even when one project alone exceeds the budget", () => {
    const budget: RecoveryBudget = { totalBytes: 100, projectBytes: 100 };
    const records = [
      record({ id: "auto-new", savedAt: savedAt(3), bytes: 200 }),
      record({ id: "auto-old", savedAt: savedAt(1), bytes: 200 }),
      record({ id: "check-new", kind: "checkpoint", savedAt: savedAt(2), bytes: 200 }),
    ];

    expect(planRecoveryPrune(records, { budget })).toEqual(["auto-old"]);
  });

  it("prunes across projects when the origin budget is exceeded", () => {
    const budget: RecoveryBudget = { totalBytes: 300, projectBytes: 300 };
    const records = [
      record({ id: "a-new", projectId: "p1", savedAt: savedAt(5), bytes: 100 }),
      record({ id: "a-old", projectId: "p1", savedAt: savedAt(1), bytes: 100 }),
      record({ id: "b-new", projectId: "p2", savedAt: savedAt(4), bytes: 100 }),
      record({ id: "b-old", projectId: "p2", savedAt: savedAt(2), bytes: 100 }),
    ];

    // The oldest record anywhere goes first; both projects keep their newest.
    expect(planRecoveryPrune(records, { budget })).toEqual(["a-old"]);
  });

  it("never prunes the record that is being written", () => {
    const budget: RecoveryBudget = { totalBytes: 100, projectBytes: 100 };
    const records = [
      record({ id: "auto-new", savedAt: savedAt(5), bytes: 100 }),
      record({ id: "auto-mid", savedAt: savedAt(3), bytes: 100 }),
      record({ id: "incoming", savedAt: savedAt(1), bytes: 100 }),
    ];

    expect(planRecoveryPrune(records, { budget, keepId: "incoming" })).toEqual(["auto-mid"]);
  });
});

describe("recovery store budget enforcement", () => {
  const megabyte = 1024 * 1024;
  const budget: RecoveryBudget = { totalBytes: 6 * megabyte, projectBytes: 3 * megabyte };

  beforeEach(async () => {
    localStorage.clear();
    await clearAllRecovery().catch(() => undefined);
    await deleteDatabase();
  });

  it("prunes before the write completes when the budget would be exceeded", async () => {
    for (let day = 1; day <= 4; day += 1) {
      await writeRecord(
        record({
          id: `autosave:p:instance-${day}`,
          instanceId: `instance-${day}`,
          savedAt: savedAt(day),
          bytes: megabyte,
        }),
        { budget },
      );
    }

    const usage = recoveryUsage(await listRecoveryRecords());
    expect(usage.totalBytes).toBeLessThanOrEqual(budget.projectBytes);
  });

  it("stays under the budget with large synthetic records and keeps the newest", async () => {
    const projectId = "large-project";
    for (let day = 1; day <= AUTOSAVE_RECORDS_PER_PROJECT + 4; day += 1) {
      await writeRecord(
        record({
          id: autosaveRecordId(projectId, `instance-${day}`),
          projectId,
          instanceId: `instance-${day}`,
          savedAt: savedAt(day),
          bytes: megabyte,
        }),
        { budget },
      );
    }
    for (let day = 1; day <= CHECKPOINTS_PER_PROJECT; day += 1) {
      await writeRecord(
        record({
          id: `checkpoint:${day}`,
          kind: "checkpoint",
          projectId,
          instanceId: `instance-${day}`,
          savedAt: savedAt(day),
          bytes: megabyte,
          label: `checkpoint ${day}`,
        }),
        { budget },
      );
    }
    await writeRecord(
      record({
        id: autosaveRecordId("other-project", "instance-other"),
        projectId: "other-project",
        instanceId: "instance-other",
        savedAt: savedAt(9),
        bytes: megabyte,
      }),
      { budget },
    );

    const records = await listRecoveryRecords();
    const usage = recoveryUsage(records);
    for (const project of usage.projects) {
      expect(project.bytes).toBeLessThanOrEqual(budget.projectBytes);
    }
    expect(usage.totalBytes).toBeLessThanOrEqual(budget.totalBytes);

    const projectRecords = records.filter((candidate) => candidate.projectId === projectId);
    const autosaves = projectRecords.filter((candidate) => candidate.kind === "autosave");
    const checkpoints = projectRecords.filter((candidate) => candidate.kind === "checkpoint");
    expect(autosaves[0].instanceId).toBe(`instance-${AUTOSAVE_RECORDS_PER_PROJECT + 4}`);
    expect(checkpoints[0].label).toBe(`checkpoint ${CHECKPOINTS_PER_PROJECT}`);
    expect(records.filter((candidate) => candidate.projectId === "other-project")).toHaveLength(1);
  });

  it("reports an actionable quota failure with a mocked full store", async () => {
    const quota = new Error("The quota has been exceeded.");
    quota.name = "QuotaExceededError";
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw quota;
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw quota;
    });

    const failure = await writeRecord(record({ id: "quota" })).catch((error) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure.name).toBe("AutosaveError");
    expect(failure.quotaExceeded).toBe(true);
    expect(failure.message).toMatch(/local storage is full/i);
    expect(failure.message).toMatch(/save the project to a file/i);
    expect(failure.message).toMatch(/recovery center/i);
  });

  it("keeps the newest autosave when a later write fails on quota", async () => {
    await writeAutosaveRecord(autosaveInput("quota-project", "instance-a", 1, 64));
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      const error = new Error("The quota has been exceeded.");
      error.name = "QuotaExceededError";
      throw error;
    });

    await writeAutosaveRecord(autosaveInput("quota-project", "instance-b", 2, 64)).catch(
      () => undefined,
    );

    const records = await listRecoveryRecords();
    expect(records.map((candidate) => candidate.instanceId)).toContain("instance-a");
  });
});

describe("persisted snapshot size", () => {
  it("writes the UTF-8 size with every record", () => {
    expect(textBytes("åäö")).toBe(6);
  });
});
