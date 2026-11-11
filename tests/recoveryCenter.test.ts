// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAllRecovery,
  collectRecoverableEntries,
  defaultCenterSelection,
  deleteRecoveryRecord,
  groupRecoveryEntries,
  listRecoveryRecords,
  needsRestoreConfirmation,
  serializedBytes,
  showRecoveryCenter,
  writeAutosaveRecord,
} from "../src/features/sessionRecovery";
import type { RecoverableEntry, RecoveryRecord } from "../src/features/sessionRecovery";
import { t } from "../src/i18n";

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
    appVersion: "0.23.0",
    ...overrides,
  };
}

function entry(overrides: Partial<RecoveryRecord>): RecoverableEntry {
  return { record: record(overrides), state: "current" };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function footerButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>(".modal-footer button")].find(
    (button) => button.textContent === label,
  );
}

afterEach(async () => {
  document.querySelectorAll(".modal-backdrop").forEach((node) => node.remove());
  document.body.replaceChildren();
  await clearAllRecovery().catch(() => undefined);
});

describe("recovery center model", () => {
  it("groups records per project and per app instance, newest first", () => {
    const groups = groupRecoveryEntries([
      entry({
        id: "a",
        projectId: "p1",
        projectName: "Plan",
        instanceId: "instance-1",
        savedAt: "2026-10-03T10:00:00.000Z",
      }),
      entry({
        id: "b",
        projectId: "p1",
        projectName: "Plan",
        instanceId: "instance-2",
        savedAt: "2026-10-02T10:00:00.000Z",
      }),
      entry({
        id: "c",
        projectId: "p2",
        projectName: "Site",
        projectPath: null,
        savedAt: "2026-10-01T10:00:00.000Z",
      }),
    ]);
    expect(groups.map((group) => [group.projectId, group.count, group.instances.length])).toEqual([
      ["p1", 2, 2],
      ["p2", 1, 1],
    ]);
    expect(groups[0].instances.map((instance) => instance.instanceId)).toEqual([
      "instance-1",
      "instance-2",
    ]);
    expect(groups[1].projectPath).toBeNull();
  });

  it("keeps the newest project name and the first known path", () => {
    const groups = groupRecoveryEntries([
      entry({
        id: "new",
        projectId: "p1",
        projectName: "Renamed plan",
        projectPath: null,
        savedAt: "2026-10-03T10:00:00.000Z",
      }),
      entry({
        id: "old",
        projectId: "p1",
        projectName: "Old name",
        projectPath: "/drawings/Plan.gridscalr",
        savedAt: "2026-10-01T10:00:00.000Z",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].projectName).toBe("Renamed plan");
    expect(groups[0].projectPath).toBe("/drawings/Plan.gridscalr");
  });

  it("measures the UTF-8 bytes that the store holds", () => {
    expect(serializedBytes(record({ serialized: "abc" }))).toBe(3);
    expect(serializedBytes(record({ serialized: "åäö" }))).toBe(6);
  });

  it("selects the preferred record when it still exists and the first otherwise", () => {
    const groups = groupRecoveryEntries([entry({ id: "a" }), entry({ id: "b" })]);
    expect(defaultCenterSelection(groups, "b")).toBe("b");
    expect(defaultCenterSelection(groups, "missing")).toBe("a");
    expect(defaultCenterSelection([], "a")).toBeNull();
  });

  it("requires a warning for a record that is not based on the current file", () => {
    expect(needsRestoreConfirmation("older")).toBe(true);
    expect(needsRestoreConfirmation("unknown")).toBe(true);
    expect(needsRestoreConfirmation("missing")).toBe(true);
    expect(needsRestoreConfirmation("current")).toBe(false);
    expect(needsRestoreConfirmation("unsaved")).toBe(false);
  });
});

describe("recovery center base-version labels", () => {
  it("labels a changed disk file as older and a matching hash as current", async () => {
    const entries = await collectRecoverableEntries(
      [
        record({ id: "same", baseFileSha256: "hash", savedAt: "2026-10-02T10:00:00.000Z" }),
        record({
          id: "changed",
          baseFileSha256: "old-hash",
          savedAt: "2026-10-01T10:00:00.000Z",
        }),
      ],
      {
        desktop: true,
        pathExists: async () => true,
        readStamp: async () => ({ sha256: "hash", sizeBytes: 12, modifiedAt: 1 }),
      },
    );
    expect(entries.map((item) => [item.record.id, item.state])).toEqual([
      ["same", "current"],
      ["changed", "older"],
    ]);
  });
});

describe("recovery center deletion isolation", () => {
  beforeEach(async () => {
    await clearAllRecovery().catch(() => undefined);
  });

  it("removes only the selected record", async () => {
    const input = (instanceId: string, savedAt: string) => ({
      projectId: "p1",
      projectName: "Plan",
      projectPath: "/drawings/Plan.gridscalr",
      instanceId,
      baseFileSha256: "hash",
      savedAt,
      serialized: JSON.stringify({ instanceId }),
      appVersion: "0.23.0",
    });
    await writeAutosaveRecord(input("instance-1", "2026-10-02T10:00:00.000Z"));
    await writeAutosaveRecord(input("instance-2", "2026-10-01T10:00:00.000Z"));
    const before = await listRecoveryRecords();
    expect(before).toHaveLength(2);

    await deleteRecoveryRecord(before[0].id);
    const after = await listRecoveryRecords();
    expect(after.map((item) => item.id)).toEqual([before[1].id]);
  });
});

describe("recovery center dialog", () => {
  it("shows an empty state and changes nothing when closed", async () => {
    const result = showRecoveryCenter([]);
    await nextFrame();
    const empty = document.querySelector(".recovery-empty");
    expect(empty?.textContent).toContain(t("recoveryCenter.emptyTitle"));
    expect(empty?.textContent).toContain(t("recoveryCenter.emptyNote"));
    expect(document.querySelectorAll(".recovery-row")).toHaveLength(0);

    footerButton(t("common.close"))?.click();
    await expect(result).resolves.toEqual({ action: "cancel", record: null });
  });

  it("returns only the selected record", async () => {
    const entries = [
      entry({ id: "first", savedAt: "2026-10-02T10:00:00.000Z" }),
      entry({ id: "second", savedAt: "2026-10-01T10:00:00.000Z" }),
    ];
    const result = showRecoveryCenter(entries);
    await nextFrame();
    const radios = [
      ...document.querySelectorAll<HTMLInputElement>('input[name="recovery-center-choice"]'),
    ];
    expect(radios).toHaveLength(2);
    expect(radios[0].checked).toBe(true);

    radios[1].checked = true;
    radios[1].dispatchEvent(new Event("change", { bubbles: true }));
    footerButton(t("recoveryCenter.restoreSelected"))?.click();
    await expect(result).resolves.toMatchObject({ action: "restore", record: { id: "second" } });
  });

  it("returns the selected record for delete without touching the other one", async () => {
    const entries = [entry({ id: "first" }), entry({ id: "second" })];
    const result = showRecoveryCenter(entries);
    await nextFrame();
    const radio = document.querySelector<HTMLInputElement>(
      'input[name="recovery-center-choice"][value="first"]',
    );
    radio?.click();
    footerButton(t("recoveryCenter.deleteSelected"))?.click();
    await expect(result).resolves.toMatchObject({ action: "delete", record: { id: "first" } });
    expect(entries.map((item) => item.record.id)).toEqual(["first", "second"]);
  });
});
