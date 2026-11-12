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
  planRepair,
  repairDanglingReferences,
  repairDuplicateIds,
  repairForCode,
  repairStaleOcr,
  REPAIR_ORDER,
} from "./repair";
export type {
  RepairAction,
  RepairChange,
  RepairKind,
  RepairPlan,
  RepairResult,
  RepairRun,
  RepairScope,
} from "./repair";
export {
  DEFAULT_DOCTOR_FILTER,
  countDoctorIssues,
  doctorFilterKinds,
  doctorShownRepairs,
  filterDoctorIssues,
  isDefaultDoctorFilter,
  issueScope,
} from "./repairFilter";
export type { DoctorIssueFilter, DoctorRepairFilter, DoctorSeverityFilter } from "./repairFilter";
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
export { addRepairSection } from "./repairUi";
export type { DoctorRepairRequest, DoctorRepairSectionOptions } from "./repairUi";
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
