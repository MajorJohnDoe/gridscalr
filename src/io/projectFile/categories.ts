import { makeId } from "../../model/calibration";
import {
  CATEGORY_NAME_MAX_LENGTH,
  createDefaultCategories,
  normalizeCategoryName,
} from "../../model/categories";
import type { Category } from "../../model/types";

export function uniqueCategoryName(categories: Category[], wanted: string): string {
  const exists = (candidate: string) =>
    categories.some((category) => category.name.toLowerCase() === candidate.toLowerCase());
  if (!exists(wanted)) return wanted;
  let index = 2;
  for (;;) {
    const suffix = ` ${index++}`;
    const candidate = `${wanted.slice(0, CATEGORY_NAME_MAX_LENGTH - suffix.length).trim()}${suffix}`;
    if (!exists(candidate)) return candidate;
  }
}

export function normalizeCategories(value: unknown, report?: (code: string) => void): Category[] {
  const categories: Category[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== "object" || entry === null) {
        report?.("droppedCategory");
        continue;
      }
      const raw = entry as Partial<Category>;
      const name = typeof raw.name === "string" ? normalizeCategoryName(raw.name) : "";
      if (!name) {
        report?.("droppedCategory");
        continue;
      }
      const clipped = name.slice(0, CATEGORY_NAME_MAX_LENGTH).trim();
      let id = typeof raw.id === "string" && raw.id ? raw.id : makeId("cat");
      if (categories.some((category) => category.id === id)) {
        id = makeId("cat");
      }
      const category: Category = { id, name: uniqueCategoryName(categories, clipped) };
      if (typeof raw.wastePercent === "number" && Number.isFinite(raw.wastePercent)) {
        category.wastePercent = Math.max(0, Math.min(100, raw.wastePercent));
      }
      if (typeof raw.roundingStep === "number" && Number.isFinite(raw.roundingStep)) {
        category.roundingStep = Math.max(0, raw.roundingStep);
      }
      categories.push(category);
    }
  }
  return categories.length ? categories : createDefaultCategories();
}
