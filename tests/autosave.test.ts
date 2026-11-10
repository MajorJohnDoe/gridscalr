// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import type { Project } from "../src/model/types";
import {
  AUTOSAVE_RECORDS_PER_PROJECT,
  AutosaveError,
  classifyBaseVersion,
  clearAllRecovery,
  clearAutosavesForInstance,
  deleteRecoveryRecord,
  describeAutosaveFailure,
  listRecoveryRecords,
  recoverySummary,
  writeAutosaveRecord,
  writeCheckpointRecord,
} from "../src/features/sessionRecovery";

function makeProject(name: string): Project {
  const project = createProject(defaultDocument(name, 1), createDefaultLayers());
  project.name = name.replace(/\.pdf$/, "");
  return project;
}

function write(
  project: Project,
  instanceId: string,
  savedAt: string,
  baseFileSha256: string | null = null,
) {
  return writeAutosaveRecord({
    projectId: project.id,
    projectName: project.name,
    projectPath: `/drawings/${project.name}.gridscalr`,
    instanceId,
    baseFileSha256,
    savedAt,
    serialized: JSON.stringify(project),
    appVersion: "0.22.4",
  });
}

async function deleteDatabase(name = "gridscalr"): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function seedLegacyIndexedDb(project: Project): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("gridscalr", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("autosave");
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("autosave", "readwrite");
      transaction.objectStore("autosave").put(
        {
          version: 2,
          serialized: JSON.stringify(project),
          projectPath: "/drawings/Legacy.gridscalr",
          savedAt: "2026-10-01T10:00:00.000Z",
          projectName: project.name,
        },
        "current",
      );
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function legacyCurrentStillExists(): Promise<boolean> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("gridscalr", 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!database.objectStoreNames.contains("autosave")) {
    database.close();
    return false;
  }
  return new Promise<boolean>((resolve) => {
    const transaction = database.transaction("autosave", "readonly");
    const request = transaction.objectStore("autosave").get("current");
    request.onsuccess = () => resolve(Boolean(request.result));
    request.onerror = () => resolve(false);
    transaction.oncomplete = () => database.close();
  });
}

