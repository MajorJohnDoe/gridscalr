// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  backupProjectNow,
  canReplaceOpenProject,
  defaultBackupSelection,
  findBackup,
  openBackupManager,
  openBackupManagerFlow,
  originNeedsWarning,
  saveProjectWithIntegrity,
  sortBackupsNewestFirst,
  totalBackupBytes,
  type BackupEntry,
  type BackupPorts,
} from "../src/features/saveIntegrity";
import { loadAppPreferences, saveAppPreferences } from "../src/io/appPreferences";
import { serializeProject } from "../src/io/projectFile";
import { createProject, defaultDocument } from "../src/model/layers";
import type { Project } from "../src/model/types";
import { store } from "../src/state/store";
import { t } from "../src/i18n";

function makeProject(name = "Test project"): Project {
  const project = createProject(defaultDocument("Plan.pdf", 2));
  project.name = name;
  return project;
}

function entry(overrides: Partial<BackupEntry> = {}): BackupEntry {
  return {
    path: "/app-data/backups/prj_1/backup-0000000001000.gridscalr",
    fileName: "backup-0000000001000.gridscalr",
    sizeBytes: 120,
    modifiedAt: 1_700_000_000_000,
    projectPath: "/work/Test project.gridscalr",
    ...overrides,
  };
}

interface FakeState {
  entries: BackupEntry[];
  contents: Map<string, string>;
  saved: Array<{
    projectId: string;
    contents: string;
    projectPath: string | null;
    retention: number;
  }>;
  loaded: Array<{ project: Project; path: string | null; dirty: boolean }>;
  notices: Array<{ message: string; kind: string }>;
  errors: string[];
  confirmations: Array<{ title: string; message: string; label: string }>;
  discards: string[];
  confirmResult: boolean;
  discardResult: boolean;
  retention: number;
}

function fakeState(): FakeState {
  return {
    entries: [],
    contents: new Map(),
    saved: [],
    loaded: [],
    notices: [],
    errors: [],
    confirmations: [],
    discards: [],
    confirmResult: true,
    discardResult: true,
    retention: 3,
  };
}

function fakePorts(state: FakeState): BackupPorts {
  return {
    desktop: true,
    backupRetention: () => state.retention,
    listBackups: async () => [...state.entries],
    saveBackup: async (projectId, contents, projectPath, retention) => {
      state.saved.push({ projectId, contents, projectPath, retention });
    },
    deleteBackup: async (_projectId, fileName) => {
      state.entries = state.entries.filter((item) => item.fileName !== fileName);
    },
    deleteAllBackups: async () => {
      state.entries = [];
    },
    readText: async (path) => {
      const text = state.contents.get(path);
      if (!text) throw new Error(`missing ${path}`);
      return text;
    },
    loadProjectData: async (project, path, dirty) => {
      state.loaded.push({ project, path, dirty });
      return true;
    },
    confirm: async (title, message, label) => {
      state.confirmations.push({ title, message, label });
      return state.confirmResult;
    },
    confirmDiscard: async (message) => {
      state.discards.push(message);
      return state.discardResult;
    },
    notify: (message, kind = "info") => {
      state.notices.push({ message, kind });
    },
    notifyError: async (title, message) => {
      state.errors.push(`${title}: ${message}`);
    },
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function footerButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>(".modal-footer button")].find(
    (button) => button.textContent === label,
  );
}

beforeEach(() => {
  localStorage.clear();
  store.project = null;
  store.projectPath = null;
  store.fileStamp = null;
  store.dirty = false;
  document.querySelectorAll(".modal-backdrop").forEach((node) => node.remove());
  document.body.replaceChildren();
});

describe("backup manager model", () => {
  it("orders backups newest first and selects the newest", () => {
    const older = entry({ path: "/a", fileName: "backup-0000000000001.gridscalr" });
    const newer = entry({ path: "/b", fileName: "backup-0000000000002.gridscalr" });
    const sorted = sortBackupsNewestFirst([older, newer]);
    expect(sorted.map((item) => item.path)).toEqual(["/b", "/a"]);
    expect(defaultBackupSelection(sorted)).toBe("/b");
    expect(defaultBackupSelection([])).toBeNull();
    expect(findBackup(sorted, "/a")).toBe(older);
    expect(findBackup(sorted, "/missing")).toBeNull();
  });

  it("offers replace only for a saved project and warns about another origin", () => {
    expect(canReplaceOpenProject("/work/Plan.gridscalr")).toBe(true);
    expect(canReplaceOpenProject(null)).toBe(false);
    const fromPath = entry({ projectPath: "/work/Plan.gridscalr" });
    expect(originNeedsWarning(fromPath, "/work/Plan.gridscalr")).toBe(false);
    expect(originNeedsWarning(fromPath, "/work/Moved.gridscalr")).toBe(true);
    expect(originNeedsWarning(entry({ projectPath: null }), "/work/Plan.gridscalr")).toBe(false);
    expect(originNeedsWarning(null, "/work/Plan.gridscalr")).toBe(false);
    expect(totalBackupBytes([entry({ sizeBytes: 10 }), entry({ sizeBytes: 5 })])).toBe(15);
  });
});

