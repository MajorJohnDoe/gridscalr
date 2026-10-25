import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import {
  clearAutosave,
  readAutosave,
  readAutosavePreview,
  writeAutosave,
  type AutosavePayload,
} from "../src/state/autosave";

const storage = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => storage.clear(),
  key: (index: number) => [...storage.keys()][index] ?? null,
  get length() {
    return storage.size;
  },
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageStub,
});

function payload(name = "Recovery.pdf"): AutosavePayload {
  const project = createProject(defaultDocument(name, 1), createDefaultLayers());
  return {
    project,
    projectPath: "/home/ana/Recovery.gridscalr",
    savedAt: "2026-10-25T12:00:00.000Z",
  };
}

async function deleteDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("gridscalr");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

describe("autosave storage", () => {
  beforeEach(async () => {
    storage.clear();
    await deleteDatabase();
  });

  it("stores a recovery snapshot in IndexedDB and keeps a small preview", async () => {
    const value = payload();
    await writeAutosave(value);
    expect(readAutosavePreview()).toEqual({
      savedAt: value.savedAt,
      projectName: value.project.name,
    });
    const restored = await readAutosave();
    expect(restored?.project.name).toBe(value.project.name);
    expect(restored?.projectPath).toBe(value.projectPath);
    expect(storage.has("gridscalr.autosave.v1")).toBe(false);
  });

  it("migrates a legacy localStorage snapshot", async () => {
    const value = payload("Legacy.pdf");
    storage.set("gridscalr.autosave.v1", JSON.stringify(value));
    expect(readAutosavePreview()?.projectName).toBe("Legacy");
    const restored = await readAutosave();
    expect(restored?.project.name).toBe("Legacy");
    await new Promise((resolve) => setTimeout(resolve, 60));
    const fromIndexedDb = await readAutosave();
    expect(fromIndexedDb?.project.name).toBe("Legacy");
    expect(storage.has("gridscalr.autosave.v1")).toBe(false);
  });

  it("clears both the preview and the IndexedDB record", async () => {
    await writeAutosave(payload());
    await clearAutosave();
    expect(readAutosavePreview()).toBeNull();
    expect(await readAutosave()).toBeNull();
  });

  it("ignores an invalid legacy snapshot", () => {
    storage.set("gridscalr.autosave.v1", JSON.stringify({ project: { documents: [] } }));
    expect(readAutosavePreview()).toBeNull();
  });
});