describe("scoped recovery storage", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAllRecovery().catch(() => undefined);
    await deleteDatabase();
  });

  it("keeps two projects in separate records", async () => {
    const first = makeProject("First.pdf");
    const second = makeProject("Second.pdf");
    await write(first, "instance-a", "2026-10-01T10:00:00.000Z", "hash-a");
    await write(second, "instance-b", "2026-10-01T11:00:00.000Z", "hash-b");

    const records = await listRecoveryRecords();
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.projectId).sort()).toEqual([first.id, second.id].sort());
    expect(records.every((record) => record.kind === "autosave")).toBe(true);
  });

  it("keeps the latest record per project plus one previous", async () => {
    const project = makeProject("Pruned.pdf");
    const other = makeProject("Other.pdf");
    for (let index = 0; index < AUTOSAVE_RECORDS_PER_PROJECT + 2; index += 1) {
      await write(project, `instance-${index}`, `2026-10-0${index + 1}T10:00:00.000Z`, null);
    }
    await write(other, "instance-other", "2026-10-09T10:00:00.000Z", null);

    const records = await listRecoveryRecords();
    const autosaves = records.filter((record) => record.projectId === project.id);
    expect(autosaves).toHaveLength(AUTOSAVE_RECORDS_PER_PROJECT);
    expect(autosaves[0].instanceId).toBe("instance-3");
    expect(autosaves[1].instanceId).toBe("instance-2");
    expect(records.filter((record) => record.projectId === other.id)).toHaveLength(1);
  });

  it("stores the base file hash with every record", async () => {
    const project = makeProject("Base.pdf");
    await write(project, "instance-a", "2026-10-01T10:00:00.000Z", "base-hash");
    const [record] = await listRecoveryRecords();
    expect(record.baseFileSha256).toBe("base-hash");
  });

  it("labels a record from a different file version as older", () => {
    const current = { sha256: "current", sizeBytes: 10, modifiedAt: 1 };
    expect(
      classifyBaseVersion(
        { projectPath: "/drawings/Plan.gridscalr", baseFileSha256: "current" },
        current,
        true,
      ),
    ).toBe("current");
    expect(
      classifyBaseVersion(
        { projectPath: "/drawings/Plan.gridscalr", baseFileSha256: "older" },
        current,
        true,
      ),
    ).toBe("older");
    expect(
      classifyBaseVersion(
        { projectPath: "/drawings/Plan.gridscalr", baseFileSha256: null },
        current,
        true,
      ),
    ).toBe("unknown");
    expect(
      classifyBaseVersion(
        { projectPath: "/drawings/Plan.gridscalr", baseFileSha256: "older" },
        null,
        false,
      ),
    ).toBe("missing");
    expect(classifyBaseVersion({ projectPath: null, baseFileSha256: null }, current, true)).toBe(
      "unsaved",
    );
  });

  it("retires the legacy current record into an explicit unknown-base record", async () => {
    const legacy = makeProject("Legacy.pdf");
    await seedLegacyIndexedDb(legacy);

    const records = await listRecoveryRecords();
    expect(records).toHaveLength(1);
    expect(records[0].projectId).toBe(legacy.id);
    expect(records[0].instanceId).toBe("legacy");
    expect(records[0].baseFileSha256).toBeNull();
    expect(records[0].kind).toBe("autosave");
    expect(await legacyCurrentStillExists()).toBe(false);
  });

  it("migrates a legacy localStorage snapshot instead of silently restoring it", async () => {
    const legacy = makeProject("Local legacy.pdf");
    localStorage.setItem(
      "gridscalr.autosave.v1",
      JSON.stringify({
        project: legacy,
        projectPath: "/drawings/Local legacy.gridscalr",
        savedAt: "2026-09-01T10:00:00.000Z",
      }),
    );

    const records = await listRecoveryRecords();
    expect(records).toHaveLength(1);
    expect(records[0].baseFileSha256).toBeNull();
    expect(records[0].projectName).toBe("Local legacy");
    expect(localStorage.getItem("gridscalr.autosave.v1")).toBeNull();
  });

  it("deletes one record without touching another instance or project", async () => {
    const project = makeProject("Delete.pdf");
    const other = makeProject("Keep.pdf");
    await write(project, "instance-a", "2026-10-01T10:00:00.000Z", null);
    await write(project, "instance-b", "2026-10-02T10:00:00.000Z", null);
    await write(other, "instance-c", "2026-10-03T10:00:00.000Z", null);

    const records = await listRecoveryRecords();
    const target = records.find((record) => record.instanceId === "instance-a");
    expect(target).toBeDefined();
    await deleteRecoveryRecord(target!.id);

    const remaining = await listRecoveryRecords();
    expect(remaining.map((record) => record.instanceId).sort()).toEqual([
      "instance-b",
      "instance-c",
    ]);
  });

  it("clears one instance's autosave after a successful save", async () => {
    const project = makeProject("Saved.pdf");
    await write(project, "instance-a", "2026-10-01T10:00:00.000Z", null);
    await write(project, "instance-b", "2026-10-02T10:00:00.000Z", null);

    await clearAutosavesForInstance(project.id, "instance-a");

    const records = await listRecoveryRecords();
    expect(records.map((record) => record.instanceId)).toEqual(["instance-b"]);
  });

  it("stores labelled structural checkpoints separately", async () => {
    const project = makeProject("Checkpoint.pdf");
    await write(project, "instance-a", "2026-10-01T10:00:00.000Z", "hash-a");
    await writeCheckpointRecord({
      projectId: project.id,
      projectName: project.name,
      projectPath: "/drawings/Checkpoint.gridscalr",
      instanceId: "instance-a",
      baseFileSha256: "hash-a",
      savedAt: "2026-10-01T10:05:00.000Z",
      serialized: JSON.stringify(project),
      appVersion: "0.22.4",
      label: "Before deleting page 12",
    });

    const records = await listRecoveryRecords();
    expect(records).toHaveLength(2);
    const checkpoint = records.find((record) => record.kind === "checkpoint");
    expect(checkpoint?.label).toBe("Before deleting page 12");
    expect(recoverySummary(records)).toMatchObject({ count: 1, checkpoints: 1 });
  });

  it("removes every record and both legacy keys", async () => {
    const project = makeProject("Clear.pdf");
    await write(project, "instance-a", "2026-10-01T10:00:00.000Z", null);
    localStorage.setItem("gridscalr.autosave.meta.v1", "{}");

    await clearAllRecovery();

    expect(await listRecoveryRecords()).toHaveLength(0);
    expect(localStorage.getItem("gridscalr.autosave.v1")).toBeNull();
    expect(localStorage.getItem("gridscalr.autosave.meta.v1")).toBeNull();
  });

  it("describes a full quota with the action that recovers it", () => {
    const quota = new Error("The quota has been exceeded.");
    quota.name = "QuotaExceededError";

    const described = describeAutosaveFailure(quota);

    expect(described).toBeInstanceOf(AutosaveError);
    expect(described.quotaExceeded).toBe(true);
    expect(described.message).toMatch(/local storage is full/i);
    expect(described.message).toMatch(/save the project to a file/i);
  });

  it("keeps the storage detail for failures that are not a full quota", () => {
    const described = describeAutosaveFailure(new Error("IndexedDB is not available."));

    expect(described.quotaExceeded).toBe(false);
    expect(described.message).toContain("IndexedDB is not available.");
    expect(described.message).toMatch(/save the project to a file/i);
  });
});