describe("backup manager dialog", () => {
  it("lists time, size and origin and returns restore-as-copy for the selected backup", async () => {
    const current = entry();
    const other = entry({
      path: "/app-data/backups/prj_1/backup-0000000002000.gridscalr",
      fileName: "backup-0000000002000.gridscalr",
      sizeBytes: 240,
      projectPath: "/work/Old project.gridscalr",
    });
    const result = openBackupManager([current, other], {
      currentProjectPath: "/work/Test project.gridscalr",
      retention: 3,
    });
    await nextFrame();
    const rows = [...document.querySelectorAll(".recovery-row")];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("/work/Test project.gridscalr");
    const radios = [
      ...document.querySelectorAll<HTMLInputElement>('input[name="backup-manager-choice"]'),
    ];
    expect(radios[0].checked).toBe(true);
    // The default backup was written from the current path, so it does not warn.
    expect(document.querySelector(".recovery-warning")?.classList.contains("hidden")).toBe(true);

    radios[1].checked = true;
    radios[1].dispatchEvent(new Event("change", { bubbles: true }));
    const warning = document.querySelector(".recovery-warning");
    expect(warning?.classList.contains("hidden")).toBe(false);
    expect(warning?.textContent).toContain("/work/Old project.gridscalr");

    radios[0].checked = true;
    radios[0].dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.querySelector(".recovery-warning")?.classList.contains("hidden")).toBe(true);

    footerButton(t("saveIntegrity.managerRestoreCopy"))?.click();
    await expect(result).resolves.toMatchObject({
      action: "restore-copy",
      entry: { path: current.path },
    });
  });

  it("offers replace only while the project is saved", async () => {
    const result = openBackupManager([entry()], {
      currentProjectPath: null,
      retention: 3,
    });
    await nextFrame();
    expect(footerButton(t("saveIntegrity.managerReplace"))).toBeUndefined();
    footerButton(t("common.close"))?.click();
    await expect(result).resolves.toEqual({ action: "cancel", entry: null });
  });

  it("shows an empty state with the retention note", async () => {
    const result = openBackupManager([], {
      currentProjectPath: "/work/Plan.gridscalr",
      retention: 5,
    });
    await nextFrame();
    const empty = document.querySelector(".recovery-empty");
    expect(empty?.textContent).toContain(t("saveIntegrity.managerEmptyTitle"));
    expect(empty?.textContent).toContain(t("saveIntegrity.managerRetention", { keep: 5 }));
    footerButton(t("common.close"))?.click();
    await expect(result).resolves.toEqual({ action: "cancel", entry: null });
  });
});

