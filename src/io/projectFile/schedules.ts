import { isScheduleRowMode, isScheduleSource } from "../../model/schedules";
import type {
  CustomValue,
  ScheduleColumn,
  ScheduleColumnFormat,
  ScheduleCustomFilter,
  ScheduleCustomFilterOp,
  ScheduleDefinition,
  ScheduleFilter,
  ScheduleSort,
  ScheduleTotal,
  ScheduleTotalOp,
} from "../../model/types";
import { ITEM_KINDS, uniqueId } from "./shared";

const FORMATS: readonly ScheduleColumnFormat[] = ["text", "number", "unit", "date"];
const FILTER_OPS: readonly ScheduleCustomFilterOp[] = ["eq", "contains", "empty", "notEmpty"];
const TOTAL_OPS: readonly ScheduleTotalOp[] = ["sum", "count", "avg", "min", "max"];
const MAX_COLUMNS = 200;
const MAX_FILTERS = 500;

function trimmed(value: unknown, maxLength = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, maxLength);
  return text || undefined;
}

function uniqueStrings(value: unknown, maxLength = 120): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  for (const entry of value) {
    const text = trimmed(entry, maxLength);
    if (text) seen.add(text);
  }
  return seen.size ? [...seen] : undefined;
}

function isRawCustomValue(value: unknown): value is CustomValue {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function normalizeColumns(value: unknown, report?: (code: string) => void): ScheduleColumn[] {
  if (!Array.isArray(value)) return [];
  const columns: ScheduleColumn[] = [];
  const ids = new Set<string>();
  for (const [index, entry] of value.slice(0, MAX_COLUMNS).entries()) {
    if (typeof entry !== "object" || entry === null) {
      report?.("droppedScheduleColumn");
      continue;
    }
    const raw = entry as Partial<ScheduleColumn>;
    const field = trimmed(raw.field, 160);
    if (!field) {
      report?.("droppedScheduleColumn");
      continue;
    }
    const rawId = trimmed(raw.id, 120);
    if (rawId && ids.has(rawId)) report?.("repairedScheduleColumn");
    const id = uniqueId(rawId ?? `col_${index + 1}`, ids);
    const column: ScheduleColumn = { id, field, visible: raw.visible !== false };
    const label = trimmed(raw.label, 120);
    if (label) column.label = label;
    if (typeof raw.width === "number" && Number.isFinite(raw.width) && raw.width > 0) {
      column.width = Math.max(0.1, Math.min(100, raw.width));
    }
    if (typeof raw.format === "string" && (FORMATS as readonly string[]).includes(raw.format)) {
      column.format = raw.format as ScheduleColumnFormat;
    }
    columns.push(column);
  }
  return columns;
}

function normalizeFilters(value: unknown, report?: (code: string) => void): ScheduleFilter {
  if (typeof value !== "object" || value === null) return {};
  const raw = value as ScheduleFilter;
  const filters: ScheduleFilter = {};
  const pageIds = uniqueStrings(raw.pageIds);
  if (pageIds) filters.pageIds = pageIds;
  const categoryIds = uniqueStrings(raw.categoryIds);
  if (categoryIds) filters.categoryIds = categoryIds;
  const countTypes = uniqueStrings(raw.countTypes, 80);
  if (countTypes) filters.countTypes = countTypes;
  const spaceIds = uniqueStrings(raw.spaceIds);
  if (spaceIds) filters.spaceIds = spaceIds;
  if (Array.isArray(raw.itemKinds)) {
    const kinds = [
      ...new Set(raw.itemKinds.filter((kind) => (ITEM_KINDS as ReadonlySet<string>).has(kind))),
    ];
    if (kinds.length !== raw.itemKinds.length) report?.("droppedScheduleFilter");
    if (kinds.length) filters.itemKinds = kinds;
  }
  if (Array.isArray(raw.custom)) {
    const custom: ScheduleCustomFilter[] = [];
    for (const entry of raw.custom.slice(0, MAX_FILTERS)) {
      if (typeof entry !== "object" || entry === null) {
        report?.("droppedScheduleFilter");
        continue;
      }
      const candidate = entry as Partial<ScheduleCustomFilter>;
      const fieldId = trimmed(candidate.fieldId, 120);
      if (
        !fieldId ||
        typeof candidate.op !== "string" ||
        !(FILTER_OPS as readonly string[]).includes(candidate.op)
      ) {
        report?.("droppedScheduleFilter");
        continue;
      }
      const filter: ScheduleCustomFilter = {
        fieldId,
        op: candidate.op as ScheduleCustomFilterOp,
      };
      if (candidate.value !== undefined) {
        if (!isRawCustomValue(candidate.value)) {
          report?.("droppedScheduleFilter");
          continue;
        }
        filter.value = candidate.value;
      }
      custom.push(filter);
    }
    if (custom.length) filters.custom = custom;
  }
  return filters;
}

function normalizeSort(
  value: unknown,
  report?: (code: string) => void,
): ScheduleSort[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sort: ScheduleSort[] = [];
  for (const entry of value.slice(0, 50)) {
    if (typeof entry !== "object" || entry === null) {
      report?.("droppedScheduleSort");
      continue;
    }
    const raw = entry as Partial<ScheduleSort>;
    const field = trimmed(raw.field, 160);
    if (!field || (raw.direction !== "asc" && raw.direction !== "desc")) {
      report?.("droppedScheduleSort");
      continue;
    }
    sort.push({ field, direction: raw.direction });
  }
  return sort.length ? sort : undefined;
}

function normalizeTotals(
  value: unknown,
  report?: (code: string) => void,
): ScheduleTotal[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const totals: ScheduleTotal[] = [];
  for (const entry of value.slice(0, 100)) {
    if (typeof entry !== "object" || entry === null) {
      report?.("droppedScheduleTotal");
      continue;
    }
    const raw = entry as Partial<ScheduleTotal>;
    const field = trimmed(raw.field, 160);
    if (
      !field ||
      typeof raw.op !== "string" ||
      !(TOTAL_OPS as readonly string[]).includes(raw.op)
    ) {
      report?.("droppedScheduleTotal");
      continue;
    }
    totals.push({ field, op: raw.op as ScheduleTotalOp });
  }
  return totals.length ? totals : undefined;
}

export function normalizeSchedules(
  value: unknown,
  report?: (code: string) => void,
): ScheduleDefinition[] {
  if (!Array.isArray(value)) return [];
  const schedules: ScheduleDefinition[] = [];
  const ids = new Set<string>();
  const now = new Date().toISOString();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      report?.("droppedSchedule");
      continue;
    }
    const raw = entry as Partial<ScheduleDefinition>;
    const rawId = typeof raw.id === "string" ? raw.id.trim().slice(0, 120) : "";
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : "";
    if (!rawId || !name || !isScheduleSource(raw.source) || !isScheduleRowMode(raw.rowMode)) {
      report?.("droppedSchedule");
      continue;
    }
    const schedule: ScheduleDefinition = {
      id: uniqueId(rawId, ids),
      name,
      source: raw.source,
      rowMode: raw.rowMode,
      columns: normalizeColumns(raw.columns, report),
      filters: normalizeFilters(raw.filters, report),
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
    };
    const groupBy = trimmed(raw.groupBy, 160);
    if (groupBy) schedule.groupBy = groupBy;
    const sort = normalizeSort(raw.sort, report);
    if (sort) schedule.sort = sort;
    const totals = normalizeTotals(raw.totals, report);
    if (totals) schedule.totals = totals;
    schedules.push(schedule);
  }
  return schedules;
}
