import { makeId } from "./calibration";
import type {
  MarkupsColumnId,
  MarkupsGroupField,
  MarkupsPageFilter,
  MarkupsSort,
  MarkupsTypeFilter,
  MarkupsView,
} from "./types";

export const MARKUPS_COLUMN_IDS: MarkupsColumnId[] = [
  "name",
  "type",
  "page",
  "layer",
  "value",
  "category",
  "room",
  "visible",
  "locked",
];

export const DEFAULT_MARKUPS_COLUMNS: MarkupsColumnId[] = [...MARKUPS_COLUMN_IDS];

export const MARKUPS_COLUMN_LABELS: Record<MarkupsColumnId, string> = {
  name: "Name",
  type: "Type",
  page: "Page",
  layer: "Layer",
  value: "Value",
  category: "Category",
  room: "Room",
  visible: "Vis.",
  locked: "Lock",
};

export const MARKUPS_GROUP_FIELDS: MarkupsGroupField[] = [
  "category",
  "room",
  "page",
  "layer",
  "building",
  "floor",
];

export interface MarkupsGroupPreset {
  id: string;
  label: string;
  fields: MarkupsGroupField[];
}

export const MARKUPS_GROUP_PRESETS: MarkupsGroupPreset[] = [
  { id: "none", label: "No grouping", fields: [] },
  { id: "category", label: "Category", fields: ["category"] },
  { id: "room", label: "Room", fields: ["room"] },
  { id: "page", label: "Page", fields: ["page"] },
  { id: "layer", label: "Layer", fields: ["layer"] },
  { id: "category-room", label: "Category → Room", fields: ["category", "room"] },
  {
    id: "building-floor-room",
    label: "Building → Floor → Room",
    fields: ["building", "floor", "room"],
  },
  {
    id: "building-floor-category",
    label: "Building → Floor → Category",
    fields: ["building", "floor", "category"],
  },
];

export interface MarkupsViewSettings {
  columns: MarkupsColumnId[];
  pageFilter: MarkupsPageFilter;
  typeFilter: MarkupsTypeFilter;
  categoryId: string | null;
  search: string;
  groupBy: MarkupsGroupField[];
  sort: MarkupsSort | null;
}

export function defaultMarkupsViewSettings(): MarkupsViewSettings {
  return {
    columns: [...DEFAULT_MARKUPS_COLUMNS],
    pageFilter: "all",
    typeFilter: "all",
    categoryId: null,
    search: "",
    groupBy: [],
    sort: null,
  };
}

export function settingsForView(view: MarkupsView): MarkupsViewSettings {
  return {
    columns: normalizeMarkupsColumns(view.columns),
    pageFilter: view.pageFilter,
    typeFilter: view.typeFilter,
    categoryId: view.categoryId,
    search: view.search,
    groupBy: [...view.groupBy],
    sort: view.sort ? { ...view.sort } : null,
  };
}

export function viewFromSettings(
  id: string,
  name: string,
  settings: MarkupsViewSettings,
): MarkupsView {
  return {
    id,
    name,
    columns: [...settings.columns],
    pageFilter: settings.pageFilter,
    typeFilter: settings.typeFilter,
    categoryId: settings.categoryId,
    search: settings.search,
    groupBy: [...settings.groupBy],
    sort: settings.sort ? { ...settings.sort } : null,
  };
}

export function markupsSettingsEqual(a: MarkupsViewSettings, b: MarkupsViewSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function markupsGroupPresetFor(fields: MarkupsGroupField[]): MarkupsGroupPreset | null {
  return (
    MARKUPS_GROUP_PRESETS.find(
      (preset) =>
        preset.fields.length === fields.length && preset.fields.every((f, i) => f === fields[i]),
    ) ?? null
  );
}

function normalizeColumns(value: unknown): MarkupsColumnId[] {
  if (!Array.isArray(value)) return [...DEFAULT_MARKUPS_COLUMNS];
  const known = new Set(MARKUPS_COLUMN_IDS);
  const seen = new Set<MarkupsColumnId>();
  const columns: MarkupsColumnId[] = ["name"];
  seen.add("name");
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = entry as MarkupsColumnId;
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    columns.push(id);
  }
  return columns;
}

export function normalizeMarkupsColumns(value: unknown): MarkupsColumnId[] {
  return normalizeColumns(value);
}

