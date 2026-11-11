import { t } from "../../i18n";
import { formatDate } from "../../i18n/format";
import { describeError } from "../../io/platformError";
import { parseProject, serializeProject } from "../../io/projectFile";
import type { Project } from "../../model/types";
import { store } from "../../state/store";
import { logEvent } from "../diagnostics/log";
import type { BackupEntry } from "./backup";
import { sortBackupsNewestFirst } from "./backup";
import { openBackupManager } from "./backupManagerUi";
import { canReplaceOpenProject } from "./backupManagerModel";
import { applyRestoreLinkPlan, applyRestoreRelink, planRestoreLinks } from "./restoreLinks";
import { showRestoreLinkReport } from "./restoreUi";

/** A drawing the user picked to replace an unresolvable link of a backup. */
export interface LocatedDrawing {
  path: string | null;
  name: string;
}

/** Storage and host actions the backup manager needs. */
export interface BackupPorts {
  desktop: boolean;
  /** Rolling backup retention from app preferences, applied on the next save. */
  backupRetention: () => number;
  /** Read-only existence probe used to resolve a restored backup's links. */
  pathExists: (path: string) => Promise<boolean>;
  /** Asks for one replacement drawing after the restore report was accepted. */
  locateDrawing: () => Promise<LocatedDrawing | null>;
  listBackups: (projectId: string) => Promise<BackupEntry[]>;
  saveBackup: (
    projectId: string,
    contents: string,
    projectPath: string | null,
    retention: number,
  ) => Promise<void>;
  deleteBackup: (projectId: string, fileName: string) => Promise<void>;
  deleteAllBackups: (projectId: string) => Promise<void>;
  readText: (path: string) => Promise<string>;
  loadProjectData: (project: Project, path: string | null, dirty: boolean) => Promise<boolean>;
  confirm: (
    title: string,
    message: string,
    confirmLabel: string,
    options?: { danger?: boolean },
  ) => Promise<boolean>;
  /** The unsaved-changes guard, including its Save choice. */
  confirmDiscard: (message: string) => Promise<boolean>;
  notify: (message: string, kind?: "info" | "success" | "warning" | "error") => void;
  notifyError: (title: string, message: string) => Promise<void> | void;
}

let managerHandler: (() => Promise<boolean>) | null = null;

/** Registered by the project session so Preferences can open the same manager. */
export function setBackupManagerHandler(next: (() => Promise<boolean>) | null): void {
  managerHandler = next;
}

export function openBackupManagerDialog(): Promise<boolean> {
  return managerHandler ? managerHandler() : Promise.resolve(false);
}

/** Writes an on-demand backup without changing the open project's file. */
export async function backupProjectNow(ports: BackupPorts): Promise<boolean> {
  const project = store.project;
  if (!project) return false;
  if (!ports.desktop) {
    ports.notify(t("saveIntegrity.desktopOnly"), "info");
    return false;
  }
  try {
    await ports.saveBackup(
      project.id,
      serializeProject(project),
      store.projectPath,
      ports.backupRetention(),
    );
    ports.notify(t("saveIntegrity.backupSaved"), "success");
    return true;
  } catch (error) {
    logEvent("error", `manual backup failed: ${describeError(error)}`);
    await ports.notifyError(t("saveIntegrity.backupFailed"), describeError(error));
    return false;
  }
}

async function restoreBackup(
  ports: BackupPorts,
  entry: BackupEntry,
  replace: boolean,
): Promise<boolean> {
  const currentPath = store.projectPath;
  if (replace && !currentPath) {
    ports.notify(t("saveIntegrity.managerReplaceUnavailable"), "info");
    return false;
  }
  if (
    !(await ports.confirmDiscard(
      replace ? t("saveIntegrity.replaceDiscard") : t("saveIntegrity.restoreDiscard"),
    ))
  ) {
    return false;
  }
  if (replace && currentPath) {
    const confirmed = await ports.confirm(
      t("saveIntegrity.replaceTitle"),
      t("saveIntegrity.replaceNote", {
        time: formatDate(entry.modifiedAt, { dateStyle: "medium", timeStyle: "short" }),
        path: currentPath,
      }),
      t("saveIntegrity.replaceConfirm"),
      { danger: true },
    );
    if (!confirmed) return false;
  }
  const restored = parseProject(await ports.readText(entry.path));
  // A restored backup resolves relative links from the path recorded with the
  // backup and then from the open project's folder, which is the moved project
  // when the folder moved. Anything left unresolved is reported and located
  // explicitly before the project loads; no source drawing is written.
  const plan = await planRestoreLinks(
    restored,
    entry.projectPath,
    store.projectPath,
    ports.pathExists,
  );
  if (plan.unresolved.length) {
    const decision = await showRestoreLinkReport(plan.unresolved, entry.projectPath);
    if (decision !== "relink") {
      ports.notify(t("saveIntegrity.restoreCancelled"), "info");
      return false;
    }
    for (const item of plan.unresolved) {
      const picked = await ports.locateDrawing();
      if (!picked?.path) {
        ports.notify(t("saveIntegrity.restoreCancelled"), "info");
        return false;
      }
      const document = restored.documents.find((candidate) => candidate.id === item.documentId);
      if (document) applyRestoreRelink(document, picked.path, picked.name);
    }
  }
  applyRestoreLinkPlan(restored, plan);
  // Neither path writes a drawing or the project file. Replace binds the
  // backup to the open path so a later Save updates that file; restore-as-copy
  // keeps the project unsaved.
  const targetPath = replace ? currentPath : null;
  const loaded = await ports.loadProjectData(restored, targetPath, true);
  if (loaded) {
    ports.notify(
      replace
        ? t("saveIntegrity.replaceLoaded", { path: targetPath ?? "" })
        : t("saveIntegrity.copyLoaded"),
      "success",
    );
  }
  return loaded;
}

