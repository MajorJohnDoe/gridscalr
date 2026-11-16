/**
 * Public surface of the schedules feature. Other modules import only this
 * index: the pure model, the summary cards and the right-dock panel/builder.
 * The measurement and space sources stay internal so one engine computes every
 * table.
 */
export * from "./model";
export {
  clearSummaryFilters,
  isSummaryOpen,
  openScheduleBuilder,
  openSummaryRolesDialog,
  renderSummaryPanel,
  SCHEDULE_ROW_HEIGHT,
  setSummaryFilter,
  setSummaryOpen,
  setSummarySelectedScheduleId,
  summaryFiltersActive,
  summaryPanelFilters,
  summarySelectedScheduleId,
  syncSummaryProject,
  tableWindow,
  toggleSummary,
} from "./ui";
export type { SummaryPanelFilters, SummaryPanelHost, SummaryRoleFocus } from "./ui";
export { cachedSummary, clearSummaryCache, computeSummary, summaryCacheKey } from "./summary";
export type { SummaryCardValue, SummaryModel, SummaryTable, SummaryTableRow } from "./summary";
