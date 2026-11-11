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
export { openRecoveryCenter, setRecoveryCenterHandler } from "./chooser";
export {
  baseVersionLabelKey,
  centerIsEmpty,
  defaultCenterSelection,
  findCenterEntry,
  groupRecoveryEntries,
  needsRestoreConfirmation,
} from "./centerModel";
export type {
  RecoveryCenterAction,
  RecoveryCenterChoice,
  RecoveryInstanceGroup,
  RecoveryProjectGroup,
} from "./centerModel";
export {
  EMPTY_RECOVERY_USAGE,
  RECOVERY_BUDGET,
  planRecoveryPrune,
  protectedRecordIds,
  recoveryUsage,
  serializedBytes,
  textBytes,
} from "./budget";
export type {
  RecoveryBudget,
  RecoveryProjectUsage,
  RecoveryPruneOptions,
  RecoveryUsage,
} from "./budget";
export { AutosaveError, describeAutosaveFailure, isQuotaExceeded } from "./failure";
export { openRecoveryCenter as showRecoveryCenter } from "./centerUi";
export { showSessionBanner } from "./ui";
export type { BannerAction, BannerOptions } from "./ui";
export { getRecoverySummary, refreshRecoverySummary, subscribeRecoverySummary } from "./summary";
export { getRecoveryUsage } from "./summary";
export {
  clearAllRecovery,
  clearAutosavesForInstance,
  deleteRecoveryRecord,
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
