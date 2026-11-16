import { customFieldIdForRef } from "../../../model/schedules";
import type { CustomValue, MarkupItem, Project, Space } from "../../../model/types";
import type {
  ScheduleCsvApplyOptions,
  ScheduleCsvApplyResult,
  ScheduleCsvImportPlan,
  ScheduleCsvUpdate,
} from "./types";
import { customValueAllowed } from "./values";

/**
 * Applies a dry-run plan to the project. The caller runs this inside one store
 * mutation, so a multi-row import is one undo step. Nothing is created: a row
 * whose entity disappeared between the dry run and the confirmation is skipped.
 */

function itemMap(project: Project): Map<string, MarkupItem> {
  const map = new Map<string, MarkupItem>();
  for (const layer of project.layers) {
    for (const item of layer.items) map.set(item.id, item);
  }
  return map;
}

function setItemField(item: MarkupItem, field: string, value: string | null): void {
  if (field === "label") {
    if (value === null) delete item.label;
    else item.label = value;
    return;
  }
  if (field === "room") {
    if (value === null) delete item.room;
    else item.room = value;
    return;
  }
  if (field === "tag") {
    if (value === null) delete item.tag;
    else item.tag = value;
  }
}

function setSpaceField(space: Space, field: string, value: string | null): void {
  if (field === "name") {
    if (value !== null) space.name = value;
    return;
  }
  if (field === "number") {
    if (value === null) delete space.number;
    else space.number = value;
    return;
  }
  if (field === "floor") {
    if (value === null) delete space.floor;
    else space.floor = value;
    return;
  }
  if (field === "usage") {
    if (value === null) delete space.usage;
    else space.usage = value;
    return;
  }
  if (field === "status") {
    if (value === null) delete space.status;
    else space.status = value;
  }
}

function setCustomValue(
  target: { custom?: Record<string, CustomValue> },
  field: string,
  value: CustomValue | null,
): void {
  const fieldId = customFieldIdForRef(field);
  if (!fieldId) return;
  const custom = { ...(target.custom ?? {}) };
  if (value === null) delete custom[fieldId];
  else custom[fieldId] = value;
  if (Object.keys(custom).length) target.custom = custom;
  else delete target.custom;
}

function applyUpdates(
  project: Project,
  target: MarkupItem | Space,
  updates: readonly ScheduleCsvUpdate[],
  applyBuiltIn: (update: ScheduleCsvUpdate) => void,
): boolean {
  let changed = false;
  for (const update of updates) {
    if (update.kind === "builtIn") {
      applyBuiltIn(update);
      changed = true;
      continue;
    }
    const fieldId = customFieldIdForRef(update.field);
    if (!fieldId) continue;
    const field = project.fieldDefinitions.find((entry) => entry.id === fieldId);
    if (!field) continue;
    const value = update.value as CustomValue | null;
    if (!customValueAllowed(field, value)) continue;
    setCustomValue(target, update.field, value);
    changed = true;
  }
  return changed;
}

export function applyScheduleCsvImport(
  project: Project,
  plan: ScheduleCsvImportPlan,
  options: ScheduleCsvApplyOptions = {},
): ScheduleCsvApplyResult {
  const items = itemMap(project);
  const spaces = new Map(project.spaces.map((space) => [space.id, space]));
  const now = options.now ?? new Date().toISOString();
  let applied = 0;
  let skipped = 0;

  for (const row of plan.changed) {
    if (row.type === "item") {
      const item = items.get(row.id);
      if (!item) {
        skipped += 1;
        continue;
      }
      const changed = applyUpdates(project, item, row.updates, (update) =>
        setItemField(item, update.field, typeof update.value === "string" ? update.value : null),
      );
      if (changed) {
        item.updatedAt = now;
        applied += 1;
      } else {
        skipped += 1;
      }
      continue;
    }
    const space = spaces.get(row.id);
    if (!space) {
      skipped += 1;
      continue;
    }
    const changed = applyUpdates(project, space, row.updates, (update) =>
      setSpaceField(space, update.field, typeof update.value === "string" ? update.value : null),
    );
    if (changed) {
      space.updatedAt = now;
      applied += 1;
    } else {
      skipped += 1;
    }
  }
  return { applied, skipped };
}
