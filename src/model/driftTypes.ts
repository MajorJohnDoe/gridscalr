import type { ItemKind, PageId } from "./types";

/**
 * Schema 28 data-foundation types: custom fields, spaces, schedules and the
 * summary settings. They live in their own module so `types.ts` stays within
 * the file budget; `types.ts` re-exports every name here, so existing imports
 * from `model/types` keep working.
 */

/**
 * Where a custom field can be used. This slice only writes measurement and
 * space values; the other scopes are reserved for later slices and are stored
 * without interpretation.
 */
export type FieldScope = "measurement" | "space" | "asset" | "issue" | "inspection" | "document";

export type FieldType =
  "text" | "number" | "unitNumber" | "boolean" | "date" | "enum" | "multiEnum";

/** A typed custom value. `null` means "not set" and is never stored. */
export type CustomValue = string | number | boolean | string[] | null;

export interface FieldOption {
  /** Stable option id stored in the value. Never reused. */
  id: string;
  /** Editable display label. */
  label: string;
}

export interface FieldAppliesTo {
  itemKinds?: ItemKind[];
  categoryIds?: string[];
  countTypes?: string[];
  spaceKinds?: SpaceKind[];
}

export interface FieldValidation {
  min?: number;
  max?: number;
  maxLength?: number;
}

/** One user-defined field. `key` is immutable after creation. */
export interface FieldDefinition {
  /** Stable id such as `field_3f9a`. Never reused. */
  id: string;
  /** Stable slug, unique per scope and immutable. */
  key: string;
  /** Editable display label. */
  label: string;
  type: FieldType;
  scope: FieldScope;
  /** Only for `unitNumber`. */
  unit?: string;
  /** Only for `enum` and `multiEnum`. */
  options?: FieldOption[];
  required?: boolean;
  defaultValue?: CustomValue;
  description?: string;
  order: number;
  appliesTo?: FieldAppliesTo;
  validation?: FieldValidation;
}

/** A named subset of fields, applied to new measurements or spaces. */
export interface FieldSet {
  id: string;
  name: string;
  scope: FieldScope;
  fieldIds: string[];
  description?: string;
}

export type SpaceKind = "building" | "floor" | "room" | "zone";
export type SpaceAreaMode = "measured" | "manual";

/**
 * Schema 28: a building, floor, room or zone. Area is derived from linked
 * measurements when `areaMode` is `measured`; `areaM2` is only a manual
 * fallback and never a second source of truth.
 */
export interface Space {
  id: string;
  kind: SpaceKind;
  /** Parent space in the same project. Absent means a root. */
  parentId?: string;
  /** Room number; duplicate siblings are a warning, never an error. */
  number?: string;
  name: string;
  floor?: string;
  usage?: string;
  status?: string;
  areaMode: SpaceAreaMode;
  /** Only when `areaMode` is `manual`. */
  areaM2?: number;
  /** Optional location on a project page. */
  pageId?: PageId;
  custom?: Record<string, CustomValue>;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleSource = "measurements" | "spaces";
export type ScheduleRowMode = "items" | "grouped";
/** A built-in schedule key or `custom:<fieldId>`. */
export type ScheduleFieldRef = string;

export type ScheduleColumnFormat = "text" | "number" | "unit" | "date";

export interface ScheduleColumn {
  id: string;
  field: ScheduleFieldRef;
  label?: string;
  /** Relative width. Missing means automatic. */
  width?: number;
  visible: boolean;
  format?: ScheduleColumnFormat;
}

export type ScheduleCustomFilterOp = "eq" | "contains" | "empty" | "notEmpty";

export interface ScheduleCustomFilter {
  fieldId: string;
  op: ScheduleCustomFilterOp;
  value?: CustomValue;
}

export interface ScheduleFilter {
  pageIds?: PageId[];
  categoryIds?: string[];
  countTypes?: string[];
  spaceIds?: string[];
  itemKinds?: ItemKind[];
  custom?: ScheduleCustomFilter[];
}

export interface ScheduleSort {
  field: ScheduleFieldRef;
  direction: "asc" | "desc";
}

export type ScheduleTotalOp = "sum" | "count" | "avg" | "min" | "max";

export interface ScheduleTotal {
  field: ScheduleFieldRef;
  op: ScheduleTotalOp;
}

/**
 * Schema 28: a live table definition over measurements or spaces. A schedule
 * stores intent only; rows and totals are computed when they are needed.
 */
export interface ScheduleDefinition {
  id: string;
  name: string;
  source: ScheduleSource;
  rowMode: ScheduleRowMode;
  columns: ScheduleColumn[];
  filters: ScheduleFilter;
  groupBy?: ScheduleFieldRef;
  sort?: ScheduleSort[];
  totals?: ScheduleTotal[];
  createdAt: string;
  updatedAt: string;
}

export type SummaryCardId = "rooms" | "area" | "wallLength" | "doors";

export interface SummaryCard {
  id: SummaryCardId;
  visible: boolean;
}

/** Schema 28: which summary KPI cards are visible. All four default to visible. */
export interface SummarySettings {
  cards: SummaryCard[];
}
