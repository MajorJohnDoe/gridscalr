import { makeId } from "./calibration";
import type { Category, ItemKind, MarkupItem, Project, QuantitySettings } from "./types";

/**
 * Category ids are generated per project. The default set is only a starting
 * point: every name can be edited, reordered, added to, or removed.
 */
export const DEFAULT_CATEGORY_NAMES = [
  "Floor",
  "Wall",
  "Ceiling",
  "Facade",
  "Roof",
  "Ground",
  "Other",
] as const;

export const CATEGORY_NAME_MAX_LENGTH = 40;

/** Kept local so this module stays free of a cycle through `layers.ts`. */
const MEASUREMENT_KINDS: ReadonlySet<ItemKind> = new Set(["length", "area", "count"]);

export function isMeasurementItem(item: MarkupItem): boolean {
  return MEASUREMENT_KINDS.has(item.kind);
}

export function createDefaultCategories(): Category[] {
  return DEFAULT_CATEGORY_NAMES.map((name) => ({ id: makeId("cat"), name }));
}

export function createDefaultQuantitySettings(categories: Category[]): QuantitySettings {
  const fallback =
    categories.find((category) => category.name.toLowerCase() === "other") ?? categories[0];
  return {
    defaultCategoryId: fallback?.id ?? "",
    wastePercent: 0,
    roundingStep: 0,
  };
}

/** Trims and collapses internal whitespace. Validation happens separately. */
export function normalizeCategoryName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function categoryNameError(
  categories: Category[],
  value: string,
  exceptId?: string,
): string | null {
  const name = normalizeCategoryName(value);
  if (!name) return "Enter a category name.";
  if (name.length > CATEGORY_NAME_MAX_LENGTH) {
    return `Keep the name under ${CATEGORY_NAME_MAX_LENGTH} characters.`;
  }
  const key = name.toLowerCase();
  const duplicate = categories.some(
    (category) => category.id !== exceptId && category.name.toLowerCase() === key,
  );
  if (duplicate) return "A category with this name already exists.";
  return null;
}

export function findCategory(project: Project, id: string | undefined): Category | undefined {
  if (!id) return undefined;
  return project.categories.find((category) => category.id === id);
}

export function defaultCategory(project: Project): Category | undefined {
  return (
    findCategory(project, project.settings.quantity.defaultCategoryId) ?? project.categories[0]
  );
}

/** Resolves an item category id, falling back to the project default. */
export function categoryForItem(project: Project, item: MarkupItem): Category | undefined {
  return findCategory(project, item.categoryId) ?? defaultCategory(project);
}

/**
 * Resolves the category for the next measurement. A stale or missing preferred
 * id falls back to the project default instead of blocking creation.
 */
export function measurementCategory(
  project: Project,
  preferredId?: string | null,
): Category | undefined {
  return findCategory(project, preferredId ?? undefined) ?? defaultCategory(project);
}

/** Rooms are trimmed free text; an empty room is stored as undefined. */
export function normalizeRoom(value: string): string | undefined {
  const room = value.trim();
  return room || undefined;
}

export function addCategory(project: Project, name: string): Category | null {
  if (categoryNameError(project.categories, name)) return null;
  const category: Category = {
    id: makeId("cat"),
    name: normalizeCategoryName(name),
  };
  project.categories.push(category);
  return category;
}

export function renameCategory(project: Project, id: string, name: string): boolean {
  const category = findCategory(project, id);
  if (!category) return false;
  if (categoryNameError(project.categories, name, id)) return false;
  category.name = normalizeCategoryName(name);
  return true;
}

export function moveCategory(project: Project, id: string, direction: -1 | 1): boolean {
  const index = project.categories.findIndex((category) => category.id === id);
  if (index < 0) return false;
  const target = index + direction;
  if (target < 0 || target >= project.categories.length) return false;
  const [category] = project.categories.splice(index, 1);
  project.categories.splice(target, 0, category);
  return true;
}

export function setDefaultCategory(project: Project, id: string): boolean {
  if (!findCategory(project, id)) return false;
  project.settings.quantity.defaultCategoryId = id;
  return true;
}

export function countCategoryItems(project: Project, id: string): number {
  let count = 0;
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (isMeasurementItem(item) && item.categoryId === id) count++;
    }
  }
  return count;
}

/** Moves measurements from one category to another. Returns the moved count. */
export function relocateCategoryItems(project: Project, fromId: string, toId: string): number {
  if (fromId === toId) return 0;
  let moved = 0;
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (!isMeasurementItem(item) || item.categoryId !== fromId) continue;
      item.categoryId = toId;
      moved++;
    }
  }
  return moved;
}

export interface RemoveCategoryResult {
  removed: boolean;
  moved: number;
  reason?: "missing" | "last";
}

/**
 * Removes a category. Measurements are reassigned to `targetId`; when it is
 * missing or invalid the first remaining category is used so the project never
 * references a category that does not exist.
 */
export function removeCategory(
  project: Project,
  id: string,
  targetId?: string,
): RemoveCategoryResult {
  const category = findCategory(project, id);
  if (!category) return { removed: false, moved: 0, reason: "missing" };
  if (project.categories.length <= 1) return { removed: false, moved: 0, reason: "last" };

  const others = project.categories.filter((entry) => entry.id !== id);
  const target = others.find((entry) => entry.id === targetId) ?? others[0];
  const moved = relocateCategoryItems(project, id, target.id);
  const wasDefault = project.settings.quantity.defaultCategoryId === id;

  project.categories = others;
  if (wasDefault) project.settings.quantity.defaultCategoryId = target.id;
  for (const view of project.markupsViews) {
    if (view.categoryId === id) view.categoryId = null;
  }
  return { removed: true, moved };
}

/** Distinct rooms in document order, sorted for autocomplete. */
export function allRooms(project: Project): string[] {
  const seen = new Map<string, string>();
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (!isMeasurementItem(item)) continue;
      const room = item.room?.trim();
      if (!room) continue;
      const key = room.toLowerCase();
      if (!seen.has(key)) seen.set(key, room);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
