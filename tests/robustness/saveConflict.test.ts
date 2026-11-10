// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { pageIdFor, withTestPageIds } from "../helpers/pages";
import {
  ProjectWriteConflictError,
  saveProjectWithIntegrity,
  type BackupEntry,
  type ConflictAction,
  type ConflictComparisonInfo,
  type ProjectFileStamp,
  type SaveIntegrityPorts,
} from "../../src/features/saveIntegrity";
import { parseProject, serializeProject } from "../../src/io/projectFile";
import { validateProject } from "../../src/model/integrity";
import { createProject, defaultDocument } from "../../src/model/layers";
import type { MarkupItem, Project } from "../../src/model/types";
import { store } from "../../src/state/store";

const PATH = "/tmp/robustness/Robust project.gridscalr";
const NOW = "2026-01-01T00:00:00.000Z";

function stampFor(contents: string): ProjectFileStamp {
  const bytes = Buffer.from(contents, "utf8");
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
    modifiedAt: 1_700_000_000_000,
  };
}

function measureItem(id: string, pageId: string, project: Project): MarkupItem {
  return {
    id,
    pageId,
    kind: "length",
    points: [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    categoryId: project.settings.quantity.defaultCategoryId,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeProject(name: string): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 2)));
  project.name = name;
  project.documents[0].path = "/drawings/Plan.pdf";
  project.documents[0].relativePath = "before.pdf";
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  measure.items.push(measureItem(`item_${project.id}`, pageIdFor(1), project));
  return project;
}

interface FakeState {
  disk: Map<string, string>;
  writes: Array<{ path: string; expected: string | null; contents: string }>;
  writeError: Error | null;
  conflictQueue: ConflictAction[];
  comparisons: ConflictComparisonInfo[];
  notifications: string[];
  errors: string[];
}

function fakePorts(state: FakeState): SaveIntegrityPorts {
  const read = (path: string): string => {
    const contents = state.disk.get(path);
    if (contents === undefined) throw new Error(`missing ${path}`);
    return contents;
  };
  return {
    desktop: true,
    chooseSavePath: async () => PATH,
    readStamp: async (path) => {
      const contents = state.disk.get(path);
      return contents === undefined ? null : stampFor(contents);
    },
    write: async (path, contents, expected) => {
      if (state.writeError) throw state.writeError;
      if (expected !== null) {
        const current = state.disk.get(path);
        if (current === undefined) throw new ProjectWriteConflictError(null);
        const currentStamp = stampFor(current);
        if (currentStamp.sha256.toLowerCase() !== expected.toLowerCase()) {
          throw new ProjectWriteConflictError(currentStamp);
        }
      }
      state.writes.push({ path, expected, contents });
      state.disk.set(path, contents);
      return stampFor(contents);
    },
    pathExists: async (path) => state.disk.has(path),
    readText: async (path) => read(path),
    browserSave: async () => true,
    loadProjectText: async () => true,
    loadProjectData: async () => true,
    afterSave: () => undefined,
    notify: (message) => {
      state.notifications.push(message);
    },
    notifyError: (title, message) => {
      state.errors.push(`${title}: ${message}`);
    },
    conflict: async () => state.conflictQueue.shift() ?? "cancel",
    compare: async (info) => {
      state.comparisons.push(info);
    },
    confirmValidationWarnings: async () => true,
    reportValidationErrors: async () => undefined,
    chooseBackup: async () => null,
    listBackups: async () => [] as BackupEntry[],
    saveBackup: async () => undefined,
  };
}

function state(): FakeState {
  return {
    disk: new Map(),
    writes: [],
    writeError: null,
    conflictQueue: [],
    comparisons: [],
    notifications: [],
    errors: [],
  };
}

function openWriter(project: Project, contents: string, path = PATH): void {
  store.project = project;
  store.projectPath = path;
  store.fileStamp = stampFor(contents);
  store.dirty = true;
  store.readOnly = false;
}

beforeEach(() => {
  store.project = null;
  store.projectPath = null;
  store.fileStamp = null;
  store.dirty = false;
  store.readOnly = false;
});

