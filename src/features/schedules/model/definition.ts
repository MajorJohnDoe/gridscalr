import { makeId } from "../../../model/calibration";
import { isCustomValueForField } from "../../../model/fields";
import { t, type MessageKey } from "../../../i18n";
import type {
  Project,
  ScheduleColumn,
  ScheduleDefinition,
  ScheduleFilter,
  ScheduleRowMode,
  ScheduleSort,
  ScheduleSource,
  ScheduleTotal,
} from "../../../model/types";
import { fieldResolves, makeColumn, scheduleFieldInfo, scheduleRefs } from "./fields";
import type { ScheduleProblem } from "./types";

/**
 * Definition rules for a schedule. A schedule stores intent only: columns,
 * filters, grouping, sorting and totals. Creating, updating, duplicating and
 * deleting are caller-owned so one action is one undo step.
 */

export interface ScheduleDraft {
  id?: string;
  name: string;
  source: ScheduleSource;
  rowMode: ScheduleRowMode;
  columns: ScheduleColumn[];
  filters: ScheduleFilter;
  groupBy?: string;
  sort: ScheduleSort[];
  totals: ScheduleTotal[];
}

const NAME_MAX = 120;

export function normalizeScheduleName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

function cloneFilters(filters: ScheduleFilter): ScheduleFilter {
  return {
    ...(filters.pageIds?.length ? { pageIds: [...filters.pageIds] } : {}),
    ...(filters.categoryIds?.length ? { categoryIds: [...filters.categoryIds] } : {}),
    ...(filters.countTypes?.length ? { countTypes: [...filters.countTypes] } : {}),
    ...(filters.spaceIds?.length ? { spaceIds: [...filters.spaceIds] } : {}),
    ...(filters.itemKinds?.length ? { itemKinds: [...filters.itemKinds] } : {}),
    ...(filters.custom?.length ? { custom: filters.custom.map((entry) => ({ ...entry })) } : {}),
  };
}

function defaultColumns(
  project: Pick<Project, "fieldDefinitions">,
  source: ScheduleSource,
): ScheduleColumn[] {
  const refs =
    source === "spaces"
      ? ["number", "name", "floor", "area"]
      : ["label", "category", "value", "unit"];
  const columns: ScheduleColumn[] = [];
  for (const ref of refs) {
    columns.push(makeColumn(ref, columns, scheduleFieldInfo(project, source, ref)));
  }
  return columns;
}

/**
 * The standard takeoff table: one row per item from the measurement source,
 * four columns, no filters, no grouping, sorting or totals. It is an ordinary
 * definition with a localized name, so the builder can edit it like any other.
 */
const STANDARD_COLUMNS = [
  { field: "label", labelKey: "schedules.standard.column.object" },
  { field: "countQuantity", labelKey: "schedules.standard.column.count" },
  { field: "unit", labelKey: "schedules.standard.column.unit" },
  { field: "value", labelKey: "schedules.standard.column.value" },
] as const satisfies readonly { field: string; labelKey: MessageKey }[];

export function standardScheduleDraft(
  project: Pick<Project, "fieldDefinitions" | "schedules">,
): ScheduleDraft {
  const columns: ScheduleColumn[] = [];
  for (const entry of STANDARD_COLUMNS) {
    const info = scheduleFieldInfo(project, "measurements", entry.field);
    columns.push({ ...makeColumn(entry.field, columns, info), label: t(entry.labelKey) });
  }
  return {
    name: uniqueScheduleName(project, t("schedules.standard.name")),
    source: "measurements",
    rowMode: "items",
    columns,
    filters: {},
    sort: [],
    totals: [],
  };
}

/** A new draft with the source's default columns and no filters. */
export function emptyScheduleDraft(
  project: Pick<Project, "fieldDefinitions" | "schedules">,
  source: ScheduleSource = "measurements",
): ScheduleDraft {
  return {
    name: uniqueScheduleName(project, t("schedules.builder.defaultName")),
    source,
    rowMode: "items",
    columns: defaultColumns(project, source),
    filters: {},
    sort: [],
    totals: [],
  };
}