function normalizeGroupBy(value: unknown): MarkupsGroupField[] {
  const known = new Set(MARKUPS_GROUP_FIELDS);
  const seen = new Set<MarkupsGroupField>();
  const fields: MarkupsGroupField[] = [];
  if (!Array.isArray(value)) return fields;
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const field = entry as MarkupsGroupField;
    if (!known.has(field) || seen.has(field)) continue;
    seen.add(field);
    fields.push(field);
  }
  return fields;
}

function normalizeSort(value: unknown): MarkupsSort | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<MarkupsSort>;
  if (!raw.column || !MARKUPS_COLUMN_IDS.includes(raw.column)) return null;
  return { column: raw.column, direction: raw.direction === "desc" ? "desc" : "asc" };
}

function normalizeSearch(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 200) : "";
}

/** Normalizes project-stored views and drops anything that no longer exists. */
export function normalizeMarkupsViews(
  value: unknown,
  categoryIds: ReadonlySet<string>,
): MarkupsView[] {
  if (!Array.isArray(value)) return [];
  const views: MarkupsView[] = [];
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const raw = entry as Partial<MarkupsView>;
    const name =
      typeof raw.name === "string" ? raw.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    if (!name) continue;
    const nameKey = name.toLocaleLowerCase();
    if (names.has(nameKey)) continue;
    let id = typeof raw.id === "string" && raw.id ? raw.id : makeId("view");
    if (ids.has(id)) id = makeId("view");
    const columns = normalizeColumns(raw.columns);
    const pageFilter: MarkupsPageFilter = raw.pageFilter === "current" ? "current" : "all";
    const typeFilter: MarkupsTypeFilter =
      raw.typeFilter === "measure" || raw.typeFilter === "draw" ? raw.typeFilter : "all";
    const categoryId =
      typeof raw.categoryId === "string" && categoryIds.has(raw.categoryId) ? raw.categoryId : null;
    views.push({
      id,
      name,
      columns,
      pageFilter,
      typeFilter,
      categoryId,
      search: normalizeSearch(raw.search),
      groupBy: normalizeGroupBy(raw.groupBy),
      sort: normalizeSort(raw.sort),
    });
    names.add(nameKey);
    ids.add(id);
    if (views.length >= 40) break;
  }
  return views;
}

export function uniqueMarkupsViewName(
  views: readonly MarkupsView[],
  requested: string,
  ignoreId?: string,
): string {
  const base = requested.replace(/\s+/g, " ").trim().slice(0, 60) || "Markups view";
  const used = new Set(
    views.filter((view) => view.id !== ignoreId).map((view) => view.name.toLocaleLowerCase()),
  );
  if (!used.has(base.toLocaleLowerCase())) return base;
  let index = 2;
  while (used.has(`${base} (${index})`.toLocaleLowerCase())) index += 1;
  return `${base} (${index})`.slice(0, 60);
}

export interface MarkupGroup<T> {
  /** Unique path key used for collapse state. */
  key: string;
  field: MarkupsGroupField;
  /** Display label. Empty source values become "Unassigned". */
  value: string;
  count: number;
  rows: T[];
  children: MarkupGroup<T>[];
}

/**
 * Groups already-sorted rows into a collapsible hierarchy. The callback owns
 * the human label for each field; nested keys include the parent path so two
 * rooms with the same name on different floors collapse independently.
 */
export function groupMarkupRows<T>(
  rows: T[],
  fields: MarkupsGroupField[],
  valueFor: (row: T, field: MarkupsGroupField) => string,
): MarkupGroup<T>[] {
  if (!fields.length || !rows.length) return [];
  return buildGroups(rows, fields, valueFor, "");
}

function buildGroups<T>(
  rows: T[],
  fields: MarkupsGroupField[],
  valueFor: (row: T, field: MarkupsGroupField) => string,
  parentKey: string,
): MarkupGroup<T>[] {
  const field = fields[0];
  const map = new Map<string, { label: string; rows: T[] }>();
  for (const row of rows) {
    const label = valueFor(row, field).trim() || "Unassigned";
    const key = label.toLocaleLowerCase();
    const entry = map.get(key);
    if (entry) entry.rows.push(row);
    else map.set(key, { label, rows: [row] });
  }
  const rest = fields.slice(1);
  return [...map.entries()].map(([valueKey, group]) => {
    const key = `${parentKey}/${field}:${valueKey}`;
    return {
      key,
      field,
      value: group.label,
      count: group.rows.length,
      rows: group.rows,
      children: rest.length ? buildGroups(group.rows, rest, valueFor, key) : [],
    };
  });
}