describe("backup manager flows", () => {
  it("writes an on-demand backup with the project path and retention", async () => {
    store.project = makeProject();
    store.projectPath = "/work/Test project.gridscalr";
    const state = fakeState();
    state.retention = 7;
    expect(await backupProjectNow(fakePorts(state))).toBe(true);
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0].projectPath).toBe("/work/Test project.gridscalr");
    expect(state.saved[0].retention).toBe(7);
  });

  it("restores a backup as an unsaved copy after the unsaved-changes guard", async () => {
    store.project = makeProject();
    store.projectPath = "/work/Test project.gridscalr";
    store.dirty = true;
    const state = fakeState();
    const backup = entry();
    state.entries = [backup];
    state.contents.set(backup.path, serializeProject(makeProject("Older backup")));
    const ports = fakePorts(state);

    const flow = openBackupManagerFlow(ports);
    await nextFrame();
    footerButton(t("saveIntegrity.managerRestoreCopy"))?.click();
    await expect(flow).resolves.toBe(true);

    expect(state.discards).toHaveLength(1);
    expect(state.confirmations).toHaveLength(0);
    expect(state.loaded).toHaveLength(1);
    expect(state.loaded[0].path).toBeNull();
    expect(state.loaded[0].dirty).toBe(true);
    expect(state.loaded[0].project.name).toBe("Older backup");
    expect(store.projectPath).toBe("/work/Test project.gridscalr");
    expect(state.saved).toHaveLength(0);
  });

  it("replaces the open project only after the explicit confirmation", async () => {
    store.project = makeProject();
    store.projectPath = "/work/Test project.gridscalr";
    const state = fakeState();
    const backup = entry();
    state.entries = [backup];
    state.contents.set(backup.path, serializeProject(makeProject("Older backup")));
    const ports = fakePorts(state);

    const flow = openBackupManagerFlow(ports);
    await nextFrame();
    footerButton(t("saveIntegrity.managerReplace"))?.click();
    await expect(flow).resolves.toBe(true);

    expect(state.discards).toHaveLength(1);
    expect(state.confirmations).toHaveLength(1);
    expect(state.confirmations[0].label).toBe(t("saveIntegrity.replaceConfirm"));
    expect(state.loaded[0].path).toBe("/work/Test project.gridscalr");
    expect(state.loaded[0].dirty).toBe(true);
  });

  it("stops when the unsaved-changes guard is declined", async () => {
    store.project = makeProject();
    store.projectPath = "/work/Test project.gridscalr";
    const state = fakeState();
    state.discardResult = false;
    const backup = entry();
    state.entries = [backup];
    state.contents.set(backup.path, serializeProject(makeProject("Older backup")));

    const flow = openBackupManagerFlow(fakePorts(state));
    await nextFrame();
    footerButton(t("saveIntegrity.managerRestoreCopy"))?.click();
    await expect(flow).resolves.toBe(false);
    expect(state.loaded).toHaveLength(0);
  });

  it("deletes only the selected backup", async () => {
    store.project = makeProject();
    const state = fakeState();
    const first = entry();
    const second = entry({
      path: "/app-data/backups/prj_1/backup-0000000002000.gridscalr",
      fileName: "backup-0000000002000.gridscalr",
    });
    state.entries = [first, second];
    const ports = fakePorts(state);

    const flow = openBackupManagerFlow(ports);
    await nextFrame();
    footerButton(t("saveIntegrity.managerDelete"))?.click();
    await expect(flow).resolves.toBe(true);

    expect(state.confirmations).toHaveLength(1);
    expect(state.entries.map((item) => item.fileName)).toEqual([first.fileName]);
    expect(state.notices.at(-1)?.message).toBe(t("saveIntegrity.deleted"));
  });

  it("deletes every backup for the project", async () => {
    store.project = makeProject();
    const state = fakeState();
    state.entries = [entry(), entry({ path: "/b", fileName: "backup-0000000000002.gridscalr" })];
    const ports = fakePorts(state);

    const flow = openBackupManagerFlow(ports);
    await nextFrame();
    footerButton(t("saveIntegrity.managerDeleteAll"))?.click();
    await expect(flow).resolves.toBe(true);

    expect(state.confirmations).toHaveLength(1);
    expect(state.entries).toHaveLength(0);
    expect(state.notices.at(-1)?.message).toBe(t("saveIntegrity.deletedAll"));
  });

  it("applies the retention preference on the next successful save", async () => {
    store.project = makeProject();
    store.projectPath = "/work/Test project.gridscalr";
    store.dirty = true;
    store.fileStamp = { sha256: "same", sizeBytes: 1, modifiedAt: 1 };
    saveAppPreferences({ backups: { retention: 8 } });
    const state = fakeState();
    state.retention = loadAppPreferences().backups.retention;
    const ports = {
      ...fakePorts(state),
      chooseSavePath: async () => "/work/Test project.gridscalr",
      readStamp: async () => ({ sha256: "same", sizeBytes: 1, modifiedAt: 1 }),
      write: async () => ({ sha256: "written", sizeBytes: 1, modifiedAt: 1 }),
      pathExists: async () => true,
      browserSave: async () => true,
      loadProjectText: async () => true,
      afterSave: () => undefined,
      conflict: async () => "cancel" as const,
      compare: async () => undefined,
      confirmValidationWarnings: async () => true,
      reportValidationErrors: async () => undefined,
    };
    expect(await saveProjectWithIntegrity(ports, false)).toBe(true);
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0].retention).toBe(8);
  });

  it("opens the empty manager without a backup and keeps the project", async () => {
    store.project = makeProject();
    const state = fakeState();
    const flow = openBackupManagerFlow(fakePorts(state));
    await nextFrame();
    expect(document.querySelector(".recovery-empty")).not.toBeNull();
    footerButton(t("common.close"))?.click();
    await expect(flow).resolves.toBe(false);
  });
});