describe("two writers and conditional saves", () => {
  it("rejects a stale writer and keeps both versions through a conflicted copy", async () => {
    const base = serializeProject(makeProject("Base"));
    const fake = state();
    fake.disk.set(PATH, base);

    const writerA = makeProject("Writer A");
    openWriter(writerA, base);
    expect(await saveProjectWithIntegrity(fakePorts(fake), false)).toBe(true);
    const afterA = fake.disk.get(PATH)!;
    expect(afterA).toContain("Writer A");

    // Writer B still expects the version both writers opened.
    const writerB = makeProject("Writer B");
    openWriter(writerB, base);
    fake.conflictQueue = ["conflicted-copy"];
    expect(await saveProjectWithIntegrity(fakePorts(fake), false)).toBe(true);

    expect(fake.disk.get(PATH)).toBe(afterA);
    const conflictedPath = fake.writes.find((write) => write.path !== PATH)?.path;
    expect(conflictedPath).toMatch(
      /Robust project \(conflicted copy \d{4}-\d{2}-\d{2} \d{4}\)\.gridscalr$/,
    );
    const conflicted = fake.disk.get(conflictedPath!)!;
    expect(conflicted).toContain("Writer B");
    expect(conflicted).not.toBe(afterA);
    expect(store.projectPath).toBe(PATH);
    expect(store.dirty).toBe(true);
  });

  it("requires the explicit overwrite action to replace the other writer", async () => {
    const base = serializeProject(makeProject("Base"));
    const fake = state();
    fake.disk.set(PATH, base);

    const writerA = makeProject("Writer A");
    openWriter(writerA, base);
    expect(await saveProjectWithIntegrity(fakePorts(fake), false)).toBe(true);

    const writerB = makeProject("Writer B");
    openWriter(writerB, base);
    fake.conflictQueue = ["cancel"];
    expect(await saveProjectWithIntegrity(fakePorts(fake), false)).toBe(false);
    expect(fake.disk.get(PATH)).toContain("Writer A");

    fake.conflictQueue = ["overwrite"];
    expect(await saveProjectWithIntegrity(fakePorts(fake), false)).toBe(true);
    expect(fake.disk.get(PATH)).toContain("Writer B");
    expect(fake.writes.at(-1)?.expected).toBeNull();
    expect(store.dirty).toBe(false);
  });

  it("leaves the previous file and the in-memory project valid after a failed write", async () => {
    const base = serializeProject(makeProject("Base"));
    const fake = state();
    fake.disk.set(PATH, base);
    const project = makeProject("Unsaved changes");
    openWriter(project, base);
    project.documents[0].relativePath = "before.pdf";
    fake.writeError = new Error("disk full");

    expect(await saveProjectWithIntegrity(fakePorts(fake), false)).toBe(false);
    expect(fake.disk.get(PATH)).toBe(base);
    expect(fake.writes).toHaveLength(0);
    expect(fake.errors).toHaveLength(1);
    expect(store.dirty).toBe(true);
    expect(store.project).toBe(project);
    expect(project.documents[0].relativePath).toBe("before.pdf");
    expect(validateProject(project).filter((issue) => issue.severity === "error")).toEqual([]);
    expect(parseProject(base).name).toBe("Base");
  });

  it("does not rewrite an unchanged project", async () => {
    const base = serializeProject(makeProject("Base"));
    const fake = state();
    fake.disk.set(PATH, base);
    store.project = makeProject("Base");
    store.projectPath = PATH;
    store.fileStamp = stampFor(base);
    store.dirty = false;

    expect(await saveProjectWithIntegrity(fakePorts(fake), false)).toBe(true);
    expect(fake.writes).toHaveLength(0);
    expect(fake.disk.get(PATH)).toBe(base);
  });

  it("treats a deleted target as a conflict rather than recreating it", async () => {
    const base = serializeProject(makeProject("Base"));
    const fake = state();
    fake.disk.set(PATH, base);
    const project = makeProject("Local work");
    openWriter(project, base);
    fake.disk.delete(PATH);
    fake.conflictQueue = ["conflicted-copy"];

    expect(await saveProjectWithIntegrity(fakePorts(fake), false)).toBe(true);
    expect(fake.disk.has(PATH)).toBe(false);
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0].path).not.toBe(PATH);
    expect(fake.disk.get(fake.writes[0].path)).toContain("Local work");
  });
});
