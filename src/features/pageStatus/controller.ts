import { sourceStatus } from "../../source/sourceStatus";
import { store } from "../../state/store";
import {
  filterPageStatusRows,
  pageStatusFilterCounts,
  pageStatusRows,
  type PageSourceState,
  type PageStatusFilter,
  type PageStatusRow,
} from "./model";

/** Source-file states from the last completed monitor check, keyed by document. */
export function currentSourceStates(): Map<string, PageSourceState> {
  const states = new Map<string, PageSourceState>();
  for (const status of sourceStatus.summary.statuses) states.set(status.documentId, status.state);
  return states;
}

/**
 * Session UI state for the Pages panel filter. The filter is deliberately not
 * written to the project or to the store: it is a view on the page list, and it
 * survives a re-render because the controller, not the DOM, holds it.
 */
export class PageStatusController {
  private filter: PageStatusFilter = "all";
  private focusPending = false;

  get activeFilter(): PageStatusFilter {
    return this.filter;
  }

  /** Sets the filter; returns true when the visible page list changes. */
  setFilter(filter: PageStatusFilter): boolean {
    if (filter === this.filter) return false;
    this.filter = filter;
    // The panel is rebuilt on refresh, so the pressed button needs focus back.
    this.focusPending = true;
    return true;
  }

  /** One-shot flag: the panel should focus the active filter after rendering. */
  takeFocusRequest(): boolean {
    const pending = this.focusPending;
    this.focusPending = false;
    return pending;
  }

  rows(
    project = store.project,
    states: ReadonlyMap<string, PageSourceState> = currentSourceStates(),
  ) {
    if (!project) return [] as PageStatusRow[];
    return pageStatusRows(project, states);
  }

  /** Rows the Pages panel should render for the active filter. */
  visible(
    project = store.project,
    states: ReadonlyMap<string, PageSourceState> = currentSourceStates(),
  ): PageStatusRow[] {
    return this.visibleFrom(this.rows(project, states));
  }

  /** Filter already-built rows, so one render reads the project only once. */
  visibleFrom(rows: readonly PageStatusRow[]): PageStatusRow[] {
    return filterPageStatusRows(rows, this.filter);
  }

  counts(rows: readonly PageStatusRow[]): Record<PageStatusFilter, number> {
    return pageStatusFilterCounts(rows);
  }

  /** Back to "all"; used when the page list is reset for a new project. */
  reset(): void {
    this.filter = "all";
  }
}

/** One controller per window; the Pages panel reads the filter on every render. */
export const pageStatus = new PageStatusController();
