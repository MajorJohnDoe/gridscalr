// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  buildStatusOverview,
  collectStatusOverview,
  formatStatusTime,
  newestBackupAt,
  showStatusOverviewPopover,
  type StatusOverview,
  type StatusOverviewActions,
  type StatusOverviewInput,
} from "../src/features/statusOverview";
import type { BackupEntry } from "../src/features/saveIntegrity";
import { setAutosavePausedForSession } from "../src/features/sessionRecovery";
import { t } from "../src/i18n";
import { createProject, defaultDocument } from "../src/model/layers";
import { store } from "../src/state/store";

const SAVED_AT = Date.UTC(2026, 9, 1, 10, 0);
const BACKUP_AT = Date.UTC(2026, 8, 30, 9, 0);

function overview(overrides: Partial<StatusOverviewInput> = {}): StatusOverview {
  return buildStatusOverview({
    hasProject: true,
    projectPath: "/work/Plan.gridscalr",
    dirty: false,
    viewOnly: false,
    savedAt: SAVED_AT,
    lastBackupAt: BACKUP_AT,
    autosaveStatus: "enabled",
    autosaveIntervalSeconds: 15,
    recoveryRecords: 1,
    recoveryCheckpoints: 0,
    conflictedCopies: 0,
    warnings: 0,
    errors: 0,
    desktop: true,
    ...overrides,
  });
}

interface Calls {
  backupNow: number;
  reviewRecovery: number;
  openDoctor: number;
  openConflictedCopies: number;
  paused: boolean[];
}

function show(
  overrides: Partial<StatusOverviewInput> = {},
  actionOverrides: Partial<StatusOverviewActions> = {},
): Calls {
  const calls: Calls = {
    backupNow: 0,
    reviewRecovery: 0,
    openDoctor: 0,
    openConflictedCopies: 0,
    paused: [],
  };
  const actions: StatusOverviewActions = {
    backupNow: () => {
      calls.backupNow += 1;
    },
    reviewRecovery: () => {
      calls.reviewRecovery += 1;
    },
    openDoctor: () => {
      calls.openDoctor += 1;
    },
    openConflictedCopies: () => {
      calls.openConflictedCopies += 1;
    },
    setAutosavePaused: (paused) => {
      calls.paused.push(paused);
    },
    ...actionOverrides,
  };
  const anchor = document.createElement("button");
  document.body.append(anchor);
  showStatusOverviewPopover(anchor, overview(overrides), actions);
  return calls;
}

function actionButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>(".status-popover button")].find(
    (button) => button.textContent === label,
  );
}

function rowValue(label: string): string | null {
  const row = [...document.querySelectorAll<HTMLElement>(".status-popover-row")].find(
    (node) => node.querySelector(".status-popover-label")?.textContent === label,
  );
  return row?.querySelector(".status-popover-value")?.textContent ?? null;
}

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  document.querySelectorAll(".popover").forEach((node) => node.remove());
  document.body.replaceChildren();
  store.closeProject();
  setAutosavePausedForSession(false);
});

describe("status overview model", () => {
  it("reports the save, backup, autosave, validation and recovery state", () => {
    const model = overview();
    expect(model.saveState).toBe("saved");
    expect(model.savedAt).toBe(SAVED_AT);
    expect(model.lastBackupAt).toBe(BACKUP_AT);
    expect(model.autosaveStatus).toBe("enabled");
    expect(model.autosaveIntervalSeconds).toBe(15);
    expect(model.warnings).toBe(0);
    expect(model.recoveryAvailable).toBe(true);
    expect(model.actions).toEqual({
      backupNow: true,
      reviewRecovery: true,
      openDoctor: true,
      openConflictedCopies: true,
      toggleAutosave: true,
      autosavePaused: false,
    });
  });

  it("distinguishes unsaved changes from an unsaved file", () => {
    expect(overview({ dirty: true }).saveState).toBe("unsaved");
    expect(overview({ dirty: false, projectPath: null }).saveState).toBe("notSaved");
  });

  it("keeps the backup and recovery actions applicable in view-only mode", () => {
    const model = overview({ viewOnly: true });
    expect(model.viewOnly).toBe(true);
    expect(model.actions.backupNow).toBe(true);
    expect(model.actions.reviewRecovery).toBe(true);
    expect(model.actions.openDoctor).toBe(true);
  });

  it("disables every action when there is no project", () => {
    const model = overview({ hasProject: false, projectPath: null, savedAt: null });
    expect(model.actions).toEqual({
      backupNow: false,
      reviewRecovery: false,
      openDoctor: false,
      openConflictedCopies: false,
      toggleAutosave: false,
      autosavePaused: false,
    });
  });

  it("disables backup outside the desktop app and recovery without a record", () => {
    const model = overview({ desktop: false, recoveryRecords: 0, recoveryCheckpoints: 0 });
    expect(model.actions.backupNow).toBe(false);
    expect(model.actions.reviewRecovery).toBe(false);
    expect(model.recoveryAvailable).toBe(false);
  });

  it("offers the autosave toggle only while autosave is on or paused", () => {
    expect(overview({ autosaveStatus: "paused" }).actions).toMatchObject({
      toggleAutosave: true,
      autosavePaused: true,
    });
    expect(overview({ autosaveStatus: "disabled" }).actions).toMatchObject({
      toggleAutosave: false,
      autosavePaused: false,
    });
  });

  it("picks the newest backup time and formats a saved moment", () => {
    expect(newestBackupAt([3, 1, 2])).toBe(3);
    expect(newestBackupAt([])).toBeNull();
    expect(newestBackupAt([Number.NaN, 4])).toBe(4);
    expect(formatStatusTime(null)).toBeNull();
    const formatted = formatStatusTime(SAVED_AT);
    expect(formatted).toContain("2026");
  });
});

