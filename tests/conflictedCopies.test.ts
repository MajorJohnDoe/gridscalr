// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  conflictedCopyDeleteBlock,
  isConflictedCopyEntry,
  isConflictedCopyFileName,
  openConflictedCopiesFlow,
  projectFileStem,
  showConflictedCopies,
  sortConflictedCopiesNewestFirst,
  totalConflictedCopyBytes,
  type ConflictedCopyEntry,
  type ConflictedCopyPorts,
} from "../src/features/conflictedCopies";
import {
  conflictTimestamp,
  conflictedCopyPath,
  type ConflictComparisonInfo,
} from "../src/features/saveIntegrity";
import { basename, formatBytes } from "../src/io/platform";
import { serializeProject } from "../src/io/projectFile";
import { createProject, defaultDocument } from "../src/model/layers";
import type { Project } from "../src/model/types";
import { store } from "../src/state/store";
import { t } from "../src/i18n";

const PROJECT_PATH = "/work/Plan.gridscalr";
const DATE = new Date(2026, 10, 11, 10, 10);
const FIRST_NAME = basename(conflictedCopyPath(PROJECT_PATH, DATE));
const SECOND_NAME = basename(conflictedCopyPath(PROJECT_PATH, DATE, 2));
const FIRST_PATH = `/work/${FIRST_NAME}`;
const SECOND_PATH = `/work/${SECOND_NAME}`;

function makeProject(name = "Test project"): Project {
  const project = createProject(defaultDocument("Plan.pdf", 2));
  project.name = name;
  return project;
}

function entry(overrides: Partial<ConflictedCopyEntry> = {}): ConflictedCopyEntry {
  return {
    path: FIRST_PATH,
    fileName: FIRST_NAME,
    sizeBytes: 2048,
    modifiedAt: 1_700_000_000_000,
    ...overrides,
  };
}

interface FakeState {
  entries: ConflictedCopyEntry[];
  projectFileExists: boolean;
  texts: Map<string, string>;
  opened: string[];
  removed: Array<{ projectPath: string; fileName: string }>;
  compared: ConflictComparisonInfo[];
  notices: Array<{ message: string; kind: string }>;
  errors: string[];
  confirmations: number;
  confirmResult: boolean;
  dropOnRemove: boolean;
}

function fakeState(): FakeState {
  return {
    entries: [],
    projectFileExists: true,
    texts: new Map(),
    opened: [],
    removed: [],
    compared: [],
    notices: [],
    errors: [],
    confirmations: 0,
    confirmResult: true,
    dropOnRemove: true,
  };
}

function fakePorts(state: FakeState): ConflictedCopyPorts {
  return {
    desktop: true,
    list: async () => [...state.entries],
    remove: async (projectPath, fileName) => {
      state.removed.push({ projectPath, fileName });
      if (state.dropOnRemove) {
        state.entries = state.entries.filter((item) => item.fileName !== fileName);
      }
    },
    pathExists: async () => state.projectFileExists,
    open: async (path) => {
      state.opened.push(path);
    },
    readText: async (path) => {
      const text = state.texts.get(path);
      if (!text) throw new Error(`missing ${path}`);
      return text;
    },
    compare: async (info) => {
      state.compared.push(info);
    },
    confirmDelete: async () => {
      state.confirmations += 1;
      return state.confirmResult;
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

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".recovery-row")];
}

beforeEach(() => {
  store.project = null;
  store.projectPath = null;
  store.fileStamp = null;
  store.dirty = false;
  document.querySelectorAll(".modal-backdrop").forEach((node) => node.remove());
  document.body.replaceChildren();
});

