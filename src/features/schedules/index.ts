/**
 * Public surface of the schedules feature. Other modules import only this
 * index: the pure model, the cards and the right-dock panel/builder.
 * The measurement and space sources stay internal so one engine computes every
 * table.
 */
export * from "./model";
export * from "./layout";
export * from "./placement";
export * from "./csv";
export * from "./csvUi";
export {
  clearSummaryFilters,
  createAndPlaceStandardSchedule,
  createStandardSchedule,
  isSummaryOpen,
  openPlacementDialog,
  openRowRangeDialog,
  openScheduleBuilder,
  placementMeasure,
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
export type { PlacementHost, PlacementOptions, SummaryPanelFilters, SummaryPanelHost } from "./ui";
export { cachedSummary, clearSummaryCache, computeSummary, summaryCacheKey } from "./summary";
export type { SummaryCardValue, SummaryModel, SummaryTable, SummaryTableRow } from "./summary";