describe("status overview popover", () => {
  it("shows a clean saved project with every action available", () => {
    show();
    expect(document.querySelector(".status-popover")).not.toBeNull();
    expect(document.querySelector(".status-popover-title")?.textContent).toBe(
      t("statusOverview.title"),
    );
    expect(document.querySelector(".status-popover .status-chip")?.textContent).toBe(
      t("status.projectSaved"),
    );
    expect(rowValue(t("statusOverview.lastSaved"))).toContain("2026");
    expect(rowValue(t("statusOverview.lastBackup"))).toContain("2026");
    expect(rowValue(t("statusOverview.autosave"))).toBe(
      t("statusOverview.autosaveOn", { seconds: 15 }),
    );
    expect(rowValue(t("statusOverview.validation"))).toBe(t("statusOverview.none"));
    expect(actionButton(t("statusOverview.backupNow"))?.disabled).toBe(false);
    expect(actionButton(t("statusOverview.reviewRecovery"))?.disabled).toBe(false);
    expect(actionButton(t("statusOverview.openDoctor"))?.disabled).toBe(false);
  });

  it("marks unsaved changes and explains an unsaved file", () => {
    show({ dirty: true });
    expect(document.querySelector(".status-popover .status-chip")?.textContent).toBe(
      t("status.projectUnsaved"),
    );
    expect(document.querySelector(".status-popover .status-chip")?.className).toContain(
      "is-warning",
    );
    expect(rowValue(t("statusOverview.lastSaved"))).not.toBeNull();
  });

  it("keeps working in view-only mode and says saving is disabled", () => {
    show({ viewOnly: true });
    expect(document.querySelector(".status-popover-note")?.textContent).toBe(
      t("statusOverview.viewOnlyNote"),
    );
    expect(actionButton(t("statusOverview.backupNow"))?.disabled).toBe(false);
  });

  it("shows autosave as paused and resumes it", () => {
    const calls = show({ autosaveStatus: "paused" });
    expect(rowValue(t("statusOverview.autosave"))).toBe(t("statusOverview.autosavePaused"));
    actionButton(t("statusOverview.resumeAutosave"))?.click();
    expect(calls.paused).toEqual([false]);
  });

  it("hides the autosave toggle when autosave is off", () => {
    show({ autosaveStatus: "disabled" });
    expect(rowValue(t("statusOverview.autosave"))).toBe(t("statusOverview.autosaveOff"));
    expect(actionButton(t("statusOverview.pauseAutosave"))).toBeUndefined();
    expect(actionButton(t("statusOverview.resumeAutosave"))).toBeUndefined();
  });

  it("reports pending validation warnings and opens the project doctor", () => {
    const calls = show({ warnings: 2, errors: 1 });
    expect(rowValue(t("statusOverview.validation"))).toBe(
      t("statusOverview.warningCount", { count: 2 }),
    );
    expect(rowValue(t("statusOverview.errors"))).toBe(t("statusOverview.errorCount", { count: 1 }));
    actionButton(t("statusOverview.openDoctor"))?.click();
    expect(calls.openDoctor).toBe(1);
  });

  it("disables recovery when no record is available", () => {
    const calls = show({ recoveryRecords: 0, recoveryCheckpoints: 0 });
    expect(rowValue(t("statusOverview.recovery"))).toBe(t("statusOverview.recoveryNone"));
    const button = actionButton(t("statusOverview.reviewRecovery"));
    expect(button?.disabled).toBe(true);
    button?.click();
    expect(calls.reviewRecovery).toBe(0);
  });

  it("routes the backup action and disables it outside the desktop app", () => {
    const calls = show();
    actionButton(t("statusOverview.backupNow"))?.click();
    expect(calls.backupNow).toBe(1);

    document.querySelectorAll(".popover").forEach((node) => node.remove());
    const browser = show({ desktop: false, lastBackupAt: null });
    const button = actionButton(t("statusOverview.backupNow"));
    expect(button?.disabled).toBe(true);
    expect(rowValue(t("statusOverview.lastBackup"))).toBe(t("statusOverview.unknown"));
    button?.click();
    expect(browser.backupNow).toBe(0);
  });

  it("shows the conflicted-copy count and opens the manager", () => {
    const calls = show({ conflictedCopies: 2 });
    expect(rowValue(t("statusOverview.conflictedCopies"))).toBe(
      t("statusOverview.conflictedCopyCount", { count: 2 }),
    );
    actionButton(t("statusOverview.manageConflictedCopies"))?.click();
    expect(calls.openConflictedCopies).toBe(1);
  });

  it("hides an empty copy row and disables the manager without a saved desktop project", () => {
    show();
    expect(rowValue(t("statusOverview.conflictedCopies"))).toBeNull();
    document.querySelectorAll(".popover").forEach((node) => node.remove());
    const browser = show({ desktop: false });
    const button = actionButton(t("statusOverview.manageConflictedCopies"));
    expect(button?.disabled).toBe(true);
    button?.click();
    expect(browser.openConflictedCopies).toBe(0);
  });

  it("closes on Escape", () => {
    show();
    expect(document.querySelector(".status-popover")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".status-popover")).toBeNull();
  });
});

