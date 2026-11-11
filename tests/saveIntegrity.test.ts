// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { pageIdFor, withTestPageIds } from "./helpers/pages";
import {
  BACKUP_LIMIT,
  backupFileName,
  backupProjectNow,
  classifyConflict,
  conflictedCopyPath,
  defaultConflictAction,
  isNoOpSave,
  newestBackupNames,
  ProjectWriteConflictError,
  saveProjectWithIntegrity,
  sameFileVersion,
  type BackupEntry,
  type ConflictComparisonInfo,
  type ProjectFileStamp,
  type SaveIntegrityPorts,
} from "../src/features/saveIntegrity";
import { parseProject, serializeProject } from "../src/io/projectFile";
import { createProject, defaultDocument } from "../src/model/layers";
import type { MarkupItem, Project } from "../src/model/types";
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
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 2)));
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
  backups: Array<{
    projectId: string;
    contents: string;
    projectPath: string | null;
    retention: number;
  }>;
  notifications: string[];
  errors: string[];
  diskStamp: ProjectFileStamp | null;
  conflictAction: "conflicted-copy" | "compare" | "reload" | "overwrite" | "cancel";
  conflictQueue: Array<"conflicted-copy" | "compare" | "reload" | "overwrite" | "cancel">;
  comparisons: ConflictComparisonInfo[];
  writeError: Error | null;
  validationReports: number;
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
    locateDrawing: async () => null,
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
    conflict: async () => state.conflictQueue.shift() ?? state.conflictAction,
    compare: async (info) => {
      state.comparisons.push(info);
    },
    confirmValidationWarnings: async () => true,
    reportValidationErrors: async () => {
      state.validationReports += 1;
    },
    backupRetention: () => 3,
    listBackups: async () =>
      state.backups.map((entry, index) => ({
        path: `/backups/${index}.gridscalr`,
        fileName: `backup-${index}.gridscalr`,
        sizeBytes: entry.contents.length,
        modifiedAt: index,
        projectPath: "/work/Test project.gridscalr",
      })) satisfies BackupEntry[],
    saveBackup: async (projectId, contents, projectPath, retention) => {
      state.backups.push({ projectId, contents, projectPath, retention });
    },
    deleteBackup: async () => undefined,
    deleteAllBackups: async () => undefined,
    confirm: async () => true,
    confirmDiscard: async () => true,
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
    conflictQueue: [],
    comparisons: [],
    writeError: null,
    validationReports: 0,
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

  it("blocks a normal save when a reference is dangling", async () => {
    store.project = makeProject();
    const measure = store.project.layers.find((layer) => layer.kind === "measure")!;
    const dangling: MarkupItem = {
      id: "item_dangling",
      pageId: "page_missing",
      kind: "length",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      color: "#4cc9f0",
      strokeWidth: 2,
      categoryId: store.project.settings.quantity.defaultCategoryId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    measure.items.push(dangling);
    store.projectPath = "/work/Test project.gridscalr";
    store.fileStamp = stampFor("on disk");
    store.dirty = true;
    const fake = state();
    fake.disk.set("/work/Test project.gridscalr", "on disk");
    const ports = fakePorts(fake);

    expect(await saveProjectWithIntegrity(ports, false)).toBe(false);
    expect(fake.validationReports).toBe(1);
    expect(fake.wrote).toHaveLength(0);
    expect(fake.disk.get("/work/Test project.gridscalr")).toBe("on disk");
    expect(store.dirty).toBe(true);
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
});

describe("compare with disk version", () => {
  const timestamp = "2026-01-01T00:00:00.000Z";

  function makeItem(overrides: Partial<MarkupItem>): MarkupItem {
    return {
      id: "item_compare",
      pageId: pageIdFor(1),
      kind: "length",
      points: [
        { x: 10, y: 10 },
        { x: 110, y: 10 },
      ],
      color: "#e5484d",
      strokeWidth: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides,
    };
  }

  function localProject(): Project {
    const project = makeProject();
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    measure.items.push(
      makeItem({ id: "item_length", kind: "length", label: "Wall A" }),
      makeItem({
        id: "item_count",
        kind: "count",
        points: [{ x: 40, y: 40 }],
        countType: "door",
        countQuantity: 2,
      }),
    );
    for (const item of measure.items) {
      item.categoryId = project.settings.quantity.defaultCategoryId;
    }
    return project;
  }

  function diskProject(): Project {
    const project = parseProject(serializeProject(localProject()));
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    const length = measure.items.find((item) => item.id === "item_length")!;
    length.label = "Wall A revised";
    length.pageId = pageIdFor(2);
    const count = measure.items.find((item) => item.id === "item_count")!;
    count.countQuantity = 5;
    project.pages.push({
      id: "page_extra",
      documentId: project.documents[0].id,
      localPage: 1,
      state: {},
    });
    return project;
  }

  function prepare(diskContents: string): { fake: FakeState; ports: SaveIntegrityPorts } {
    store.project = localProject();
    store.projectPath = "/work/Test project.gridscalr";
    store.fileStamp = stampFor("loaded version");
    store.dirty = true;
    const fake = state();
    fake.disk.set("/work/Test project.gridscalr", diskContents);
    fake.diskStamp = stampFor(diskContents);
    return { fake, ports: fakePorts(fake) };
  }

  it("reports item, page and quantity differences against a valid disk project", async () => {
    const disk = diskProject();
    const contents = serializeProject(disk);
    const { fake, ports } = prepare(contents);
    fake.conflictQueue = ["compare", "cancel"];

    expect(await saveProjectWithIntegrity(ports, false)).toBe(false);
    expect(fake.comparisons).toHaveLength(1);
    const comparison = fake.comparisons[0];
    expect(comparison.diskError).toBe(false);
    expect(comparison.diff).not.toBeNull();
    expect(comparison.diff!.summary.pages).toBe(3);
    expect(comparison.diff!.summary.changed).toBeGreaterThan(0);
    const changed = comparison.diff!.items.filter((item) => item.status === "changed");
    const length = changed.find((item) => item.label === "Wall A");
    expect(length?.changes.map((change) => change.field)).toEqual(
      expect.arrayContaining(["label", "page"]),
    );
    const count = changed.find((item) => item.kind === "count");
    expect(count?.changes.map((change) => change.field)).toContain("countQuantity");
    expect(comparison.diff!.warnings.length).toBeGreaterThan(0);

    // Comparison is read-only and does not change the conflict action.
    expect(fake.wrote).toHaveLength(0);
    expect(fake.disk.get("/work/Test project.gridscalr")).toBe(contents);
    expect(store.dirty).toBe(true);
    expect(defaultConflictAction()).toBe("conflicted-copy");
  });

  it("falls back to the metadata summary when the disk project is invalid", async () => {
    const { fake, ports } = prepare("{ not a project");
    fake.conflictQueue = ["compare", "cancel"];

    expect(await saveProjectWithIntegrity(ports, false)).toBe(false);
    expect(fake.comparisons).toHaveLength(1);
    expect(fake.comparisons[0].diskError).toBe(true);
    expect(fake.comparisons[0].diff).toBeNull();
    expect(fake.comparisons[0].disk).toBeNull();
    // The conflict dialog still received its actions and the write stayed blocked.
    expect(fake.wrote).toHaveLength(0);
    expect(store.dirty).toBe(true);
  });

  it("keeps Save as conflicted copy after comparing", async () => {
    const disk = diskProject();
    const contents = serializeProject(disk);
    const { fake, ports } = prepare(contents);
    fake.conflictQueue = ["compare", "conflicted-copy"];

    expect(await saveProjectWithIntegrity(ports, false)).toBe(true);
    expect(fake.comparisons).toHaveLength(1);
    expect(fake.wrote).toHaveLength(1);
    expect(fake.wrote[0].path).toMatch(/conflicted copy/);
    expect(fake.disk.get("/work/Test project.gridscalr")).toBe(contents);
  });
});
