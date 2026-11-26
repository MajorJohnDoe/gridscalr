import {
  addCategory as addCategoryToProject,
  categoryNameError,
  countCategoryItems,
  findCategory,
  moveCategory as moveCategoryInProject,
  removeCategory as removeCategoryFromProject,
  renameCategory as renameCategoryInProject,
  setDefaultCategory as setDefaultCategoryInProject,
  type RemoveCategoryResult,
} from "../model/categories";
import {
  setCategoryQuantityOverride as applyCategoryQuantityOverride,
  setQuantityDefaults as applyQuantityDefaults,
} from "../model/commands/settings";
import type { Category } from "../model/types";
import type { ProjectStore } from "./projectStore";

/**
 * Category and quantity-default actions of the compatibility store.
 *
 * Every rule (name validation, move bounds, default-category fallback, waste
 * and rounding clamping) lives in `model/categories.ts` and
 * `model/commands/settings.ts`. This module only decides whether to call them,
 * so a changed edit is one undo step and a no-op adds none.
 */
export class ProjectTaxonomy {
  constructor(private readonly state: ProjectStore) {}

  addCategory(name: string): Category | null {
    const project = this.state.project;
    if (!project) return null;
    if (categoryNameError(project.categories, name)) return null;
    let created: Category | null = null;
    this.state.mutate((next) => {
      created = addCategoryToProject(next, name);
    }, "change");
    return created;
  }

  renameCategory(id: string, name: string): boolean {
    const project = this.state.project;
    if (!project) return false;
    if (!findCategory(project, id)) return false;
    if (categoryNameError(project.categories, name, id)) return false;
    this.state.mutate((next) => {
      renameCategoryInProject(next, id, name);
    }, "change");
    return true;
  }

  moveCategory(id: string, direction: -1 | 1): boolean {
    const project = this.state.project;
    if (!project) return false;
    const index = project.categories.findIndex((category) => category.id === id);
    if (index < 0) return false;
    const target = index + direction;
    if (target < 0 || target >= project.categories.length) return false;
    this.state.mutate((next) => {
      moveCategoryInProject(next, id, direction);
    }, "change");
    return true;
  }

  removeCategory(id: string, targetId?: string): RemoveCategoryResult {
    const project = this.state.project;
    if (!project) return { removed: false, moved: 0, reason: "missing" };
    if (!findCategory(project, id)) return { removed: false, moved: 0, reason: "missing" };
    if (project.categories.length <= 1) return { removed: false, moved: 0, reason: "last" };
    let result: RemoveCategoryResult = { removed: false, moved: 0 };
    this.state.mutate((next) => {
      result = removeCategoryFromProject(next, id, targetId);
    }, "change");
    return result;
  }

  setDefaultCategory(id: string): boolean {
    const project = this.state.project;
    if (!project || !findCategory(project, id)) return false;
    if (project.settings.quantity.defaultCategoryId === id) return true;
    this.state.mutate((next) => {
      setDefaultCategoryInProject(next, id);
    }, "change");
    return true;
  }

  categoryItemCount(id: string): number {
    return this.state.project ? countCategoryItems(this.state.project, id) : 0;
  }

  setQuantityDefaults(patch: { wastePercent?: number; roundingStep?: number }): boolean {
    if (!this.state.project) return false;
    if (
      (patch.wastePercent !== undefined && !Number.isFinite(patch.wastePercent)) ||
      (patch.roundingStep !== undefined && !Number.isFinite(patch.roundingStep))
    ) {
      return false;
    }
    this.state.mutateIfChanged((project) => applyQuantityDefaults(project, patch), "change");
    return true;
  }

  setCategoryQuantityOverride(
    id: string,
    field: "wastePercent" | "roundingStep",
    value: number | null,
  ): boolean {
    const project = this.state.project;
    if (!project || !findCategory(project, id)) return false;
    if (value !== null && !Number.isFinite(value)) return false;
    this.state.mutateIfChanged(
      (next) => applyCategoryQuantityOverride(next, id, field, value),
      "change",
    );
    return true;
  }
}
