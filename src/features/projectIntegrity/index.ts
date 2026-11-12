export { validateProject, projectShape, compareProjectShape } from "../../model/integrity";
export type {
  ProjectIssue,
  ProjectIssueEntity,
  ProjectIssueSeverity,
  ProjectShape,
} from "../../model/integrity";
export {
  applyRepair,
  availableRepairs,
  repairDanglingReferences,
  repairDuplicateIds,
  repairStaleOcr,
} from "./repair";
export type { RepairKind, RepairResult } from "./repair";
export { buildDoctorDiagnostics, runLoadReport, runProjectDoctor } from "./doctor";
export type {
  DoctorLoadReport,
  LoadReportDecision,
  LoadReportOutcome,
  ProjectDoctorAction,
  ProjectDoctorDialogState,
  ProjectDoctorHost,
  ProjectDoctorOptions,
  ProjectDoctorOutcome,
} from "./doctor";
export { confirmProjectValidationWarnings, projectDoctorDialog } from "./ui";
export type { ProjectDoctorDialogOptions, ProjectDoctorDialogResult } from "./ui";
export {
  confirmUnusedDrawings,
  createDoctorSourceHost,
  deleteUnusedDrawings,
  loadDoctorSources,
} from "./sourceAvailability";
export type { DoctorSourceCleanupResult, DoctorSourceHost } from "./sourceAvailability";
export {
  buildSourceSnapshot,
  classifyManagedCopies,
  emptySourceSnapshot,
  referencedSourceKeys,
} from "./sourceModel";
export type { DoctorSourceSnapshot } from "./sourceModel";
export type { ManagedCopyEntry } from "./sourceFiles";
export { addDoctorSources } from "./sourceUi";
export type { DoctorSourceRequest } from "./sourceUi";