describe("status overview controller", () => {
  function backupEntry(modifiedAt: number): BackupEntry {
    return {
      path: `/app-data/backups/prj/${modifiedAt}.gridscalr`,
      fileName: `backup-${modifiedAt}.gridscalr`,
      sizeBytes: 10,
      modifiedAt,
      projectPath: "/work/Plan.gridscalr",
    };
  }

  it("reads the live store, autosave and validation state once per open", async () => {
    const project = createProject(defaultDocument("Plan.pdf", 2));
    store.setProject(project, null, false);
    const reads: string[] = [];
    const copyReads: string[] = [];
    const host = {
      desktop: true,
      listBackups: async (projectId: string) => {
        reads.push(projectId);
        return [backupEntry(BACKUP_AT), backupEntry(BACKUP_AT + 1000)];
      },
      countConflictedCopies: async (projectPath: string) => {
        copyReads.push(projectPath);
        return 2;
      },
    };

    const unsaved = await collectStatusOverview(host);
    expect(unsaved.saveState).toBe("notSaved");
    expect(unsaved.savedAt).toBeNull();
    expect(unsaved.lastBackupAt).toBe(BACKUP_AT + 1000);
    expect(unsaved.conflictedCopies).toBe(0);
    expect(copyReads).toHaveLength(0);
    expect(reads).toEqual([project.id]);

    store.projectPath = "/work/Plan.gridscalr";
    store.fileStamp = { sha256: "a".repeat(64), sizeBytes: 10, modifiedAt: SAVED_AT };
    store.markSaved("/work/Plan.gridscalr");
    const saved = await collectStatusOverview(host);
    expect(saved.saveState).toBe("saved");
    expect(saved.savedAt).toBe(SAVED_AT);
    expect(saved.conflictedCopies).toBe(2);
    expect(copyReads).toEqual(["/work/Plan.gridscalr"]);
    expect(reads).toHaveLength(2);

    setAutosavePausedForSession(true);
    const paused = await collectStatusOverview(host);
    expect(paused.autosaveStatus).toBe("paused");
    expect(paused.actions.autosavePaused).toBe(true);

    project.reportLogoAssetId = "missing-asset";
    const warned = await collectStatusOverview(host);
    expect(warned.warnings).toBeGreaterThan(0);
    expect(reads).toHaveLength(4);
  });

  it("does not read the backup list in the browser fallback", async () => {
    const project = createProject(defaultDocument("Plan.pdf", 2));
    store.setProject(project, null, false);
    let reads = 0;
    const model = await collectStatusOverview({
      desktop: false,
      listBackups: async () => {
        reads += 1;
        return [backupEntry(BACKUP_AT)];
      },
      countConflictedCopies: async () => {
        reads += 1;
        return 1;
      },
    });
    expect(reads).toBe(0);
    expect(model.conflictedCopies).toBe(0);
    expect(model.lastBackupAt).toBeNull();
    expect(model.actions.backupNow).toBe(false);
  });

  it("keeps the popover usable when the backup list cannot be read", async () => {
    store.setProject(createProject(defaultDocument("Plan.pdf", 2)), null, false);
    const model = await collectStatusOverview({
      desktop: true,
      listBackups: async () => {
        throw new Error("unavailable");
      },
      countConflictedCopies: async () => {
        throw new Error("unavailable");
      },
    });
    expect(model.lastBackupAt).toBeNull();
    expect(model.conflictedCopies).toBe(0);
    expect(model.hasProject).toBe(true);
  });
});
