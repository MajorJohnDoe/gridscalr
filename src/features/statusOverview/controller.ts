import { store } from "../../state/store";
import type { BackupEntry } from "../saveIntegrity";
import { validateProject } from "../projectIntegrity";
import { autosaveState, getRecoverySummary } from "../sessionRecovery";
import { outsideReferenceIssues } from "../sourceStorage";
import { buildStatusOverview, newestBackupAt, type StatusOverview } from "./model";

export interface StatusOverviewHost {
  desktop: boolean;
  /** Reads the rolling backup list for one project. Called once per popover open. */
  listBackups: (projectId: string) => Promise<BackupEntry[]>;
}

/**
 * Builds the popover model from the live store, the autosave preference, the
 * in-memory recovery summary and the current validation result. The backup list
 * is the only disk read; it happens once when the popover opens, never on a
 * render or a timer. A failed read falls back to an unknown backup time instead
 * of blocking the popover.
 */
export async function collectStatusOverview(host: StatusOverviewHost): Promise<StatusOverview> {
  const project = store.project;
  let lastBackupAt: number | null = null;
  if (project && host.desktop) {
    try {
      const entries = await host.listBackups(project.id);
      lastBackupAt = newestBackupAt(entries.map((entry) => entry.modifiedAt));
    } catch {
      lastBackupAt = null;
    }
  }
  const issues = project
    ? [...validateProject(project), ...outsideReferenceIssues(project, store.projectPath)]
    : [];
  const autosave = autosaveState();
  const recovery = getRecoverySummary();
  return buildStatusOverview({
    hasProject: Boolean(project),
    projectPath: store.projectPath,
    dirty: store.dirty,
    viewOnly: store.readOnly,
    savedAt: store.projectPath ? (store.fileStamp?.modifiedAt ?? null) : null,
    lastBackupAt,
    autosaveStatus: autosave.status,
    autosaveIntervalSeconds: autosave.intervalSeconds,
    recoveryRecords: recovery.count,
    recoveryCheckpoints: recovery.checkpoints,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    errors: issues.filter((issue) => issue.severity === "error").length,
    desktop: host.desktop,
  });
}
