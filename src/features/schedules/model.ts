/**
 * Pure model surface for schedules. The rules are split by concern: the field
 * catalogue, filters, stable sorting, totals, computation, definition
 * mutations, summary roles and the revision cache. Nothing here imports UI, so
 * the panel, the builder, a later CSV phase and the tests share one rule set.
 */
export {
  builtInFieldLabel,
  customCellText,
  fieldResolves,
  makeColumn,
  resolveColumns,
  scheduleFieldInfo,
  scheduleFieldsForSource,
  scheduleRefs,
} from "./model/fields";
export type { ScheduleFieldInfo } from "./model/fields";
export {
  filterSignature,
  itemMatchesFilters,
  scheduleFilterContext,
  spaceMatchesFilters,
} from "./model/filters";
export type { ScheduleFilterContext } from "./model/filters";
export { sortScheduleRows } from "./model/sort";
export { computeTotal, computeTotals } from "./model/totals";
export { computeSchedule, scheduleDisplayEntries } from "./model/compute";
export type { ComputeScheduleOptions } from "./model/compute";
export {
  createSchedule,
  deleteSchedule,
  duplicateSchedule,
  emptyScheduleDraft,
  findSchedule,
  normalizeScheduleName,
  projectSchedules,
  scheduleDraftFor,
  scheduleDraftProblems,
  standardScheduleDraft,
  uniqueScheduleName,
  updateSchedule,
} from "./model/definition";
export type {
  DeleteScheduleResult,
  ScheduleDraft,
  ScheduleMutationResult,
} from "./model/definition";
export {
  setCategorySummaryRole,
  setCountTypeSummaryRole,
  summaryRolesPresent,
} from "./model/roles";
export {
  cachedSchedule,
  clearScheduleCache,
  createKeyCache,
  scheduleCacheKey,
} from "./model/cache";
export type { KeyCache } from "./model/cache";
export type {
  ScheduleCell,
  ScheduleColumnView,
  ScheduleDisplayEntry,
  ScheduleGroup,
  ScheduleProblem,
  ScheduleProblemCode,
  ScheduleResult,
  ScheduleRow,
  ScheduleTotalValue,
} from "./model/types";