async function deleteBackup(ports: BackupPorts, projectId: string, entry: BackupEntry) {
  const confirmed = await ports.confirm(
    t("saveIntegrity.deleteTitle"),
    t("saveIntegrity.deleteNote", {
      time: formatDate(entry.modifiedAt, { dateStyle: "medium", timeStyle: "short" }),
    }),
    t("saveIntegrity.deleteConfirm"),
    { danger: true },
  );
  if (!confirmed) return false;
  await ports.deleteBackup(projectId, entry.fileName);
  const remaining = sortBackupsNewestFirst(await ports.listBackups(projectId));
  // Re-reading the store proves the file is gone instead of trusting the call.
  if (remaining.some((item) => item.fileName === entry.fileName)) {
    ports.notify(t("saveIntegrity.deleteFailed"), "warning");
    return false;
  }
  ports.notify(t("saveIntegrity.deleted"), "success");
  return true;
}

async function deleteAllBackups(
  ports: BackupPorts,
  projectId: string,
  count: number,
): Promise<boolean> {
  const confirmed = await ports.confirm(
    t("saveIntegrity.deleteAllTitle"),
    t("saveIntegrity.deleteAllNote", { count }),
    t("saveIntegrity.deleteAllConfirm"),
    { danger: true },
  );
  if (!confirmed) return false;
  await ports.deleteAllBackups(projectId);
  const remaining = await ports.listBackups(projectId);
  if (remaining.length) {
    ports.notify(t("saveIntegrity.deleteFailed"), "warning");
    return false;
  }
  ports.notify(t("saveIntegrity.deletedAll"), "success");
  return true;
}

/**
 * Opens the backup manager for the open project. Restore-as-copy is the default
 * path; replacing the open project is a separate, confirmed action that is only
 * offered when the project is already saved to a file.
 */
export async function openBackupManagerFlow(ports: BackupPorts): Promise<boolean> {
  const project = store.project;
  if (!project) {
    ports.notify(t("saveIntegrity.managerNoProject"), "info");
    return false;
  }
  if (!ports.desktop) {
    ports.notify(t("saveIntegrity.desktopOnly"), "info");
    return false;
  }
  try {
    let entries = sortBackupsNewestFirst(await ports.listBackups(project.id));
    let selectedPath: string | null = null;
    for (;;) {
      const choice = await openBackupManager(entries, {
        selectedPath,
        currentProjectPath: store.projectPath,
        retention: ports.backupRetention(),
      });
      if (choice.action === "cancel") return false;
      if (choice.action === "delete-all") {
        return await deleteAllBackups(ports, project.id, entries.length);
      }
      if (!choice.entry) return false;
      const entry = choice.entry;
      if (choice.action === "delete") {
        const deleted = await deleteBackup(ports, project.id, entry);
        if (!deleted) {
          entries = sortBackupsNewestFirst(await ports.listBackups(project.id));
          selectedPath = entry.path;
          if (!entries.length) return false;
          continue;
        }
        return true;
      }
      if (!canReplaceOpenProject(store.projectPath) && choice.action === "replace") return false;
      return await restoreBackup(ports, entry, choice.action === "replace");
    }
  } catch (error) {
    logEvent("error", `backup manager failed: ${describeError(error)}`);
    await ports.notifyError(t("saveIntegrity.restoreFailed"), describeError(error));
    return false;
  }
}
