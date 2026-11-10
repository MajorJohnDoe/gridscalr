// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  BACKUP_LIMIT,
  backupFileName,
  backupProjectNow,
  classifyConflict,
  conflictedCopyPath,
  isNoOpSave,
  newestBackupNames,
  ProjectWriteConflictError,
  restoreProjectBackup,
  saveProjectWithIntegrity,
  sameFileVersion,
  type BackupEntry,
  type ProjectFileStamp,
  type SaveIntegrityPorts,
} from "../src/features/saveIntegrity";
import { parseProject, serializeProject } from "../src/io/projectFile";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import type { Project } from "../src/model/types";
import { store } from "../src/state/store";

function stampFor(contents: string): ProjectFileStamp {
  const bytes = Buffer.from(contents, "utf8");
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
    modifiedAt: 1_700_000_000_000,
  };
}

function makeProject(): Project {
  const project = createProject(defaultDocument("Plan.pdf", 2), createDefaultLayers());
  project.name = "Test project";
  project.documents[0].path = "/drawings/Plan.pdf";
  project.documents[0].relativePath = "old-value";
  return project;
}

interface FakeState {
  disk: Map<string, string>;
  wrote: Array<{ path: string; contents: string; expected: string | null }>;
  loadedText: Array<{ text: string; path: string | null }>;
  loadedData: Array<{ project: Project; path: string | null; dirty: boolean }>;
  backups: Array<{ projectId: string; contents: string }>;
  notifications: string[];
  errors: string[];
  diskStamp: ProjectFileStamp | null;
  conflictAction: "conflicted-copy" | "compare" | "reload" | "overwrite" | "cancel";
  writeError: Error | null;
}

function fakePorts(state: FakeState): SaveIntegrityPorts {
  return {
    desktop: true,
    chooseSavePath: async () => "/work/new-project.gridscalr",
    readStamp: async (path) => {
      if (state.diskStamp) return state.diskStamp;
      const contents = state.disk.get(path);
      return contents ? stampFor(contents) : null;
    },
    write: async (path, contents, expected) => {
      if (state.writeError) throw state.writeError;
      state.wrote.push({ path, contents, expected });
      state.disk.set(path, contents);
      return stampFor(contents);
    },
    pathExists: async (path) =>
      state.disk.has(path) || state.wrote.some((item) => item.path === path),
    readText: async (path) => {
      const backup = /^\/backups\/(\d+)\.gridscalr$/.exec(path);
      if (backup) {
        const entry = state.backups[Number(backup[1])];
        if (!entry) throw new Error("missing backup");
        return entry.contents;
      }
      const contents = state.disk.get(path);
      if (contents === undefined) throw new Error("missing");
      return contents;
    },
    browserSave: async () => true,
    loadProjectText: async (text, path) => {
      state.loadedText.push({ text, path });
      return true;
    },
    loadProjectData: async (project, path, dirty) => {
      state.loadedData.push({ project, path, dirty });
      return true;
    },
    afterSave: () => undefined,
    notify: (message) => {
      state.notifications.push(message);
    },
    notifyError: (title, message) => {
      state.errors.push(`${title}: ${message}`);
    },
    conflict: async () => state.conflictAction,
    compare: async () => undefined,
    chooseBackup: async () => (state.backups.length ? "/backups/0.gridscalr" : null),
    listBackups: async () =>
      state.backups.map((entry, index) => ({
        path: `/backups/${index}.gridscalr`,
        fileName: `/backups/${index}.gridscalr`,
        sizeBytes: entry.contents.length,
        modifiedAt: index,
      })) satisfies BackupEntry[],
    saveBackup: async (projectId, contents) => {
      state.backups.push({ projectId, contents });
    },
  };
}

function state(): FakeState {
  return {
    disk: new Map(),
    wrote: [],
    loadedText: [],
    loadedData: [],
    backups: [],
    notifications: [],
    errors: [],
    diskStamp: null,
    conflictAction: "cancel",
    writeError: null,
  };
}

beforeEach(() => {
  store.project = null;
  store.projectPath = null;
  store.fileStamp = null;
  store.dirty = false;
});

