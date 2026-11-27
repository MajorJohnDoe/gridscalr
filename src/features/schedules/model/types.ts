import type {
  PageId,
  ScheduleColumn,
  ScheduleFieldRef,
  ScheduleRowMode,
  ScheduleSource,
  ScheduleTotalOp,
} from "../../../model/types";

/**
 * Rows, groups and totals computed from a schedule definition. Nothing here is
 * stored: a schedule keeps intent only, so a moved or deleted measurement
 * immediately changes the table.
 */

/** One resolved column: the stored column plus the label and typed field it names. */
export interface ScheduleColumnView {
  column: ScheduleColumn;
  field: ScheduleFieldRef;
  label: string;
  /** Custom field id for a `custom:<fieldId>` column, otherwise null. */
  fieldId: string | null;
  /** True when the reference no longer resolves; the cell stays empty, never hidden. */
  invalid: boolean;
  numeric: boolean;
}

/** One cell, with a display string and its numeric value when it has one. */
export interface ScheduleCell {
  text: string;
  value: number | null;
  /** True only for a field reference that does not resolve. */
  invalid: boolean;
}

/**
 * One row of a schedule. `rowId` is stable across recomputes because it is
 * derived from the source and the entity id, so a preview, a CSV and a placed
 * table can identify the same row.
 */
export interface ScheduleRow {
  rowId: string;
  entityId: string;
  pageId?: PageId;
  layerId?: string;
  /** Cells aligned with the resolved, visible columns. */
  cells: ScheduleCell[];
  /** Every field the definition references, for grouping, sorting and totals. */
  values: Record<ScheduleFieldRef, ScheduleCell>;
  /** Group labels from the definition's `groupBy`, outermost first. */
  groupPath: string[];
}

export interface ScheduleTotalValue {
  field: ScheduleFieldRef;
  op: ScheduleTotalOp;
  label: string;
  text: string;
  value: number | null;
  /** True when the contributing rows do not share one unit. */
  mixedUnits: boolean;
  invalid: boolean;
}

export interface ScheduleGroup {
  /** Unique key for collapse state; the label is not unique by itself. */
  key: string;
  label: string;
  rows: ScheduleRow[];
  subtotals: ScheduleTotalValue[];
}

/** A flat display list so a panel can virtualise rows and group headers alike. */
export type ScheduleDisplayEntry =
  { type: "group"; group: ScheduleGroup } | { type: "row"; row: ScheduleRow };

export interface ScheduleResult {
  scheduleId: string;
  source: ScheduleSource;
  rowMode: ScheduleRowMode;
  columns: ScheduleColumnView[];
  /** Every filtered row, stably sorted. */
  rows: ScheduleRow[];
  groups: ScheduleGroup[];
  totals: ScheduleTotalValue[];
  /** Field references that no longer resolve for this source. */
  invalidFields: string[];
  /** Problems the panel reports without blocking the table. */
  problems: ScheduleProblem[];
  rowCount: number;
  /** The first `limit` rows, or every row when no limit was given. */
  limitedRows: ScheduleRow[];
  limit: number | null;
}

export type ScheduleProblemCode =
  | "missingName"
  | "noColumns"
  | "invalidField"
  | "invalidFilter"
  | "inapplicableFilter"
  | "invalidCustomValue"
  | "inUse"
  | "unknownSchedule";

export interface ScheduleProblem {
  code: ScheduleProblemCode;
  /** The field, page, category, count type, space or schedule the problem names. */
  ref?: string;
  /** A custom field id, when the problem names one. */
  fieldId?: string;
}
