import type { ScheduleSort } from "../../../model/types";
import type { ScheduleRow } from "./types";

/**
 * Stable sorting over the cells a definition names. An explicit sort is applied
 * in order; ties keep the source order, and so does an empty sort list.
 * Missing values sort last in both directions so an empty cell never hides the
 * rows that do have a value.
 */

function compareCells(a: ScheduleRow, b: ScheduleRow, sort: ScheduleSort): number {
  const left = a.values[sort.field];
  const right = b.values[sort.field];
  const leftText = left?.text ?? "";
  const rightText = right?.text ?? "";
  if (!leftText && !rightText) return 0;
  if (!leftText) return 1;
  if (!rightText) return -1;
  let result: number;
  if (
    left?.value !== null &&
    left?.value !== undefined &&
    right?.value !== null &&
    right?.value !== undefined
  ) {
    result = left.value - right.value;
  } else {
    result = leftText.localeCompare(rightText, undefined, { numeric: true, sensitivity: "base" });
  }
  if (result === 0) return 0;
  return sort.direction === "desc" ? -result : result;
}

export function sortScheduleRows(
  rows: ScheduleRow[],
  sort: readonly ScheduleSort[],
): ScheduleRow[] {
  if (!sort.length) return [...rows];
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      for (const entry of sort) {
        const result = compareCells(a.row, b.row, entry);
        if (result !== 0) return result;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}
