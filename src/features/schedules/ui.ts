/**
 * UI surface of the schedules feature. The panel and the builder own their DOM;
 * the shell only renders the panel and toggles the tab.
 */
export { renderSummaryPanel } from "./ui/panel";
export type { SummaryPanelHost } from "./ui/panel";
export { openScheduleBuilder } from "./ui/builder";
export { openPlacementDialog, openRowRangeDialog, placementMeasure } from "./ui/placement";
export type { PlacementHost } from "./ui/placement";
export { openSummaryRolesDialog } from "./ui/roles";
export type { SummaryRoleFocus } from "./ui/roles";
export { SCHEDULE_ROW_HEIGHT, tableWindow } from "./ui/panelTable";
export {
  clearSummaryFilters,
  isSummaryOpen,
  setSummaryFilter,
  setSummaryOpen,
  setSummarySelectedScheduleId,
  summaryFiltersActive,
  summaryPanelFilters,
  summarySelectedScheduleId,
  syncSummaryProject,
  toggleSummary,
} from "./ui/state";
export type { SummaryPanelFilters } from "./ui/state";
