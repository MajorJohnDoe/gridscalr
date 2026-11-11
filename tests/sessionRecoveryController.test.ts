// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, defaultDocument } from "../src/model/layers";
import { store } from "../src/state/store";
import {
  clearAllRecovery,
  listRecoveryRecords,
  recordStructuralCheckpoint,
  SessionRecoveryController,
  setAutosaveEnabled,
  setAutosaveIntervalSeconds,
  setAutosavePausedForSession,
  type SessionRecoveryHost,
} from "../src/features/sessionRecovery";
import { resetAppPreferences } from "../src/io/appPreferences";
import { withTestPageIds } from "./helpers/pages";

function makeProject() {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
  project.name = "Plan";
  return project;
}

function makeHost(): SessionRecoveryHost {
  return {
    desktop: false,
    readStamp: async () => null,
    readMetadata: async () => null,
    pathExists: async () => true,
    notify: vi.fn(),
    bannerHost: document.createElement("div"),
    onReload: async () => undefined,
    onRestore: async () => true,
    onSaveCopy: () => undefined,
    onSummaryChange: vi.fn(),
  };
}

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  // Timer callbacks start the IndexedDB write without returning its promise.
  for (let index = 0; index < 8; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function recordCount(): Promise<number> {
  return (await listRecoveryRecords()).length;
}

async function latestSavedAt(): Promise<string | null> {
  const records = await listRecoveryRecords();
  return records[0]?.savedAt ?? null;
}

let controller: SessionRecoveryController | null = null;

beforeEach(async () => {
  localStorage.clear();
  resetAppPreferences();
  setAutosaveEnabled(true);
  setAutosaveIntervalSeconds(15);
  setAutosavePausedForSession(false);
  await clearAllRecovery().catch(() => undefined);
  store.setProject(makeProject(), "/drawings/Plan.gridscalr");
  // Keep real setImmediate so fake-indexeddb can complete its queued work.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(new Date("2026-11-11T10:00:00.000Z"));
});

afterEach(async () => {
  controller?.dispose();
  controller = null;
  store.closeProject();
  vi.useRealTimers();
  await clearAllRecovery().catch(() => undefined);
});

describe("session recovery autosave preference", () => {
  it("writes the first snapshot after the debounce when autosave is enabled", async () => {
    controller = new SessionRecoveryController(makeHost());
    controller.start();
    await advance(900);
    expect(await recordCount()).toBe(1);
  });

  it("writes at most once per interval while the project keeps changing", async () => {
    controller = new SessionRecoveryController(makeHost());
    controller.start();
    await advance(900);
    expect(await recordCount()).toBe(1);
    const first = await latestSavedAt();

    store.mutate((project) => {
      project.name = "Plan A";
    }, "change");
    await advance(900);
    expect(await latestSavedAt()).toBe(first);

    await advance(14_100);
    expect(await latestSavedAt()).not.toBe(first);
  });

  it("stops a pending interval as soon as autosave is turned off", async () => {
    controller = new SessionRecoveryController(makeHost());
    controller.start();
    await advance(900);
    const first = await latestSavedAt();

    store.mutate((project) => {
      project.name = "Plan B";
    }, "change");
    setAutosaveEnabled(false);
    await advance(30_000);
    expect(await latestSavedAt()).toBe(first);
  });

  it("stops a pending interval while paused and resumes from the current revision", async () => {
    controller = new SessionRecoveryController(makeHost());
    controller.start();
    await advance(900);
    const first = await latestSavedAt();

    store.mutate((project) => {
      project.name = "Plan C";
    }, "change");
    setAutosavePausedForSession(true);
    await advance(30_000);
    expect(await latestSavedAt()).toBe(first);

    setAutosavePausedForSession(false);
    await advance(900);
    expect(await latestSavedAt()).not.toBe(first);
  });

  it("applies an interval change to the next scheduled write", async () => {
    controller = new SessionRecoveryController(makeHost());
    controller.start();
    await advance(900);
    const first = await latestSavedAt();

    setAutosaveIntervalSeconds(60);
    store.mutate((project) => {
      project.name = "Plan D";
    }, "change");
    await advance(30_000);
    expect(await latestSavedAt()).toBe(first);

    await advance(30_000);
    expect(await latestSavedAt()).not.toBe(first);
  });

  it("still writes explicit structural checkpoints while autosave is off", async () => {
    controller = new SessionRecoveryController(makeHost());
    controller.start();
    setAutosaveEnabled(false);
    await advance(30_000);
    expect(await recordCount()).toBe(0);

    await recordStructuralCheckpoint("Before deleting page 1");
    const records = await listRecoveryRecords();
    expect(records).toHaveLength(1);
    expect(records[0].kind).toBe("checkpoint");
    expect(records[0].label).toBe("Before deleting page 1");
  });
});