describe("conflicted copy naming", () => {
  it("accepts exactly the names the save flow writes", () => {
    expect(projectFileStem(PROJECT_PATH)).toBe("Plan");
    expect(projectFileStem("/work/Plan.json")).toBe("Plan.json");
    expect(projectFileStem("/work/Plan.pdf")).toBe("Plan.pdf");
    expect(projectFileStem("")).toBeNull();
    expect(isConflictedCopyFileName(FIRST_NAME, "Plan")).toBe(true);
    expect(isConflictedCopyFileName(SECOND_NAME, "Plan")).toBe(true);
    expect(
      isConflictedCopyFileName(
        `Plan (conflicted copy ${conflictTimestamp(DATE)} 12).gridscalr`,
        "Plan",
      ),
    ).toBe(true);
    expect(conflictedCopyPath(PROJECT_PATH, DATE)).toBe(FIRST_PATH);
    // A project opened from a `.json` file keeps its full name as the stem.
    const jsonCopy = basename(conflictedCopyPath("/work/Plan.json", DATE));
    expect(isConflictedCopyFileName(jsonCopy, "Plan.json")).toBe(true);
  });

  it("never matches a look-alike file", () => {
    for (const name of [
      "Plan.gridscalr",
      "Plan (conflicted copy 2026-11-11).gridscalr",
      "Plan (conflicted copy 2026-11-11 1010).pdf",
      "Plan (conflicted copy 2026-11-11 1010) 2.gridscalr",
      "Plan (conflicted copy 2026-11-11 1010).gridscalr.tmp",
      "Plan (conflicted copy 2026-11-11 1010 0).gridscalr",
      "Plan notes.gridscalr",
      "Other (conflicted copy 2026-11-11 1010).gridscalr",
      "../Plan (conflicted copy 2026-11-11 1010).gridscalr",
    ]) {
      expect(isConflictedCopyFileName(name, "Plan")).toBe(false);
    }
  });

  it("keeps only entries from the project folder with a matching name", () => {
    expect(isConflictedCopyEntry(entry(), PROJECT_PATH)).toBe(true);
    expect(isConflictedCopyEntry(entry({ path: `/elsewhere/${FIRST_NAME}` }), PROJECT_PATH)).toBe(
      false,
    );
    expect(
      isConflictedCopyEntry(
        entry({ path: "/work/Plan notes.gridscalr", fileName: "Plan notes.gridscalr" }),
        PROJECT_PATH,
      ),
    ).toBe(false);
  });

  it("orders newest first and totals the listed bytes", () => {
    const older = entry({ modifiedAt: 10, sizeBytes: 5 });
    const newer = entry({ path: SECOND_PATH, fileName: SECOND_NAME, modifiedAt: 20, sizeBytes: 7 });
    expect(sortConflictedCopiesNewestFirst([older, newer]).map((item) => item.fileName)).toEqual([
      SECOND_NAME,
      FIRST_NAME,
    ]);
    expect(totalConflictedCopyBytes([older, newer])).toBe(12);
  });

  it("guards the open project and the only surviving copy", () => {
    expect(
      conflictedCopyDeleteBlock({
        fileName: "Plan.gridscalr",
        projectPath: PROJECT_PATH,
        projectFileExists: true,
        copyCount: 3,
      }),
    ).toBe("openProject");
    expect(
      conflictedCopyDeleteBlock({
        fileName: FIRST_NAME,
        projectPath: PROJECT_PATH,
        projectFileExists: false,
        copyCount: 1,
      }),
    ).toBe("onlyCopy");
    expect(
      conflictedCopyDeleteBlock({
        fileName: FIRST_NAME,
        projectPath: PROJECT_PATH,
        projectFileExists: false,
        copyCount: 2,
      }),
    ).toBeNull();
    expect(
      conflictedCopyDeleteBlock({
        fileName: FIRST_NAME,
        projectPath: PROJECT_PATH,
        projectFileExists: true,
        copyCount: 1,
      }),
    ).toBeNull();
  });
});

