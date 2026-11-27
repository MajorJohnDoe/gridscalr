import type { ScheduleFieldRef } from "../../model/types";
import type { ScheduleResult, ScheduleRow, ScheduleTotalValue } from "./model/types";
import type {
  ScheduleCellRole,
  ScheduleColumnBox,
  ScheduleLineRole,
  ScheduleTableLine,
  ScheduleTableText,
} from "./layout";
import { ellipsizeText, type MeasureText } from "./layoutText";
import { placeTotals } from "./model/totals";

/**
 * Cell, column and grid construction for the shared schedule layout. Kept
 * apart from the fit algorithm so both stay readable and each renderer still
 * consumes one layout value.
 */

const MIN_COLUMN_WIDTH = 8;

export interface BodyRow {
  kind: Exclude<ScheduleCellRole, "header" | "empty">;
  first: number;
  last: number;
  row?: ScheduleRow;
  values?: readonly ScheduleTotalValue[];
  text?: string;
}

export function columnBoxes(
  result: ScheduleResult,
  width: number,
  padding: number,
): ScheduleColumnBox[] {
  if (!result.columns.length) {
    return [{ field: "", label: "", x: 0, width, align: "left" }];
  }
  const relative = result.columns.map((column) => {
    const value = column.column.width;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 12;
  });
  const total = relative.reduce((sum, value) => sum + value, 0) || 1;
  const available = Math.max(1, width - padding * 2);
  const boxes: ScheduleColumnBox[] = [];
  let x = padding;
  result.columns.forEach((column, index) => {
    const share = index === result.columns.length - 1 ? available - (x - padding) : 0;
    const cellWidth = Math.max(MIN_COLUMN_WIDTH, share || (relative[index] / total) * available);
    boxes.push({
      field: column.field,
      label: column.label,
      x,
      width: cellWidth,
      align: column.numeric ? "right" : "left",
    });
    x += cellWidth;
  });
  return boxes;
}

function totalText(values: readonly ScheduleTotalValue[], field: ScheduleFieldRef): string {
  return values.find((value) => value.field === field)?.text ?? "";
}

export function cellsFor(
  row: BodyRow,
  columns: ScheduleColumnBox[],
  fontSize: number,
  padding: number,
  measure: MeasureText,
  top: number,
  height: number,
): ScheduleTableText[] {
  // The total row uses the shared placement rule; a total on the label column,
  // a hidden field or a second total for the same field stays on the foot line.
  const placement = row.kind === "total" && row.values ? placeTotals(columns, row.values) : null;
  return columns.map((column, index) => {
    let text = "";
    let align = column.align;
    let bold = row.kind === "total" || row.kind === "subtotal";
    if (row.kind === "row" && row.row) {
      text = row.row.cells[index]?.text ?? "";
      bold = false;
    } else if (row.kind === "group") {
      text = index === 0 ? (row.text ?? "") : "";
      align = "left";
      bold = true;
    } else if (placement) {
      text = placement.placed[index]?.text ?? "";
      if (index === 0) text = row.text ?? "";
    } else if (row.values) {
      text = totalText(row.values, column.field);
      if (index === 0 && !text) text = row.text ?? "";
    }
    return {
      text: ellipsizeText(text, column.width - padding * 2, fontSize, bold, measure),
      x: column.x,
      y: top,
      width: column.width,
      height,
      align,
      bold,
      role: row.kind,
    };
  });
}

/** A horizontal section rule: header bottom, group header, subtotal or total. */
export interface RowSeparator {
  y: number;
  role: Extract<ScheduleLineRole, "header" | "group" | "subtotal" | "total">;
}

/** Two weights: a light grid inside the body, a firm rule at every section. */
const GRID_WEIGHT = 0.4;
const RULE_WEIGHT = 0.8;

export function gridLines(
  columns: ScheduleColumnBox[],
  width: number,
  height: number,
  separators: readonly RowSeparator[],
): ScheduleTableLine[] {
  const lines: ScheduleTableLine[] = [];
  for (const column of columns) {
    lines.push({
      x1: column.x,
      y1: 0,
      x2: column.x,
      y2: height,
      width: GRID_WEIGHT,
      role: "grid",
    });
  }
  const drawn = new Set<number>();
  for (const separator of separators) {
    if (separator.y <= 0 || separator.y >= height) continue;
    const key = Math.round(separator.y * 100);
    if (drawn.has(key)) continue;
    drawn.add(key);
    lines.push({
      x1: 0,
      y1: separator.y,
      x2: width,
      y2: separator.y,
      width: RULE_WEIGHT,
      role: separator.role,
    });
  }
  // The four outer edges carry the firm rule, including the right edge: a
  // grid-role right edge is the faint divider colour, which left the table open
  // on that side. Column dividers stay grid lines.
  lines.push(
    { x1: 0, y1: 0, x2: width, y2: 0, width: RULE_WEIGHT, role: "outer" },
    { x1: 0, y1: height, x2: width, y2: height, width: RULE_WEIGHT, role: "outer" },
    { x1: 0, y1: 0, x2: 0, y2: height, width: RULE_WEIGHT, role: "outer" },
    { x1: width, y1: 0, x2: width, y2: height, width: RULE_WEIGHT, role: "outer" },
  );
  return lines;
}
