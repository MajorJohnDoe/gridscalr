import { isCustomValueForField } from "../../model/fields";
import { spaceParentIssues } from "../../model/spaces";
import { isCategorySummaryRole, isCountSummaryRole } from "../../model/summary";
import type { CustomValue, FieldDefinition, PageId, Project } from "../../model/types";
import type { RepairChanges } from "./repairPlan";

/**
 * Deterministic repairs for the schema 28 data foundation: optional summary
 * roles, field applies-to lists and field sets, space links and schedules.
 * Nothing here invents a value or removes an entity; only a broken reference,
 * an unknown custom key or a filter that cannot resolve is cleared.
 */

export function cleanCustomValues(
  record: Record<string, CustomValue> | undefined,
  fieldById: ReadonlyMap<string, FieldDefinition>,
  scope: "measurement" | "space",
  kind: "item" | "space",
  id: string,
  log: RepairChanges,
): Record<string, CustomValue> | undefined {
  if (!record) return undefined;
  for (const [fieldId, value] of Object.entries(record)) {
    const field = fieldById.get(fieldId);
    if (!field || field.scope !== scope) {
      delete record[fieldId];
      log.rewrite(kind, id, "missingCustomField");
      continue;
    }
    if (value === null || !isCustomValueForField(value, field)) {
      delete record[fieldId];
      log.rewrite(kind, id, "invalidCustomValue");
    }
  }
  return Object.keys(record).length ? record : undefined;
}

export function repairFieldReferences(
  project: Project,
  fieldById: ReadonlyMap<string, FieldDefinition>,
  categoryIds: ReadonlySet<string>,
  countTypeIds: ReadonlySet<string>,
  log: RepairChanges,
): void {
  for (const category of project.categories) {
    if (category.summaryRole !== undefined && !isCategorySummaryRole(category.summaryRole)) {
      delete category.summaryRole;
      log.rewrite("category", category.id, "invalidCategorySummaryRole");
    }
  }
  for (const countType of project.countTypes) {
    if (countType.summaryRole !== undefined && !isCountSummaryRole(countType.summaryRole)) {
      delete countType.summaryRole;
      log.rewrite("countType", countType.id, "invalidCountTypeSummaryRole");
    }
  }
  for (const field of project.fieldDefinitions) {
    if (field.appliesTo?.categoryIds) {
      const kept = field.appliesTo.categoryIds.filter((id) => categoryIds.has(id));
      if (kept.length !== field.appliesTo.categoryIds.length) {
        log.rewrite("field", field.id, "missingFieldAppliesToCategory");
      }
      if (kept.length) field.appliesTo.categoryIds = kept;
      else delete field.appliesTo.categoryIds;
    }
    if (field.appliesTo?.countTypes) {
      const kept = field.appliesTo.countTypes.filter((id) => countTypeIds.has(id));
      if (kept.length !== field.appliesTo.countTypes.length) {
        log.rewrite("field", field.id, "missingFieldAppliesToCountType");
      }
      if (kept.length) field.appliesTo.countTypes = kept;
      else delete field.appliesTo.countTypes;
    }
    if (field.appliesTo && !Object.keys(field.appliesTo).length) delete field.appliesTo;
  }
  for (const set of project.fieldSets) {
    const kept = set.fieldIds.filter((id) => fieldById.get(id)?.scope === set.scope);
    if (kept.length !== set.fieldIds.length) {
      log.rewrite("fieldSet", set.id, "missingFieldSetField");
      set.fieldIds = kept;
    }
  }
}

export function repairSpaceReferences(
  project: Project,
  fieldById: ReadonlyMap<string, FieldDefinition>,
  pageIds: ReadonlySet<PageId>,
  log: RepairChanges,
): Set<string> {
  const parentIssues = new Map<string, string>();
  for (const issue of spaceParentIssues(project.spaces)) {
    if (!parentIssues.has(issue.spaceId)) parentIssues.set(issue.spaceId, issue.code);
  }
  for (const space of project.spaces) {
    const parentIssue = parentIssues.get(space.id);
    if (parentIssue) {
      delete space.parentId;
      log.rewrite("space", space.id, parentIssue);
    }
    if (space.pageId && !pageIds.has(space.pageId)) {
      delete space.pageId;
      log.rewrite("space", space.id, "missingSpacePage");
    }
    if (space.areaMode === "measured" && space.areaM2 !== undefined) {
      delete space.areaM2;
      log.rewrite("space", space.id, "unexpectedSpaceArea");
    }
    space.custom = cleanCustomValues(space.custom, fieldById, "space", "space", space.id, log);
    if (!space.custom) delete space.custom;
  }
  return new Set(project.spaces.map((space) => space.id));
}

export function repairScheduleReferences(
  project: Project,
  fieldById: ReadonlyMap<string, FieldDefinition>,
  pageIds: ReadonlySet<PageId>,
  categoryIds: ReadonlySet<string>,
  countTypeIds: ReadonlySet<string>,
  spaceIds: ReadonlySet<string>,
  log: RepairChanges,
): Set<string> {
  for (const schedule of project.schedules) {
    const filters = schedule.filters;
    if (filters.pageIds) {
      const kept = filters.pageIds.filter((id) => pageIds.has(id));
      if (kept.length !== filters.pageIds.length) {
        log.rewrite("schedule", schedule.id, "missingScheduleFilterPage");
      }
      if (kept.length) filters.pageIds = kept;
      else delete filters.pageIds;
    }
    if (filters.categoryIds) {
      const kept = filters.categoryIds.filter((id) => categoryIds.has(id));
      if (kept.length !== filters.categoryIds.length) {
        log.rewrite("schedule", schedule.id, "missingScheduleFilterCategory");
      }
      if (kept.length) filters.categoryIds = kept;
      else delete filters.categoryIds;
    }
    if (filters.countTypes) {
      const kept = filters.countTypes.filter((id) => countTypeIds.has(id));
      if (kept.length !== filters.countTypes.length) {
        log.rewrite("schedule", schedule.id, "missingScheduleFilterCountType");
      }
      if (kept.length) filters.countTypes = kept;
      else delete filters.countTypes;
    }
    if (filters.spaceIds) {
      const kept = filters.spaceIds.filter((id) => spaceIds.has(id));
      if (kept.length !== filters.spaceIds.length) {
        log.rewrite("schedule", schedule.id, "missingScheduleFilterSpace");
      }
      if (kept.length) filters.spaceIds = kept;
      else delete filters.spaceIds;
    }
    if (filters.custom) {
      const kept = filters.custom.filter((filter) => {
        const field = fieldById.get(filter.fieldId);
        if (
          !field ||
          (schedule.source === "spaces" ? field.scope !== "space" : field.scope !== "measurement")
        ) {
          log.rewrite("schedule", schedule.id, "missingScheduleFilterField");
          return false;
        }
        if (
          filter.value !== undefined &&
          filter.value !== null &&
          !isCustomValueForField(filter.value, field)
        ) {
          log.rewrite("schedule", schedule.id, "invalidScheduleFilterValue");
          return false;
        }
        return true;
      });
      if (kept.length) filters.custom = kept;
      else delete filters.custom;
    }
  }
  return new Set(project.schedules.map((schedule) => schedule.id));
}