describe("conflicted copies dialog", () => {
  it("lists every copy with its time and size and returns the selected one", async () => {
    const second = entry({
      path: SECOND_PATH,
      fileName: SECOND_NAME,
      sizeBytes: 4096,
      modifiedAt: 1_700_000_100_000,
    });
    const result = showConflictedCopies([entry(), second], { projectFileName: "Plan.gridscalr" });
    await nextFrame();
    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain(FIRST_NAME);
    const meta = rows()[0].querySelector(".recovery-row-meta")?.textContent ?? "";
    expect(meta).toContain("·");
    expect(meta).toContain(formatBytes(2048));
    const radios = [
      ...document.querySelectorAll<HTMLInputElement>('input[name="conflicted-copy-choice"]'),
    ];
    expect(radios[0].checked).toBe(true);
    radios[1].checked = true;
    radios[1].dispatchEvent(new Event("change", { bubbles: true }));
    footerButton(t("conflictedCopies.open"))?.click();
    await expect(result).resolves.toMatchObject({ action: "open", entry: { path: SECOND_PATH } });
  });

  it("offers compare and delete and cancels without choosing", async () => {
    const result = showConflictedCopies([entry()], { projectFileName: "Plan.gridscalr" });
    await nextFrame();
    expect(footerButton(t("conflictedCopies.compare"))).toBeDefined();
    expect(footerButton(t("conflictedCopies.delete"))).toBeDefined();
    footerButton(t("conflictedCopies.compare"))?.click();
    await expect(result).resolves.toMatchObject({ action: "compare" });

    document.querySelectorAll(".modal-backdrop").forEach((node) => node.remove());
    const cancelled = showConflictedCopies([entry()], { projectFileName: "Plan.gridscalr" });
    await nextFrame();
    footerButton(t("common.close"))?.click();
    await expect(cancelled).resolves.toEqual({ action: "cancel", entry: null });
  });

  it("shows the empty state when the folder has no copy", async () => {
    const result = showConflictedCopies([], { projectFileName: "Plan.gridscalr" });
    await nextFrame();
    expect(document.querySelector(".recovery-empty")?.textContent).toContain(
      t("conflictedCopies.emptyTitle"),
    );
    footerButton(t("common.close"))?.click();
    await expect(result).resolves.toEqual({ action: "cancel", entry: null });
  });
});