describe("file stamps and conflict names", () => {
  it("treats the hash and size as the file version", () => {
    const stamp = stampFor("project");
    expect(sameFileVersion(stamp, { ...stamp, modifiedAt: 5 })).toBe(true);
    expect(sameFileVersion(stamp, { ...stamp, sha256: "other" })).toBe(false);
    expect(sameFileVersion(null, stamp)).toBe(false);
  });

  it("classifies missing and changed targets as conflicts", () => {
    const stamp = stampFor("project");
    expect(classifyConflict(stamp, stamp)).toBe("clean");
    expect(classifyConflict(stamp, { ...stamp, sha256: "changed" })).toBe("conflict");
    expect(classifyConflict(stamp, null)).toBe("missing");
    expect(classifyConflict(null, stamp)).toBe("conflict");
  });

  it("builds the documented conflicted-copy name and disambiguates collisions", () => {
    const date = new Date(2026, 10, 10, 13, 45);
    expect(conflictedCopyPath("/work/Plan.gridscalr", date)).toBe(
      "/work/Plan (conflicted copy 2026-11-10 1345).gridscalr",
    );
    expect(conflictedCopyPath("C:\\work\\Plan.gridscalr", date, 2)).toBe(
      "C:\\work\\Plan (conflicted copy 2026-11-10 1345 2).gridscalr",
    );
  });

  it("skips a no-op save only when a path and no dirty changes exist", () => {
    expect(isNoOpSave(false, false, true)).toBe(true);
    expect(isNoOpSave(true, false, true)).toBe(false);
    expect(isNoOpSave(false, true, true)).toBe(false);
    expect(isNoOpSave(false, false, false)).toBe(false);
  });

  it("keeps only the newest rolling backups", () => {
    expect(newestBackupNames(["a", "b", "c", "d"], 3)).toEqual(["b", "c", "d"]);
    expect(BACKUP_LIMIT).toBe(3);
    expect(backupFileName(1700000000000)).toBe("backup-1700000000000.gridscalr");
  });
});

