import { formatNumber } from "../../../i18n/format";
import { t, type MessageKey } from "../../../i18n";
import type { ScheduleFieldRef, ScheduleTotal, ScheduleTotalOp } from "../../../model/types";
import type { ScheduleColumnView, ScheduleRow, ScheduleTotalValue } from "./types";

/**
 * Totals and subtotals computed from the filtered rows. A total is never
 * stored, and a count is a row count rather than a sum of field values. A sum
 * that mixes units reports the mix instead of pretending the number is
 * comparable.
 */

function opLabel(op: ScheduleTotalOp): string {
  return t(`schedules.totalOp.${op}` as MessageKey);
}

function labelForTotal(total: ScheduleTotal, fieldLabel: string): string {
  return t("schedules.total.label", { field: fieldLabel, op: opLabel(total.op) });
}

function numericValues(rows: readonly ScheduleRow[], field: ScheduleFieldRef): number[] {
  const values: number[] = [];
  for (const row of rows) {
    const cell = row.values[field];
    if (cell && cell.value !== null && Number.isFinite(cell.value)) values.push(cell.value);
  }
  return values;
}

function mixedUnits(rows: readonly ScheduleRow[]): boolean {
  const units = new Set<string>();
  for (const row of rows) {
    const unit = row.values.unit?.text?.trim();
    if (unit) units.add(unit);
    if (units.size > 1) return true;
  }
  return false;
}

export function computeTotal(
  rows: readonly ScheduleRow[],
  total: ScheduleTotal,
  fieldLabel: string,
  invalid: boolean,
): ScheduleTotalValue {
  const base = {
    field: total.field,
    op: total.op,
    label: labelForTotal(total, fieldLabel),
    invalid,
  };
  if (invalid) return { ...base, text: "–", value: null, mixedUnits: false };
  if (total.op === "count") {
    return {
      ...base,
      text: formatNumber(rows.length, 0),
      value: rows.length,
      mixedUnits: false,
    };
  }
  const values = numericValues(rows, total.field);
  if (!values.length) return { ...base, text: "–", value: null, mixedUnits: false };
  let result: number;
  switch (total.op) {
    case "sum":
      result = values.reduce((sum, value) => sum + value, 0);
      break;
    case "avg":
      result = values.reduce((sum, value) => sum + value, 0) / values.length;
      break;
    case "min":
      result = Math.min(...values);
      break;
    case "max":
      result = Math.max(...values);
      break;
  }
  return {
    ...base,
    text: formatNumber(result, 3),
    value: result,
    mixedUnits: mixedUnits(rows),
  };
}

export function computeTotals(
  rows: readonly ScheduleRow[],
  totals: readonly ScheduleTotal[] | undefined,
  labelOf: (field: ScheduleFieldRef) => string,
  invalidFields: ReadonlySet<string>,
): ScheduleTotalValue[] {
  return (totals ?? []).map((total) =>
    computeTotal(rows, total, labelOf(total.field), invalidFields.has(total.field)),
  );
}

/**
 * Where each computed total belongs in a total row. The first cell of that row
 * is its label, so a total is placed only on a field column at index 1 or
 * later, and only the first total for that field gets the cell. Everything
 * else goes to the foot line: a hidden field, a field in the label column, and
 * a second total on a field that already has one (F-126). The values are
 * already computed; this rule only places them.
 */
export interface TotalPlacement {
  /** The total placed in each column, or null; column 0 is always null. */
  placed: (ScheduleTotalValue | null)[];
  /** Totals the total row cannot show and the foot line must display. */
  unmatched: ScheduleTotalValue[];
}

export function placeTotals(
  columns: readonly Pick<ScheduleColumnView, "field">[],
  totals: readonly ScheduleTotalValue[] | undefined,
): TotalPlacement {
  const placed: (ScheduleTotalValue | null)[] = columns.map(() => null);
  const unmatched: ScheduleTotalValue[] = [];
  for (const total of totals ?? []) {
    const index = columns.findIndex(
      (column, columnIndex) => columnIndex >= 1 && column.field === total.field,
    );
    if (index < 0 || placed[index]) {
      unmatched.push(total);
      continue;
    }
    placed[index] = total;
  }
  return { placed, unmatched };
}

/** One localized foot-line line per unmatched total. */
export function unmatchedTotalText(totals: readonly ScheduleTotalValue[]): string {
  return totals
    .map((total) => t("schedules.table.footTotal", { label: total.label, value: total.text }))
    .join(t("schedules.table.footSeparator"));
}
