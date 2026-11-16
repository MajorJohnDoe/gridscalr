import {
  FIELD_KEY_PATTERN,
  fieldHasOptions,
  isCustomValueForField,
  isFieldScope,
  isFieldType,
} from "./fields";
import { isSpaceAreaMode, isSpaceKind, spaceParentIssues } from "./spaces";
import {
  isScheduleRowMode,
  isScheduleSource,
  scheduleFieldRefResolves,
  scheduleFieldRefs,
} from "./schedules";
import {
  SUMMARY_CARD_IDS,
  isCategorySummaryRole,
  isCountSummaryRole,
  isSummaryCardId,
} from "./summary";
import type { ProjectIssue, ProjectIssueSeverity } from "./integrity";
import type { FieldDefinition, Project, Space } from "./types";

/**
 * Schema 28 referential-integrity rules: custom fields, spaces, schedules,
 * schedule placements and summary settings. The validator never mutates data.
 * Unknown references are reported and preserved for the project doctor.
 */

function push(
  issues: ProjectIssue[],
  severity: ProjectIssueSeverity,
  code: string,
  kind: string,
  id?: string,
): void {
  issues.push(
    id
      ? { severity, code, message: code, entity: { kind, id } }
      : { severity, code, message: code },
  );
}

function isIso(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validateFieldOptions(field: FieldDefinition, issues: ProjectIssue[]): void {
  if (!fieldHasOptions(field)) {
    if (field.options !== undefined) {
      push(issues, "warning", "invalidFieldOptions", "field", field.id);
    }
    return;
  }
  const options = field.options;
  if (!Array.isArray(options) || !options.length) {
    push(issues, "error", "invalidFieldOptions", "field", field.id);
    return;
  }
  const ids = new Set<string>();
  for (const option of options) {
    if (typeof option.id !== "string" || !option.id.trim() || !option.label?.trim()) {
      push(issues, "error", "invalidFieldOptions", "field", field.id);
      return;
    }
    if (ids.has(option.id)) {
      push(issues, "error", "invalidFieldOptions", "field", field.id);
      return;
    }
    ids.add(option.id);
  }
}

function validateValueRecord(
  value: Record<string, unknown>,
  fieldById: ReadonlyMap<string, FieldDefinition>,
  scope: "measurement" | "space",
  kind: string,
  id: string,
  issues: ProjectIssue[],
): void {
  for (const [fieldId, customValue] of Object.entries(value)) {
    const field = fieldById.get(fieldId);
    if (!field || field.scope !== scope) {
      push(issues, "error", "missingCustomField", kind, id);
      continue;
    }
    if (customValue === null || !isCustomValueForField(customValue, field)) {
      push(issues, "error", "invalidCustomValue", kind, id);
    }
  }
}

function validateFields(project: Project, issues: ProjectIssue[]): Map<string, FieldDefinition> {
  const fieldById = new Map<string, FieldDefinition>();
  const keys = new Set<string>();
  const categoryIds = new Set(project.categories.map((category) => category.id));
  const countTypeIds = new Set(project.countTypes.map((countType) => countType.id));
  for (const field of project.fieldDefinitions) {
    if (fieldById.has(field.id)) {
      push(issues, "error", "duplicateFieldDefinitionId", "field", field.id);
    } else {
      fieldById.set(field.id, field);
    }
    if (!isFieldScope(field.scope)) {
      push(issues, "error", "invalidFieldScope", "field", field.id);
    }
    if (!isFieldType(field.type)) {
      push(issues, "error", "invalidFieldType", "field", field.id);
    }
    if (typeof field.key !== "string" || !FIELD_KEY_PATTERN.test(field.key)) {
      push(issues, "error", "invalidFieldKey", "field", field.id);
    }
    if (typeof field.label !== "string" || !field.label.trim()) {
      push(issues, "warning", "missingFieldLabel", "field", field.id);
    }
    if (typeof field.order !== "number" || !Number.isFinite(field.order)) {
      push(issues, "warning", "invalidFieldOrder", "field", field.id);
    }
    const key = `${field.scope}:${field.key}`;
    if (keys.has(key)) push(issues, "error", "duplicateFieldKey", "field", field.id);
    else keys.add(key);
    validateFieldOptions(field, issues);
    if (
      field.defaultValue !== undefined &&
      field.defaultValue !== null &&
      !isCustomValueForField(field.defaultValue, field)
    ) {
      push(issues, "error", "invalidFieldDefault", "field", field.id);
    }
    const validation = field.validation;
    if (
      validation &&
      ((validation.min !== undefined &&
        validation.max !== undefined &&
        validation.min > validation.max) ||
        (validation.maxLength !== undefined && validation.maxLength < 1))
    ) {
      push(issues, "warning", "invalidFieldValidation", "field", field.id);
    }
    for (const categoryId of field.appliesTo?.categoryIds ?? []) {
      if (!categoryIds.has(categoryId)) {
        push(issues, "warning", "missingFieldAppliesToCategory", "field", field.id);
      }
    }
    for (const countType of field.appliesTo?.countTypes ?? []) {
      if (!countTypeIds.has(countType)) {
        push(issues, "warning", "missingFieldAppliesToCountType", "field", field.id);
      }
    }
  }
  return fieldById;
}

function validateFieldSets(
  project: Project,
  fieldById: ReadonlyMap<string, FieldDefinition>,
  issues: ProjectIssue[],
): void {
  const ids = new Set<string>();
  for (const set of project.fieldSets) {
    if (ids.has(set.id)) push(issues, "error", "duplicateFieldSetId", "fieldSet", set.id);
    else ids.add(set.id);
    if (!isFieldScope(set.scope)) {
      push(issues, "error", "invalidFieldSetScope", "fieldSet", set.id);
    }
    if (typeof set.name !== "string" || !set.name.trim()) {
      push(issues, "warning", "missingFieldSetName", "fieldSet", set.id);
    }
    for (const fieldId of set.fieldIds) {
      if (fieldById.get(fieldId)?.scope !== set.scope) {
        push(issues, "warning", "missingFieldSetField", "fieldSet", set.id);
      }
    }
  }
}

function validateSpaces(
  project: Project,
  fieldById: ReadonlyMap<string, FieldDefinition>,
  pageIds: ReadonlySet<string>,
  issues: ProjectIssue[],
): Set<string> {
  const ids = new Set<string>();
  const byId = new Map<string, Space>();
  for (const space of project.spaces) {
    if (ids.has(space.id)) push(issues, "error", "duplicateSpaceId", "space", space.id);
    else {
      ids.add(space.id);
      byId.set(space.id, space);
    }
    if (!isSpaceKind(space.kind)) {
      push(issues, "error", "invalidSpaceKind", "space", space.id);
    }
    if (!isSpaceAreaMode(space.areaMode)) {
      push(issues, "error", "invalidSpaceAreaMode", "space", space.id);
    }
    if (typeof space.name !== "string" || !space.name.trim()) {
      push(issues, "error", "missingSpaceName", "space", space.id);
    }
    if (space.pageId && !pageIds.has(space.pageId)) {
      push(issues, "warning", "missingSpacePage", "space", space.id);
    }
    if (space.areaMode === "measured" && space.areaM2 !== undefined) {
      push(issues, "warning", "unexpectedSpaceArea", "space", space.id);
    }
    if (space.areaMode === "manual") {
      if (typeof space.areaM2 !== "number" || !Number.isFinite(space.areaM2) || space.areaM2 < 0) {
        push(issues, "warning", "missingSpaceArea", "space", space.id);
      }
    }
    if (!isIso(space.createdAt) || !isIso(space.updatedAt)) {
      push(issues, "warning", "invalidSpaceTimestamp", "space", space.id);
    }
    if (space.custom) {
      validateValueRecord(space.custom, fieldById, "space", "space", space.id, issues);
    }
  }
  for (const parentIssue of spaceParentIssues(project.spaces)) {
    push(issues, "error", parentIssue.code, "space", parentIssue.spaceId);
  }
  // Duplicate room numbers are a warning, never a hard error.
  const numbers = new Map<string, Set<string>>();
  for (const space of byId.values()) {
    if (!space.number) continue;
    const parent = space.parentId ?? "";
    const key = `${parent}:${space.number.trim().toLowerCase()}`;
    const seen = numbers.get(key) ?? new Set<string>();
    if (seen.size) push(issues, "warning", "duplicateSpaceNumber", "space", space.id);
    seen.add(space.id);
    numbers.set(key, seen);
  }
  return ids;
}

function validateSchedules(
  project: Project,
  fieldById: ReadonlyMap<string, FieldDefinition>,
  pageIds: ReadonlySet<string>,
  categoryIds: ReadonlySet<string>,
  countTypeIds: ReadonlySet<string>,
  spaceIds: ReadonlySet<string>,
  issues: ProjectIssue[],
): Set<string> {
  const ids = new Set<string>();
  const fields = [...fieldById.values()];
  for (const schedule of project.schedules) {
    if (ids.has(schedule.id)) push(issues, "error", "duplicateScheduleId", "schedule", schedule.id);
    else ids.add(schedule.id);
    if (!isScheduleSource(schedule.source)) {
      push(issues, "error", "invalidScheduleSource", "schedule", schedule.id);
    }
    if (!isScheduleRowMode(schedule.rowMode)) {
      push(issues, "error", "invalidScheduleRowMode", "schedule", schedule.id);
    }
    if (typeof schedule.name !== "string" || !schedule.name.trim()) {
      push(issues, "warning", "missingScheduleName", "schedule", schedule.id);
    }
    if (!isIso(schedule.createdAt) || !isIso(schedule.updatedAt)) {
      push(issues, "warning", "invalidScheduleTimestamp", "schedule", schedule.id);
    }
    const columnIds = new Set<string>();
    for (const column of schedule.columns) {
      if (columnIds.has(column.id)) {
        push(issues, "error", "duplicateScheduleColumn", "schedule", schedule.id);
      } else columnIds.add(column.id);
    }
    for (const ref of scheduleFieldRefs(schedule)) {
      if (!scheduleFieldRefResolves(ref, schedule.source, fields)) {
        push(issues, "warning", "invalidScheduleField", "schedule", schedule.id);
      }
    }
    for (const pageId of schedule.filters.pageIds ?? []) {
      if (!pageIds.has(pageId)) {
        push(issues, "warning", "missingScheduleFilterPage", "schedule", schedule.id);
      }
    }
    for (const categoryId of schedule.filters.categoryIds ?? []) {
      if (!categoryIds.has(categoryId)) {
        push(issues, "warning", "missingScheduleFilterCategory", "schedule", schedule.id);
      }
    }
    for (const countType of schedule.filters.countTypes ?? []) {
      if (!countTypeIds.has(countType)) {
        push(issues, "warning", "missingScheduleFilterCountType", "schedule", schedule.id);
      }
    }
    for (const spaceId of schedule.filters.spaceIds ?? []) {
      if (!spaceIds.has(spaceId)) {
        push(issues, "warning", "missingScheduleFilterSpace", "schedule", schedule.id);
      }
    }
    for (const custom of schedule.filters.custom ?? []) {
      const field = fieldById.get(custom.fieldId);
      if (
        !field ||
        (schedule.source === "spaces" ? field.scope !== "space" : field.scope !== "measurement")
      ) {
        push(issues, "warning", "missingScheduleFilterField", "schedule", schedule.id);
        continue;
      }
      if (
        custom.value !== undefined &&
        custom.value !== null &&
        !isCustomValueForField(custom.value, field)
      ) {
        push(issues, "warning", "invalidScheduleFilterValue", "schedule", schedule.id);
      }
    }
  }
  return ids;
}

/**
 * All schema 28 rules. Item placement and custom values are checked here so the
 * original validator stays focused on the older entities.
 */
export function validateSchema28(project: Project): ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  const pageIds = new Set(project.pages.map((page) => page.id));
  const categoryIds = new Set(project.categories.map((category) => category.id));
  const countTypeIds = new Set(project.countTypes.map((countType) => countType.id));

  for (const category of project.categories) {
    if (category.summaryRole !== undefined && !isCategorySummaryRole(category.summaryRole)) {
      push(issues, "warning", "invalidCategorySummaryRole", "category", category.id);
    }
  }
  for (const countType of project.countTypes) {
    if (countType.summaryRole !== undefined && !isCountSummaryRole(countType.summaryRole)) {
      push(issues, "warning", "invalidCountTypeSummaryRole", "countType", countType.id);
    }
  }

  const fieldById = validateFields(project, issues);
  validateFieldSets(project, fieldById, issues);
  const spaceIds = validateSpaces(project, fieldById, pageIds, issues);
  const scheduleIds = validateSchedules(
    project,
    fieldById,
    pageIds,
    categoryIds,
    countTypeIds,
    spaceIds,
    issues,
  );

  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (item.kind === "schedule") {
        if (!item.scheduleId || !scheduleIds.has(item.scheduleId)) {
          push(issues, "warning", "missingSchedulePlacement", "item", item.id);
        }
        if (
          item.rowStart !== undefined &&
          (!Number.isInteger(item.rowStart) || item.rowStart < 0)
        ) {
          push(issues, "warning", "invalidScheduleRowRange", "item", item.id);
        }
        if (
          item.rowLimit !== undefined &&
          (!Number.isInteger(item.rowLimit) || item.rowLimit < 1)
        ) {
          push(issues, "warning", "invalidScheduleRowRange", "item", item.id);
        }
      } else if (item.scheduleId !== undefined) {
        push(issues, "warning", "unexpectedScheduleFields", "item", item.id);
      }
      if (item.spaceId !== undefined) {
        if (item.kind !== "area") {
          push(issues, "error", "invalidItemSpace", "item", item.id);
        } else if (!spaceIds.has(item.spaceId)) {
          push(issues, "error", "missingItemSpace", "item", item.id);
        }
      }
      if (item.custom) {
        validateValueRecord(item.custom, fieldById, "measurement", "item", item.id, issues);
      }
    }
  }

  const cards = project.settings.summary?.cards;
  if (!Array.isArray(cards)) {
    push(issues, "error", "invalidSummarySettings", "settings", "summary.cards");
  } else {
    const seen = new Set<string>();
    for (const card of cards) {
      if (!isSummaryCardId(card.id) || seen.has(card.id)) {
        push(issues, "error", "invalidSummarySettings", "settings", "summary.cards");
      } else seen.add(card.id);
    }
    for (const id of SUMMARY_CARD_IDS) {
      if (!seen.has(id)) {
        push(issues, "error", "invalidSummarySettings", "settings", `summary.cards.${id}`);
      }
    }
  }

  return issues;
}