describe("safe save", () => {
  it("does not rewrite an unchanged project", async () => {
    store.project = makeProject();
    store.projectPath = "/work/Test project.gridscalr";
    store.fileStamp = stampFor("on disk");
    const fake = state();
    fake.disk.set("/work/Test project.gridscalr", "on disk");
    const ports = fakePorts(fake);

    expect(await saveProjectWithIntegrity(ports, false)).toBe(true);
    expect(fake.wrote).toHaveLength(0);
    expect(fake.notifications).toHaveLength(1);
  });

  it("saves a conflicted copy when the disk file changed and keeps both versions", async () => {
    store.project = makeProject();
    store.projectPath = "/work/Test project.gridscalr";
    store.fileStamp = stampFor("loaded version");
    store.dirty = true;
    const fake = state();
    fake.disk.set("/work/Test project.gridscalr", "disk version");
    fake.diskStamp = stampFor("disk version");
    fake.conflictAction = "conflicted-copy";
    const ports = fakePorts(fake);

    expect(await saveProjectWithIntegrity(ports, false)).toBe(true);
    expect(fake.disk.get("/work/Test project.gridscalr")).toBe("disk version");
    expect(fake.wrote).toHaveLength(1);
    expect(fake.wrote[0].path).toMatch(
      /\/work\/Test project \(conflicted copy \d{4}-\d{2}-\d{2} \d{4}\)\.gridscalr$/,
    );
    expect(fake.wrote[0].contents).toContain("Test project");
    expect(store.projectPath).toBe("/work/Test project.gridscalr");
    expect(store.dirty).toBe(true);
  });

  it("overwrites only after the explicit conflict action", async () => {
    store.project = makeProject();
    store.projectPath = "/work/Test project.gridscalr";
    store.fileStamp = stampFor("loaded version");
    store.dirty = true;
    const fake = state();
    fake.disk.set("/work/Test project.gridscalr", "disk version");
    fake.diskStamp = stampFor("disk version");
    fake.conflictAction = "overwrite";
    const ports = fakePorts(fake);

    expect(await saveProjectWithIntegrity(ports, false)).toBe(true);
    expect(fake.wrote).toHaveLength(1);
    expect(fake.wrote[0].path).toBe("/work/Test project.gridscalr");
    expect(fake.wrote[0].expected).toBeNull();
    expect(fake.disk.get("/work/Test project.gridscalr")).toContain("Test project");
    expect(store.dirty).toBe(false);
    expect(store.fileStamp?.sha256).toBe(
      stampFor(fake.disk.get("/work/Test project.gridscalr")!).sha256,
    );
  });

  it("reloads the disk version after the explicit conflict action", async () => {
    store.project = makeProject();
    store.projectPath = "/work/Test project.gridscalr";
    store.fileStamp = stampFor("loaded version");
    store.dirty = true;
    const fake = state();
    fake.disk.set("/work/Test project.gridscalr", "disk version");
    fake.diskStamp = stampFor("disk version");
    fake.conflictAction = "reload";
    const ports = fakePorts(fake);

    expect(await saveProjectWithIntegrity(ports, false)).toBe(true);
    expect(fake.loadedText).toEqual([
      { text: "disk version", path: "/work/Test project.gridscalr" },
    ]);
    expect(fake.wrote).toHaveLength(0);
    expect(store.dirty).toBe(false);
  });

  it("resolves a conditional-write race through the same conflict dialog", async () => {
    store.project = makeProject();
    store.projectPath = "/work/Test project.gridscalr";
    store.fileStamp = stampFor("loaded version");
    store.dirty = true;
    const fake = state();
    fake.disk.set("/work/Test project.gridscalr", "loaded version");
    fake.diskStamp = stampFor("loaded version");
    fake.writeError = new ProjectWriteConflictError(stampFor("changed meanwhile"));
    fake.conflictAction = "cancel";
    const ports = fakePorts(fake);

    expect(await saveProjectWithIntegrity(ports, false)).toBe(false);
    expect(fake.wrote).toHaveLength(0);
    expect(store.dirty).toBe(true);
  });

  it("restores relative document paths after a failed write", async () => {
    store.project = makeProject();
    store.projectPath = "/work/Test project.gridscalr";
    store.fileStamp = stampFor("disk version");
    store.dirty = true;
    const fake = state();
    fake.disk.set("/work/Test project.gridscalr", "disk version");
    fake.diskStamp = stampFor("disk version");
    fake.writeError = new Error("disk full");
    const ports = fakePorts(fake);

    expect(await saveProjectWithIntegrity(ports, false)).toBe(false);
    expect(store.project.documents[0].relativePath).toBe("old-value");
    expect(store.dirty).toBe(true);
    expect(fake.errors).toHaveLength(1);
  });

  it("does not persist the runtime stamp and still loads schema 23", () => {
    const fixture = readFileSync(resolve("fixtures/demo-project.gridscalr"), "utf8");
    const project = parseProject(fixture);
    expect(project).toBeTruthy();
    store.project = project;
    store.fileStamp = stampFor("disk version");
    expect(serializeProject(store.project)).not.toContain("fileStamp");
  });

  it("validates serialization before the browser download", async () => {
    store.project = makeProject();
    store.dirty = true;
    const fake = state();
    let downloaded = "";
    const ports: SaveIntegrityPorts = {
      ...fakePorts(fake),
      desktop: false,
      browserSave: async (contents) => {
        downloaded = contents;
        return true;
      },
    };
    expect(await saveProjectWithIntegrity(ports, false)).toBe(true);
    expect(parseProject(downloaded).name).toBe("Test project");
    expect(store.projectPath).toBeNull();
    expect(store.fileStamp).toBeNull();
  });
});

describe("backups", () => {
  it("writes a manual backup under the project id", async () => {
    store.project = makeProject();
    const fake = state();
    const ports = fakePorts(fake);
    expect(await backupProjectNow(ports)).toBe(true);
    expect(fake.backups).toHaveLength(1);
    expect(fake.backups[0].projectId).toBe(store.project.id);
  });

  it("restores a backup as an unsaved copy without changing the project path", async () => {
    store.project = makeProject();
    store.projectPath = "/work/Test project.gridscalr";
    const fake = state();
    const backupProject = makeProject();
    backupProject.name = "Older backup";
    fake.backups.push({ projectId: store.project.id, contents: serializeProject(backupProject) });
    const ports = fakePorts(fake);

    expect(await restoreProjectBackup(ports)).toBe(true);
    expect(fake.loadedData).toHaveLength(1);
    expect(fake.loadedData[0].path).toBeNull();
    expect(fake.loadedData[0].dirty).toBe(true);
    expect(fake.loadedData[0].project.name).toBe("Older backup");
    expect(store.projectPath).toBe("/work/Test project.gridscalr");
  });
});
