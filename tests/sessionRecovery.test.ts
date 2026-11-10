import { describe, expect, it } from "vitest";
import {
  LEASE_STALE_MS,
  classifyLease,
  collectRecoverableEntries,
  createLease,
  isLeaseStale,
  leasePath,
} from "../src/features/sessionRecovery";
import type { RecoveryRecord } from "../src/features/sessionRecovery";

const lease = {
  instanceId: "instance-a",
  projectId: "project-1",
  openedAt: 1_000,
  heartbeatAt: 1_000,
  projectSha256: "abc",
  hostLabel: "Desktop · Linux",
  appVersion: "0.22.4",
};

describe("advisory project lease", () => {
  it("lives beside the project file with a .lock suffix", () => {
    expect(leasePath("/drawings/Plan.gridscalr")).toBe("/drawings/Plan.gridscalr.lock");
  });

  it("treats five minutes without a heartbeat as the stale boundary", () => {
    expect(isLeaseStale({ ...lease, heartbeatAt: 1_000 }, 1_000 + LEASE_STALE_MS)).toBe(false);
    expect(isLeaseStale({ ...lease, heartbeatAt: 1_000 }, 1_000 + LEASE_STALE_MS + 1)).toBe(true);
  });

  it("classifies a live lease from another instance as blocking", () => {
    const read = { lease: { ...lease, heartbeatAt: 10_000 }, corrupt: false };
    expect(classifyLease(read, "instance-b", 10_000)).toBe("liveOther");
    expect(classifyLease(read, "instance-a", 10_000)).toBe("own");
  });

  it("never blocks on a stale or corrupt lease", () => {
    const stale = { lease: { ...lease, heartbeatAt: 1_000 }, corrupt: false };
    expect(classifyLease(stale, "instance-b", 1_000 + LEASE_STALE_MS + 1)).toBe("staleOther");
    expect(classifyLease({ lease: null, corrupt: true }, "instance-b")).toBe("corrupt");
    expect(classifyLease({ lease: null, corrupt: false }, "instance-b")).toBe("none");
  });

  it("creates the documented lease fields without personal data", () => {
    const created = createLease({
      instanceId: "instance-a",
      projectId: "project-1",
      projectSha256: "abc",
      hostLabel: "Desktop · Linux",
      appVersion: "0.22.4",
      now: 5_000,
    });
    expect(created).toEqual({
      instanceId: "instance-a",
      projectId: "project-1",
      openedAt: 5_000,
      heartbeatAt: 5_000,
      projectSha256: "abc",
      hostLabel: "Desktop · Linux",
      appVersion: "0.22.4",
    });
  });
});

function record(overrides: Partial<RecoveryRecord>): RecoveryRecord {
  return {
    id: "autosave:p:instance",
    kind: "autosave",
    projectId: "p",
    projectName: "Plan",
    projectPath: "/drawings/Plan.gridscalr",
    instanceId: "instance",
    baseFileSha256: "hash",
    savedAt: "2026-10-01T10:00:00.000Z",
    serialized: "{}",
    appVersion: "0.22.4",
    ...overrides,
  };
}

describe("recovery base-version comparison", () => {
  it("compares each project path with the current disk stamp", async () => {
    const entries = await collectRecoverableEntries(
      [
        record({ id: "a", savedAt: "2026-10-02T10:00:00.000Z" }),
        record({
          id: "b",
          projectPath: "/drawings/Old.gridscalr",
          savedAt: "2026-10-01T10:00:00.000Z",
        }),
        record({
          id: "c",
          projectPath: null,
          baseFileSha256: null,
          savedAt: "2026-09-01T10:00:00.000Z",
        }),
      ],
      {
        desktop: true,
        pathExists: async (path) => path !== "/drawings/Old.gridscalr",
        readStamp: async () => ({ sha256: "hash", sizeBytes: 10, modifiedAt: 1 }),
      },
    );
    expect(entries.map((entry) => [entry.record.id, entry.state])).toEqual([
      ["a", "current"],
      ["b", "missing"],
      ["c", "unsaved"],
    ]);
  });
});
