import { t } from "../../../i18n";
import type {
  Project,
  ScheduleDefinition,
  ScheduleFieldRef,
  ScheduleFilter,
  ScheduleTotal,
} from "../../../model/types";
import { measurementRows } from "../sources/measurements";
import { spaceRows } from "../sources/spaces";
import { scheduleDraftFor, scheduleDraftProblems } from "./definition";
import { resolveColumns, scheduleFieldInfo, scheduleRefs } from "./fields";
import { sortScheduleRows } from "./sort";
import { computeTotals } from "./totals";
import type {
  ScheduleCell,
  ScheduleDisplayEntry,
  ScheduleGroup,
  ScheduleResult,
  ScheduleRow,
} from "./types";

/**
 * Schedule computation order (plan §7.1): filter, map to rows, sort stably,
 * group and subtotal, total, then limit for a preview. Visibility is applied by
 * the source. The full set stays in `rows`; only `limitedRows` is shortened.
 */

export interface ComputeScheduleOptions {
  /** Panel-level filters combined with the definition's own filters. */
  extra?: ScheduleFilter;
  /** Preview row limit. The panel passes none and virtualises instead. */
  limit?: number;
}

const EMPTY_CELL: ScheduleCell = { text: "", value: null, invalid: true };

function buildGroups(
  rows: readonly ScheduleRow[],
  groupBy: ScheduleFieldRef,
  totals: readonly ScheduleTotal[] | undefined,
  labelOf: (field: ScheduleFieldRef) => string,
  invalidFields: ReadonlySet<string>,
): ScheduleGroup[] {
  const groups = new Map<string, ScheduleGroup>();
  for (const row of rows) {
    const label = row.values[groupBy]?.text.trim() || t("schedules.value.unassigned");
    const key = `${groupBy}:${label.toLocaleLowerCase()}`;
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { key, label, rows: [row], subtotals: [] });
  }
  const list = [...groups.values()];
  for (const group of list) {
    group.subtotals = computeTotals(group.rows, totals, labelOf, invalidFields);
  }
  return list;
}

export function computeSchedule(
  project: Project,
  definition: ScheduleDefinition,
  options: ComputeScheduleOptions = {},
): ScheduleResult {
  const columns = resolveColumns(project, definition);
  const refs = scheduleRefs(definition);
  const invalid = new Set<string>();
  for (const ref of refs) {
    if (scheduleFieldInfo(project, definition.source, ref).invalid) invalid.add(ref);
  }
  const rows =
    definition.source === "spaces"
      ? spaceRows(project, definition, options.extra)
      : measurementRows(project, definition, options.extra);
  const sorted = sortScheduleRows(rows, definition.sort ?? []);
  const labelOf = (field: ScheduleFieldRef): string => {
    const column = columns.find((entry) => entry.field === field);
    return column?.label ?? scheduleFieldInfo(project, definition.source, field).label;
  };
  const groups = definition.groupBy
    ? buildGroups(sorted, definition.groupBy, definition.totals, labelOf, invalid)
    : [];
  const groupLabel = new Map<string, string>();
  for (const group of groups) {
    for (const row of group.rows) groupLabel.set(row.rowId, group.label);
  }
  for (const row of sorted) {
    row.cells = columns.map((column) => row.values[column.field] ?? EMPTY_CELL);
    row.groupPath = definition.groupBy ? [groupLabel.get(row.rowId) ?? ""] : [];
  }
  const totals = computeTotals(sorted, definition.totals, labelOf, invalid);
  const limit = options.limit !== undefined ? Math.max(0, options.limit) : null;
  return {
    scheduleId: definition.id,
    source: definition.source,
    rowMode: definition.rowMode,
    columns,
    rows: sorted,
    groups,
    totals,
    invalidFields: [...invalid],
    problems: scheduleDraftProblems(project, scheduleDraftFor(definition)),
    rowCount: sorted.length,
    limitedRows: limit === null ? sorted : sorted.slice(0, limit),
    limit,
  };
}

/** The flat list a panel virtualises: group headers, and rows in items mode. */
export function scheduleDisplayEntries(result: ScheduleResult): ScheduleDisplayEntry[] {
  if (result.rowMode === "grouped") {
    return result.groups.map((group) => ({ type: "group", group }));
  }
  if (!result.groups.length) {
    return result.rows.map((row) => ({ type: "row", row }));
  }
  const entries: ScheduleDisplayEntry[] = [];
  for (const group of result.groups) {
    entries.push({ type: "group", group });
    for (const row of group.rows) entries.push({ type: "row", row });
  }
  return entries;
}
