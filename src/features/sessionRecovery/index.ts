export { SessionRecoveryController } from "./controller";
export {
  autosaveIntervalMs,
  autosaveState,
  setAutosaveEnabled,
  setAutosaveIntervalSeconds,
  setAutosavePausedForSession,
  subscribeAutosaveState,
} from "./autosavePreference";
export type { AutosaveState, AutosaveStatus } from "./autosavePreference";
export type { SessionRecoveryHost, OpenDecision, OpenProjectInfo } from "./ports";
export { recordStructuralCheckpoint } from "./checkpoint";
export { openRecoveryChooser, setRecoveryChooserHandler } from "./chooser";
export { showSessionBanner } from "./ui";
export type { BannerAction, BannerOptions } from "./ui";
export { getRecoverySummary, refreshRecoverySummary, subscribeRecoverySummary } from "./summary";
export {
  AutosaveError,
  clearAllRecovery,
  clearAutosavesForInstance,
  deleteRecoveryRecord,
  describeAutosaveFailure,
  listRecoveryRecords,
  writeAutosaveRecord,
  writeCheckpointRecord,
} from "./autosave";
export type { AutosaveInput, CheckpointInput } from "./autosave";
export {
  classifyBaseVersion,
  collectRecoverableEntries,
  isBasedOnOlderFile,
  recoverySummary,
} from "./recovery";
export type { BaseVersionState, RecoverableEntry, StampReader } from "./recovery";
export {
  LEASE_HEARTBEAT_MS,
  LEASE_STALE_MS,
  classifyLease,
  createLease,
  isLeaseStale,
  leasePath,
} from "./lease";
export type { LeaseRead, LeaseState, ProjectLease } from "./lease";
export { appVersion, hostLabel, instanceId } from "./instance";
export {
  AUTOSAVE_RECORDS_PER_PROJECT,
  CHECKPOINTS_PER_PROJECT,
  autosaveRecordId,
  isRecoveryRecord,
  sortRecoveryRecords,
} from "./record";
export type { RecoveryKind, RecoveryPreview, RecoveryRecord, RecoverySummary } from "./record";
