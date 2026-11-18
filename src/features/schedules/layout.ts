import { t } from "../../i18n";
import type { ScheduleResult } from "./model/types";
import { cellsFor, columnBoxes, gridLines, type BodyRow, type RowSeparator } from "./layoutCells";
import { estimateTextWidth, ellipsizeText, type MeasureText } from "./layoutText";
import { bandRoleFor, type ScheduleBand } from "./layoutStyle";

export { ellipsizeText, estimateTextWidth };
export type { MeasureText };
export * from "./layoutStyle";

/**
 * Pure table layout shared by the canvas renderer and the PDF exporter. The
 * function never measures text itself: the caller injects a measure function
 * (`canvas.measureText` on screen, the embedded PDF font on export), so both
 * surfaces lay out the same cells, lines and overflow for the same input.
 *
 * Coordinates are box-local page points: (0, 0) is the top-left corner of the
 * table and +y points down. Each renderer applies its own zoom or PDF viewport
 * transform, so a layout has no surface-specific value in it.
 */

export const TABLE_FONT_SIZE = 7;
export const TABLE_MIN_FONT_SIZE = 4.5;
export const TABLE_MAX_FONT_SIZE = 18;
/** Increment used when a table has to shrink to fit its box. */
const FONT_STEP = 0.25;
const ROW_HEIGHT_RATIO = 1.55;
const CELL_PADDING_RATIO = 0.45;

export type ScheduleCellRole = "header" | "row" | "group" | "subtotal" | "total" | "empty";

export interface ScheduleTableText {
  text: string;
  /** Left edge of the cell; the text starts here plus padding. */
  x: number;
  /** Top edge of the row. */
  y: number;
  width: number;
  height: number;
  align: "left" | "right";
  bold: boolean;
  role: ScheduleCellRole;
}

export type ScheduleLineRole = "grid" | "outer" | "header" | "group" | "subtotal" | "total";

export interface ScheduleTableLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  role: ScheduleLineRole;
}

export interface ScheduleColumnBox {
  field: string;
  label: string;
  x: number;
  width: number;
  align: "left" | "right";
}

export interface ScheduleLayoutInput {
  result: ScheduleResult;
  width: number;
  height: number;
  measure: MeasureText;
  fontSize?: number;
  /** 0-based first data row. */
  rowStart?: number;
  /** Maximum data rows; missing means every remaining row. */
  rowLimit?: number | null;
  showHeader?: boolean;
  showTotals?: boolean;
}

export interface ScheduleTableLayout {
  width: number;
  height: number;
  fontSize: number;
  rowHeight: number;
  headerHeight: number;
  /** Horizontal cell padding in box units. */
  padding: number;
  columns: ScheduleColumnBox[];
  header: ScheduleTableText[];
  cells: ScheduleTableText[];
  lines: ScheduleTableLine[];
  /** Background bands, one per drawn row, in paint order. */
  bands: ScheduleBand[];
  /** True when some rows did not fit or the range is narrower than the source. */
  overflow: boolean;
  overflowReason: "range" | "box" | null;
  /** First data row a continuation placement should start with, if any. */
  continuationRowStart: number | null;
  /** Data rows actually drawn. */
  visibleRows: number;
  totalRows: number;
  empty: boolean;
}

/**
 * Body rows intersecting the requested range. Slicing here rather than after
 * building every row keeps a placed table cheap even when the schedule has
 * thousands of rows.
 */
function buildBodyRows(result: ScheduleResult, start: number, end: number): BodyRow[] {
  const rows: BodyRow[] = [];
  let index = 0;
  if (!result.groups.length) {
    const from = Math.min(start, result.rows.length);
    const to = Math.min(end, result.rows.length);
    for (let rowIndex = from; rowIndex < to; rowIndex += 1) {
      rows.push({ kind: "row", first: rowIndex, last: rowIndex, row: result.rows[rowIndex] });
    }
    return rows;
  }
  for (const group of result.groups) {
    const first = index;
    const last = first + Math.max(0, group.rows.length - 1);
    const overlaps = last >= start && first < end;
    if (result.rowMode === "grouped") {
      if (overlaps) {
        rows.push({
          kind: "subtotal",
          first,
          last,
          values: group.subtotals,
          text: group.label,
        });
      }
      index += group.rows.length;
      continue;
    }
    if (!overlaps) {
      index += group.rows.length;
      continue;
    }
    rows.push({ kind: "group", first, last, text: group.label });
    for (const row of group.rows) {
      if (index >= start && index < end) {
        rows.push({ kind: "row", first: index, last: index, row });
      }
      index += 1;
    }
    if (group.subtotals.length) {
      rows.push({
        kind: "subtotal",
        first,
        last,
        values: group.subtotals,
        text: t("schedules.table.subtotal"),
      });
    }
  }
  return rows;
}