export function scheduleDraftFor(schedule: ScheduleDefinition): ScheduleDraft {
  return {
    id: schedule.id,
    name: schedule.name,
    source: schedule.source,
    rowMode: schedule.rowMode,
    columns: schedule.columns.map((column) => ({ ...column })),
    filters: cloneFilters(schedule.filters),
    ...(schedule.groupBy ? { groupBy: schedule.groupBy } : {}),
    sort: (schedule.sort ?? []).map((entry) => ({ ...entry })),
    totals: (schedule.totals ?? []).map((entry) => ({ ...entry })),
  };
}

function draftDefinition(project: Project, draft: ScheduleDraft): ScheduleDefinition {
  const now = new Date().toISOString();
  const existing = draft.id ? project.schedules.find((entry) => entry.id === draft.id) : undefined;
  return {
    id: draft.id ?? makeId("sched"),
    name: normalizeScheduleName(draft.name),
    source: draft.source,
    rowMode: draft.rowMode,
    columns: draft.columns.map((column) => ({ ...column })),
    filters: cloneFilters(draft.filters),
    ...(draft.groupBy ? { groupBy: draft.groupBy } : {}),
    ...(draft.sort.length ? { sort: draft.sort.map((entry) => ({ ...entry })) } : {}),
    ...(draft.totals.length ? { totals: draft.totals.map((entry) => ({ ...entry })) } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function uniqueScheduleName(
  project: Pick<Project, "schedules">,
  requested: string,
  ignoreId?: string,
): string {
  const base = normalizeScheduleName(requested) || t("schedules.builder.defaultName");
  const used = new Set(
    project.schedules
      .filter((schedule) => schedule.id !== ignoreId)
      .map((schedule) => schedule.name.toLocaleLowerCase()),
  );
  if (!used.has(base.toLocaleLowerCase())) return base;
  let index = 2;
  while (used.has(`${base} (${index})`.toLocaleLowerCase())) index += 1;
  return `${base} (${index})`.slice(0, NAME_MAX);
}

function filterProblems(project: Project, draft: ScheduleDraft): ScheduleProblem[] {
  const problems: ScheduleProblem[] = [];
  const filters = draft.filters;
  const isSpace = draft.source === "spaces";
  for (const pageId of filters.pageIds ?? []) {
    if (!project.pages.some((page) => page.id === pageId)) {
      problems.push({ code: "invalidFilter", ref: pageId });
    }
  }
  for (const categoryId of filters.categoryIds ?? []) {
    if (isSpace) problems.push({ code: "inapplicableFilter", ref: categoryId });
    else if (!project.categories.some((category) => category.id === categoryId)) {
      problems.push({ code: "invalidFilter", ref: categoryId });
    }
  }
  for (const countType of filters.countTypes ?? []) {
    if (isSpace) problems.push({ code: "inapplicableFilter", ref: countType });
    else if (!project.countTypes.some((type) => type.id === countType)) {
      problems.push({ code: "invalidFilter", ref: countType });
    }
  }
  for (const spaceId of filters.spaceIds ?? []) {
    if (!project.spaces.some((space) => space.id === spaceId)) {
      problems.push({ code: "invalidFilter", ref: spaceId });
    }
  }
  if (isSpace) {
    for (const kind of filters.itemKinds ?? []) {
      problems.push({ code: "inapplicableFilter", ref: kind });
    }
  }
  for (const custom of filters.custom ?? []) {
    const field = project.fieldDefinitions.find((entry) => entry.id === custom.fieldId);
    const scope = isSpace ? "space" : "measurement";
    if (!field || field.scope !== scope) {
      problems.push({ code: "invalidFilter", fieldId: custom.fieldId });
      continue;
    }
    if (
      custom.value !== undefined &&
      custom.value !== null &&
      !isCustomValueForField(custom.value, field)
    ) {
      problems.push({ code: "invalidCustomValue", fieldId: custom.fieldId });
    }
  }
  return problems;
}

/** Problems the builder shows inline. None of them may crash the panel. */
export function scheduleDraftProblems(project: Project, draft: ScheduleDraft): ScheduleProblem[] {
  if (!normalizeScheduleName(draft.name)) return [{ code: "missingName" }];
  const problems: ScheduleProblem[] = [];
  if (!draft.columns.some((column) => column.visible !== false)) {
    problems.push({ code: "noColumns" });
  }
  // Every column is validated, including a hidden one; grouping, sorting and
  // totals are validated even when no column shows the field.
  const refs = [
    ...new Set([...draft.columns.map((column) => column.field), ...scheduleRefs(draft)]),
  ];
  for (const ref of refs) {
    if (!fieldResolves(project, draft.source, ref)) {
      problems.push({ code: "invalidField", ref });
    }
  }
  problems.push(...filterProblems(project, draft));
  return problems;
}

export interface ScheduleMutationResult {
  schedule: ScheduleDefinition | null;
  problems: ScheduleProblem[];
}

export function createSchedule(project: Project, draft: ScheduleDraft): ScheduleMutationResult {
  const problems = scheduleDraftProblems(project, draft);
  if (problems.length) return { schedule: null, problems };
  const schedule = draftDefinition(project, {
    ...draft,
    name: uniqueScheduleName(project, draft.name),
  });
  project.schedules.push(schedule);
  return { schedule, problems: [] };
}

export function updateSchedule(project: Project, draft: ScheduleDraft): ScheduleMutationResult {
  if (!draft.id) return { schedule: null, problems: [{ code: "unknownSchedule" }] };
  const index = project.schedules.findIndex((entry) => entry.id === draft.id);
  if (index < 0) return { schedule: null, problems: [{ code: "unknownSchedule" }] };
  const problems = scheduleDraftProblems(project, draft);
  if (problems.length) return { schedule: null, problems };
  const schedule = draftDefinition(project, {
    ...draft,
    name: uniqueScheduleName(project, draft.name, draft.id),
  });
  project.schedules[index] = schedule;
  return { schedule, problems: [] };
}

export function duplicateSchedule(project: Project, id: string): ScheduleDefinition | null {
  const source = project.schedules.find((entry) => entry.id === id);
  if (!source) return null;
  const schedule = draftDefinition(project, {
    ...scheduleDraftFor(source),
    id: undefined,
    name: uniqueScheduleName(project, t("schedules.builder.copyName", { name: source.name })),
  });
  project.schedules.push(schedule);
  return schedule;
}

export interface DeleteScheduleResult {
  removed: boolean;
  problems: ScheduleProblem[];
}

/**
 * Deleting a schedule refuses while a placed table still references it; the
 * placement phase owns the cascade so no item is left pointing at nothing.
 */
export function deleteSchedule(project: Project, id: string): DeleteScheduleResult {
  const index = project.schedules.findIndex((entry) => entry.id === id);
  if (index < 0) return { removed: false, problems: [{ code: "unknownSchedule" }] };
  const used = project.layers.some((layer) =>
    layer.items.some((item) => item.kind === "schedule" && item.scheduleId === id),
  );
  if (used) return { removed: false, problems: [{ code: "inUse", ref: id }] };
  project.schedules.splice(index, 1);
  return { removed: true, problems: [] };
}

/** Stored schedules in project order, for pickers and tests. */
export function projectSchedules(project: Pick<Project, "schedules">): ScheduleDefinition[] {
  return project.schedules;
}

/** One stored schedule, or undefined when it no longer exists. */
export function findSchedule(
  project: Pick<Project, "schedules">,
  id: string | null | undefined,
): ScheduleDefinition | undefined {
  return id ? project.schedules.find((schedule) => schedule.id === id) : undefined;
}
