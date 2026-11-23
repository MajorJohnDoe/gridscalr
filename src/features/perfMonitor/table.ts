/**
 * The panel's details table: one row per span with count, p50, p95 and max.
 * Rebuilt only while it is open, so the simple view costs nothing.
 */

import { el } from "../../ui/dom";
import { formatMs, type SpanRow } from "./model";

const MAX_ROWS = 8;

export function renderSpanTable(
  body: HTMLElement,
  spans: readonly SpanRow[],
  emptyLabel: string,
): void {
  if (!spans.length) {
    const row = el("tr");
    const cell = el("td", "perf-table-empty", emptyLabel);
    cell.colSpan = 5;
    row.append(cell);
    body.replaceChildren(row);
    return;
  }
  body.replaceChildren(
    ...spans.slice(0, MAX_ROWS).map((span) => {
      const row = el("tr");
      row.append(
        el("td", "perf-table-name", span.name),
        el("td", "", String(span.count)),
        el("td", "", formatMs(span.p50)),
        el("td", "", formatMs(span.p95)),
        el("td", "", formatMs(span.max)),
      );
      return row;
    }),
  );
}
