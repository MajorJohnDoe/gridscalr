import { el, clear } from "../../../ui/dom";
import { t } from "../../../i18n";
import type {
  ScheduleColumnView,
  ScheduleDisplayEntry,
  ScheduleRow,
  ScheduleTotalValue,
} from "../model";
import {
  scheduleCaption,
  scheduleEmptyRow,
  scheduleGroupRowElement,
  scheduleHead,
  scheduleRowElement,
  scheduleTotalRow,
} from "./tableParts";

/**
 * The live takeoff table. It is virtualised: a 1 000-row takeoff table renders only
 * the rows inside the scroll window plus a small overscan, with spacer rows
 * preserving the scroll height.
 */

export const SCHEDULE_ROW_HEIGHT = 28;
const OVERSCAN = 8;

export interface TableWindow {
  start: number;
  end: number;
}

/** Pure row window so the 1 000-row behaviour is testable without a browser. */
export function tableWindow(
  total: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight = SCHEDULE_ROW_HEIGHT,
  overscan = OVERSCAN,
): TableWindow {
  if (total <= 0) return { start: 0, end: 0 };
  const height = viewportHeight > 0 ? viewportHeight : rowHeight * 10;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(total, Math.ceil((scrollTop + height) / rowHeight) + overscan);
  return { start, end: Math.max(start, end) };
}

export interface PanelTableOptions {
  columns: readonly ScheduleColumnView[];
  entries: readonly ScheduleDisplayEntry[];
  totals: readonly ScheduleTotalValue[];
  caption: string;
  onNavigate?: (row: ScheduleRow) => void;
  previousScroll?: number;
  /** Empty-state text when the entries are empty. */
  emptyText?: string;
}

function spacer(columnCount: number, height: number): HTMLTableRowElement {
  const row = el("tr", "schedules-spacer");
  const cell = el("td");
  cell.colSpan = Math.max(1, columnCount);
  cell.style.height = `${height}px`;
  row.append(cell);
  return row;
}

export function panelTable(options: PanelTableOptions): HTMLElement {
  const { columns, entries, totals, onNavigate } = options;
  const wrap = el("div", "schedules-table-wrap");
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", options.caption);
  const table = el("table", "schedules-table");
  table.style.minWidth = `${Math.max(320, columns.length * 84)}px`;
  table.append(scheduleCaption(options.caption));
  const colgroup = el("colgroup");
  for (const column of columns) {
    const col = el("col");
    col.style.width = `${column.column.width ?? 12}%`;
    colgroup.append(col);
  }
  const thead = el("thead");
  thead.append(scheduleHead(columns));
  const tbody = el("tbody");
  table.append(colgroup, thead, tbody);
  if (totals.length) {
    const tfoot = el("tfoot");
    tfoot.append(scheduleTotalRow(totals, columns));
    table.append(tfoot);
  }
  wrap.append(table);

  const columnCount = Math.max(1, columns.length);
  if (!entries.length) {
    tbody.append(scheduleEmptyRow(columnCount, options.emptyText ?? t("schedules.table.noRows")));
    return wrap;
  }

  let frame = 0;
  let renderedStart = -1;
  let renderedEnd = -1;

  const renderWindow = () => {
    const scrollTop = wrap.scrollTop;
    const scrollLeft = wrap.scrollLeft;
    const { start, end } = tableWindow(entries.length, scrollTop, wrap.clientHeight);
    if (start === renderedStart && end === renderedEnd && tbody.childElementCount > 0) return;
    renderedStart = start;
    renderedEnd = end;
    clear(tbody);
    if (start > 0) tbody.append(spacer(columnCount, start * SCHEDULE_ROW_HEIGHT));
    for (const entry of entries.slice(start, end)) {
      tbody.append(
        entry.type === "group"
          ? scheduleGroupRowElement(entry.group, columnCount)
          : scheduleRowElement(entry.row, columns, onNavigate),
      );
    }
    if (end < entries.length) {
      tbody.append(spacer(columnCount, (entries.length - end) * SCHEDULE_ROW_HEIGHT));
    }
    wrap.scrollTop = scrollTop;
    wrap.scrollLeft = scrollLeft;
  };

  wrap.addEventListener(
    "scroll",
    () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        renderWindow();
      });
    },
    { passive: true },
  );
  renderWindow();
  if (options.previousScroll) wrap.scrollTop = options.previousScroll;
  requestAnimationFrame(renderWindow);
  return wrap;
}