describe("conflicted copy flows", () => {
  it("opens a copy as its own project without writing the original", async () => {
    store.project = makeProject();
    store.projectPath = PROJECT_PATH;
    const state = fakeState();
    state.entries = [entry()];

    const flow = openConflictedCopiesFlow(fakePorts(state));
    await nextFrame();
    footerButton(t("conflictedCopies.open"))?.click();
    await expect(flow).resolves.toBe(true);

    expect(state.opened).toEqual([FIRST_PATH]);
    expect(state.removed).toHaveLength(0);
    expect(state.compared).toHaveLength(0);
  });

  it("compares a copy with the open project through the revision engine", async () => {
    store.project = makeProject();
    store.projectPath = PROJECT_PATH;
    const state = fakeState();
    state.entries = [entry()];
    state.texts.set(FIRST_PATH, serializeProject(makeProject("Copy project")));

    const flow = openConflictedCopiesFlow(fakePorts(state));
    await nextFrame();
    footerButton(t("conflictedCopies.compare"))?.click();
    await nextFrame();

    expect(state.compared).toHaveLength(1);
    expect(state.compared[0].local.name).toBe("Test project");
    expect(state.compared[0].disk?.name).toBe("Copy project");
    expect(state.compared[0].diff).not.toBeNull();
    expect(state.compared[0].diskError).toBe(false);
    expect(state.removed).toHaveLength(0);

    footerButton(t("common.close"))?.click();
    await expect(flow).resolves.toBe(false);
  });

  it("reports an unreadable copy instead of failing the comparison", async () => {
    store.project = makeProject();
    store.projectPath = PROJECT_PATH;
    const state = fakeState();
    state.entries = [entry()];

    const flow = openConflictedCopiesFlow(fakePorts(state));
    await nextFrame();
    footerButton(t("conflictedCopies.compare"))?.click();
    await nextFrame();

    expect(state.compared).toHaveLength(1);
    expect(state.compared[0].disk).toBeNull();
    expect(state.compared[0].diff).toBeNull();
    expect(state.compared[0].diskError).toBe(true);

    footerButton(t("common.close"))?.click();
    await expect(flow).resolves.toBe(false);
  });

  it("deletes only the selected copy after the explicit confirmation", async () => {
    store.project = makeProject();
    store.projectPath = PROJECT_PATH;
    const state = fakeState();
    state.entries = [entry(), entry({ path: SECOND_PATH, fileName: SECOND_NAME })];

    const flow = openConflictedCopiesFlow(fakePorts(state));
    await nextFrame();
    footerButton(t("conflictedCopies.delete"))?.click();
    await expect(flow).resolves.toBe(true);

    expect(state.confirmations).toBe(1);
    expect(state.removed).toEqual([{ projectPath: PROJECT_PATH, fileName: FIRST_NAME }]);
    expect(state.entries.map((item) => item.fileName)).toEqual([SECOND_NAME]);
    expect(state.notices.at(-1)?.message).toBe(t("conflictedCopies.deleted", { name: FIRST_NAME }));
  });

  it("keeps the copy when the delete confirmation is cancelled", async () => {
    store.project = makeProject();
    store.projectPath = PROJECT_PATH;
    const state = fakeState();
    state.entries = [entry()];
    state.confirmResult = false;

    const flow = openConflictedCopiesFlow(fakePorts(state));
    await nextFrame();
    footerButton(t("conflictedCopies.delete"))?.click();
    await nextFrame();
    expect(state.confirmations).toBe(1);
    expect(state.removed).toHaveLength(0);
    expect(state.entries).toHaveLength(1);

    footerButton(t("common.close"))?.click();
    await expect(flow).resolves.toBe(false);
  });

  it("refuses to delete the only surviving copy when the project file is missing", async () => {
    store.project = makeProject();
    store.projectPath = PROJECT_PATH;
    const state = fakeState();
    state.entries = [entry()];
    state.projectFileExists = false;

    const flow = openConflictedCopiesFlow(fakePorts(state));
    await nextFrame();
    footerButton(t("conflictedCopies.delete"))?.click();
    await nextFrame();

    expect(state.confirmations).toBe(0);
    expect(state.removed).toHaveLength(0);
    expect(state.notices.at(-1)).toEqual({
      message: t("conflictedCopies.guardOnlyCopy"),
      kind: "warning",
    });

    footerButton(t("common.close"))?.click();
    await expect(flow).resolves.toBe(false);
  });

  it("drops a look-alike returned by the desktop command", async () => {
    store.project = makeProject();
    store.projectPath = PROJECT_PATH;
    const state = fakeState();
    state.entries = [
      entry({ path: "/work/Plan notes.gridscalr", fileName: "Plan notes.gridscalr" }),
    ];

    const flow = openConflictedCopiesFlow(fakePorts(state));
    await nextFrame();
    expect(rows()).toHaveLength(0);
    expect(document.querySelector(".recovery-empty")).not.toBeNull();
    footerButton(t("common.close"))?.click();
    await expect(flow).resolves.toBe(false);
  });

  it("reports a copy that survives the delete instead of claiming success", async () => {
    store.project = makeProject();
    store.projectPath = PROJECT_PATH;
    const state = fakeState();
    state.entries = [entry()];
    state.dropOnRemove = false;

    const flow = openConflictedCopiesFlow(fakePorts(state));
    await nextFrame();
    footerButton(t("conflictedCopies.delete"))?.click();
    await expect(flow).resolves.toBe(false);
    expect(state.notices.at(-1)?.message).toBe(t("conflictedCopies.deleteFailed"));
  });

  it("explains why the manager cannot open", async () => {
    const state = fakeState();
    await expect(openConflictedCopiesFlow(fakePorts(state))).resolves.toBe(false);
    expect(state.notices.at(-1)?.message).toBe(t("conflictedCopies.noProject"));

    store.project = makeProject();
    await expect(openConflictedCopiesFlow(fakePorts(state))).resolves.toBe(false);
    expect(state.notices.at(-1)?.message).toBe(t("conflictedCopies.unsavedPath"));

    store.projectPath = PROJECT_PATH;
    await expect(openConflictedCopiesFlow({ ...fakePorts(state), desktop: false })).resolves.toBe(
      false,
    );
    expect(state.notices.at(-1)?.message).toBe(t("conflictedCopies.desktopOnly"));
  });
});
