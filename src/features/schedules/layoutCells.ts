import type { ScheduleFieldRef } from "../../model/types";
import type { ScheduleResult, ScheduleRow, ScheduleTotalValue } from "./model/types";
import type {
  ScheduleCellRole,
  ScheduleColumnBox,
  ScheduleTableLine,
  ScheduleTableText,
} from "./layout";
import { ellipsizeText, type MeasureText } from "./layoutText";

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

export function gridLines(
  columns: ScheduleColumnBox[],
  width: number,
  height: number,
  headerBottom: number,
  totalTop: number | null,
  hasHeader: boolean,
  hasTotal: boolean,
): ScheduleTableLine[] {
  const lines: ScheduleTableLine[] = [];
  for (const column of columns) {
    lines.push({ x1: column.x, y1: 0, x2: column.x, y2: height, width: 0.4, role: "grid" });
  }
  lines.push({ x1: width, y1: 0, x2: width, y2: height, width: 0.4, role: "grid" });
  if (hasHeader) {
    lines.push({
      x1: 0,
      y1: headerBottom,
      x2: width,
      y2: headerBottom,
      width: 0.8,
      role: "header",
    });
  }
  if (hasTotal && totalTop !== null) {
    lines.push({ x1: 0, y1: totalTop, x2: width, y2: totalTop, width: 0.8, role: "total" });
  }
  lines.push(
    { x1: 0, y1: 0, x2: width, y2: 0, width: 0.8, role: "outer" },
    { x1: 0, y1: height, x2: width, y2: height, width: 0.8, role: "outer" },
    { x1: 0, y1: 0, x2: 0, y2: height, width: 0.8, role: "outer" },
  );
  return lines;
}
