import type { Locale } from "../../i18n";
import { formatDate } from "../../i18n/format";

/**
 * Pure model for the project status chip and its popover. The popover is a
 * summary with actions, never an activity log: every value here comes from the
 * live store, autosave preference, recovery summary or validation result that
 * the controller read once when the popover opened.
 */
export type StatusSaveState = "saved" | "unsaved" | "notSaved";
export type StatusAutosaveStatus = "enabled" | "paused" | "disabled";

export interface StatusOverviewInput {
  hasProject: boolean;
  projectPath: string | null;
  dirty: boolean;
  viewOnly: boolean;
  /** File modification time of the saved project; null when there is no file. */
  savedAt: number | null;
  lastBackupAt: number | null;
  autosaveStatus: StatusAutosaveStatus;
  autosaveIntervalSeconds: number;
  recoveryRecords: number;
  recoveryCheckpoints: number;
  /** Conflicted copies found in the project's folder; read once per open. */
  conflictedCopies: number;
  warnings: number;
  errors: number;
  desktop: boolean;
}

export interface StatusOverviewActionState {
  backupNow: boolean;
  reviewRecovery: boolean;
  openDoctor: boolean;
  /** Conflicted copies live beside the saved project, so a path is required. */
  openConflictedCopies: boolean;
  /** The pause/resume row is offered only while autosave is on or paused. */
  toggleAutosave: boolean;
  autosavePaused: boolean;
}

export interface StatusOverview {
  hasProject: boolean;
  desktop: boolean;
  saveState: StatusSaveState;
  viewOnly: boolean;
  savedAt: number | null;
  lastBackupAt: number | null;
  autosaveStatus: StatusAutosaveStatus;
  autosaveIntervalSeconds: number;
  recoveryRecords: number;
  recoveryCheckpoints: number;
  recoveryAvailable: boolean;
  conflictedCopies: number;
  warnings: number;
  errors: number;
  actions: StatusOverviewActionState;
}

export function buildStatusOverview(input: StatusOverviewInput): StatusOverview {
  const recoveryAvailable = input.recoveryRecords + input.recoveryCheckpoints > 0;
  return {
    hasProject: input.hasProject,
    desktop: input.desktop,
    saveState: input.dirty ? "unsaved" : input.projectPath ? "saved" : "notSaved",
    viewOnly: input.viewOnly,
    savedAt: input.savedAt,
    lastBackupAt: input.lastBackupAt,
    autosaveStatus: input.autosaveStatus,
    autosaveIntervalSeconds: input.autosaveIntervalSeconds,
    recoveryRecords: Math.max(0, input.recoveryRecords),
    recoveryCheckpoints: Math.max(0, input.recoveryCheckpoints),
    recoveryAvailable,
    conflictedCopies: Math.max(0, input.conflictedCopies),
    warnings: Math.max(0, input.warnings),
    errors: Math.max(0, input.errors),
    actions: {
      // A backup is an app-data copy, so it is safe in view-only mode too.
      backupNow: input.hasProject && input.desktop,
      reviewRecovery: input.hasProject && recoveryAvailable,
      openDoctor: input.hasProject,
      openConflictedCopies: input.hasProject && input.desktop && Boolean(input.projectPath),
      toggleAutosave: input.hasProject && input.autosaveStatus !== "disabled",
      autosavePaused: input.autosaveStatus === "paused",
    },
  };
}

/** Newest backup modification time, or null when none is usable. */
export function newestBackupAt(times: readonly number[]): number | null {
  let newest: number | null = null;
  for (const time of times) {
    if (!Number.isFinite(time)) continue;
    if (newest === null || time > newest) newest = time;
  }
  return newest;
}

/** Localized date and time for a saved or backed-up moment. */
export function formatStatusTime(value: number | null, locale?: Locale): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return formatDate(value, { dateStyle: "medium", timeStyle: "short", locale });
}
