import type { CustomValue, Project, ScheduleRowMode } from "../../../model/types";

/**
 * Schedule CSV round-trip. The model is pure: export reads a computed schedule,
 * import builds a dry-run plan and applies only explicit, validated updates.
 * Nothing here creates a measurement, space, field or schedule.
 */

/** Workbook-style row limit. The byte limit lives in `src/io/limits.ts`. */
export const MAX_SCHEDULE_CSV_ROWS = 20_000;

export type ScheduleCsvBlockCode =
  | "tooLarge"
  | "tooManyRows"
  | "notUtf8"
  | "empty"
  | "missingHeader"
  | "groupedSchedule"
  | "missingSchedule";

export interface ScheduleCsvExport {
  text: string;
  delimiter: string;
  decimal: string;
  bom: boolean;
  headers: string[];
  rowCount: number;
  rowMode: ScheduleRowMode;
  /** False for a grouped read-only export. */
  importable: boolean;
}

export type ScheduleCsvIssueCode =
  | "unknownField"
  | "duplicateHeader"
  | "unknownId"
  | "duplicateId"
  | "wrongType"
  | "missingId"
  | "missingType"
  | "invalidValue"
  | "extraCells";

export interface ScheduleCsvIssue {
  code: ScheduleCsvIssueCode;
  /** 1-based file row including the header, so it matches the spreadsheet. */
  row?: number;
  /** Field reference, such as `label` or `custom:field_x`. */
  field?: string;
  /** Resolved column label, or the raw header for an unknown field. */
  label?: string;
  /** The offending cell text. Display only; never rendered as HTML. */
  value?: string;
  /** Field-input problem code, translated by the dialog. */
  reason?: string;
}

export interface ScheduleCsvReadOnlyColumn {
  field: string;
  label: string;
}

export type ScheduleCsvValue = CustomValue;

export interface ScheduleCsvUpdate {
  field: string;
  label: string;
  before: string;
  after: string;
  kind: "builtIn" | "custom";
  /** Typed target value. `null` clears an optional value. */
  value: ScheduleCsvValue;
}

export interface ScheduleCsvRow {
  row: number;
  id: string;
  type: "item" | "space";
  status: "changed" | "unchanged" | "rejected";
  updates: ScheduleCsvUpdate[];
  issues: ScheduleCsvIssue[];
}

export interface ScheduleCsvImportPlan {
  scheduleId: string;
  scheduleName: string;
  fileName: string;
  sizeBytes: number;
  blocked: ScheduleCsvBlockCode | null;
  delimiter: string;
  bom: boolean;
  totalRows: number;
  changed: ScheduleCsvRow[];
  unchanged: ScheduleCsvRow[];
  rejected: ScheduleCsvRow[];
  /** File-level issues: unknown fields, read-only columns and duplicate headers. */
  issues: ScheduleCsvIssue[];
  readOnlyColumns: ScheduleCsvReadOnlyColumn[];
  /** Schedule rows whose ID is absent from the file; they are left untouched. */
  missingRowCount: number;
}

export interface ScheduleCsvImportOptions {
  project: Project;
  scheduleId: string;
  fileName?: string;
}

export interface ScheduleCsvApplyResult {
  applied: number;
  skipped: number;
}

export interface ScheduleCsvApplyOptions {
  /** Deterministic timestamp for tests. Defaults to now. */
  now?: string;
}