export function layoutScheduleTable(input: ScheduleLayoutInput): ScheduleTableLayout {
  const width = Math.max(1, input.width);
  const height = Math.max(1, input.height);
  const measure = input.measure;
  const start = Math.max(0, Math.floor(input.rowStart ?? 0));
  const limit =
    input.rowLimit === null || input.rowLimit === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.floor(input.rowLimit));
  const end = start + limit;
  const totalRows = input.result.rows.length;
  const showHeader = input.showHeader !== false;
  const totals = input.showTotals === true ? input.result.totals : [];

  const body = totalRows === 0 ? [] : buildBodyRows(input.result, start, end);

  const requested = Math.max(
    TABLE_MIN_FONT_SIZE,
    Math.min(TABLE_MAX_FONT_SIZE, input.fontSize ?? TABLE_FONT_SIZE),
  );
  const rowHeightAt = (size: number) => size * ROW_HEIGHT_RATIO;
  const fixedRowsAt = () => (showHeader ? 1 : 0) + (totals.length ? 1 : 0);
  const fits = (size: number) => (body.length + fixedRowsAt()) * rowHeightAt(size) <= height;

  let fontSize = requested;
  while (fontSize > TABLE_MIN_FONT_SIZE && !fits(fontSize)) fontSize -= FONT_STEP;
  fontSize = Math.max(TABLE_MIN_FONT_SIZE, Math.round(fontSize * 100) / 100);
  const rowHeight = rowHeightAt(fontSize);
  const padding = fontSize * CELL_PADDING_RATIO;

  let included = body;
  let boxOverflow = false;
  if (!fits(TABLE_MIN_FONT_SIZE) && body.length) {
    const budget = Math.max(0, Math.floor(height / rowHeight) - fixedRowsAt());
    included = body.slice(0, budget);
    boxOverflow = included.length < body.length;
  }

  const columns = columnBoxes(input.result, width, padding);
  const headerHeight = showHeader && height >= rowHeight ? rowHeight : 0;
  const totalRowHeight = totals.length ? rowHeight : 0;
  let cursor = headerHeight;
  const header: ScheduleTableText[] = [];
  if (showHeader && headerHeight > 0) {
    for (const column of columns) {
      header.push({
        text: ellipsizeText(column.label, column.width - padding * 2, fontSize, true, measure),
        x: column.x,
        y: 0,
        width: column.width,
        height: headerHeight,
        align: column.align,
        bold: true,
        role: "header",
      });
    }
  } else if (showHeader) {
    boxOverflow = true;
  }

  const cells: ScheduleTableText[] = [];
  const bands: ScheduleBand[] = [];
  const separators: RowSeparator[] = [];
  const grouped = input.result.rowMode === "grouped";
  if (headerHeight > 0) bands.push({ role: "header", x: 0, y: 0, width, height: headerHeight });
  if (headerHeight > 0 && height > headerHeight) {
    separators.push({ y: headerHeight, role: "header" });
  }
  if (!included.length) {
    cells.push({
      text: t("schedules.table.noRows"),
      x: padding,
      y: cursor,
      width: Math.max(1, width - padding * 2),
      height: Math.max(rowHeight, Math.min(height - cursor, rowHeight)),
      align: "left",
      bold: false,
      role: "empty",
    });
    cursor += rowHeight;
  }
  for (const row of included) {
    cells.push(...cellsFor(row, columns, fontSize, padding, measure, cursor, rowHeight));
    bands.push({
      role: bandRoleFor(row.kind, row.first, grouped),
      x: 0,
      y: cursor,
      width,
      height: rowHeight,
    });
    // A group header and a subtotal are section rows: each one is separated from
    // the row above so the eye can find the group and its total.
    if ((row.kind === "group" || row.kind === "subtotal") && cursor > 0) {
      separators.push({ y: cursor, role: row.kind });
    }
    cursor += rowHeight;
  }

  if (totals.length && cursor + totalRowHeight <= height) {
    const totalTop = cursor;
    bands.push({ role: "total", x: 0, y: totalTop, width, height: totalRowHeight });
    if (totalTop > 0) separators.push({ y: totalTop, role: "total" });
    cells.push(
      ...cellsFor(
        {
          kind: "total",
          first: 0,
          last: Math.max(0, totalRows - 1),
          values: totals,
          text: t("schedules.table.total"),
        },
        columns,
        fontSize,
        padding,
        measure,
        totalTop,
        totalRowHeight,
      ),
    );
  } else if (totals.length) {
    boxOverflow = true;
  }

  const drawn = new Set<number>();
  for (const row of included) {
    // A group header and a subtotal span their whole group; they describe rows
    // but are not themselves data rows. Only real rows, or a grouped-mode row
    // that stands in for its group, count toward the visible window.
    if (row.kind !== "row" && !(row.kind === "subtotal" && input.result.rowMode === "grouped")) {
      continue;
    }
    const from = row.first;
    const to = Math.min(row.last, end - 1, totalRows - 1);
    for (let index = from; index <= to; index += 1) drawn.add(index);
  }
  const lastIncluded = drawn.size ? Math.max(...drawn) : start - 1;
  const continuationRowStart = lastIncluded + 1 < totalRows ? lastIncluded + 1 : null;
  const overflow = continuationRowStart !== null || boxOverflow;

  return {
    width,
    height,
    fontSize,
    rowHeight,
    headerHeight,
    padding,
    columns,
    header,
    cells,
    lines: gridLines(columns, width, height, separators),
    bands,
    overflow,
    overflowReason: overflow ? (boxOverflow ? "box" : "range") : null,
    continuationRowStart,
    visibleRows: drawn.size,
    totalRows,
    empty: totalRows === 0,
  };
}
