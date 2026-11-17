import type { PageId } from "../../../model/types";

/**
 * Session-only takeoff panel state: whether the right-dock Takeoff tab is
 * active, which schedule is shown and the panel-level filter chips. None of it
 * is stored in the project, so opening a project never changes it.
 */

export interface SummaryPanelFilters {
  pageId: PageId | null;
  categoryId: string | null;
  spaceId: string | null;
}

let open = false;
let projectId: string | null = null;
let selectedScheduleId: string | null = null;
/** True when the picker's built-in preview was chosen explicitly. */
let builtInSelected = false;
let filters: SummaryPanelFilters = { pageId: null, categoryId: null, spaceId: null };

export function isSummaryOpen(): boolean {
  return open;
}

export function setSummaryOpen(value: boolean): void {
  open = value;
}

export function toggleSummary(): void {
  open = !open;
}

/** Resets the schedule picker and chips when a different project is shown. */
export function syncSummaryProject(id: string | null): void {
  if (id === projectId) return;
  projectId = id;
  selectedScheduleId = null;
  builtInSelected = false;
  filters = { pageId: null, categoryId: null, spaceId: null };
}

export function summarySelectedScheduleId(): string | null {
  return selectedScheduleId;
}

export function setSummarySelectedScheduleId(id: string | null): void {
  selectedScheduleId = id;
  if (id) builtInSelected = false;
}

/**
 * The picker's built-in preview was chosen explicitly. It only shows the
 * built-in table; it does not offer to create another takeoff table.
 */
export function selectSummaryBuiltIn(): void {
  selectedScheduleId = null;
  builtInSelected = true;
}

export function summaryBuiltInSelected(): boolean {
  return builtInSelected;
}

export function summaryPanelFilters(): SummaryPanelFilters {
  return filters;
}

export function setSummaryFilter<K extends keyof SummaryPanelFilters>(
  key: K,
  value: SummaryPanelFilters[K],
): void {
  filters = { ...filters, [key]: value };
}

export function clearSummaryFilters(): void {
  filters = { pageId: null, categoryId: null, spaceId: null };
}

/** True when at least one chip narrows the table. */
export function summaryFiltersActive(): boolean {
  return Boolean(filters.pageId || filters.categoryId || filters.spaceId);
}
