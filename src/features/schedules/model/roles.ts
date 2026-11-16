import { isCategorySummaryRole, isCountSummaryRole } from "../../../model/summary";
import type { CategorySummaryRole, CountSummaryRole, Project } from "../../../model/types";

/**
 * Summary-role mutations. A role is optional and never inferred; the caller
 * owns the undo step, so changing a role is one action.
 */

export function setCategorySummaryRole(
  project: Project,
  categoryId: string,
  role: CategorySummaryRole | undefined,
): boolean {
  const category = project.categories.find((entry) => entry.id === categoryId);
  if (!category) return false;
  if (role === undefined) {
    delete category.summaryRole;
    return true;
  }
  if (!isCategorySummaryRole(role)) return false;
  category.summaryRole = role;
  return true;
}

export function setCountTypeSummaryRole(
  project: Project,
  countTypeId: string,
  role: CountSummaryRole | undefined,
): boolean {
  const type = project.countTypes.find((entry) => entry.id === countTypeId);
  if (!type) return false;
  if (role === undefined) {
    delete type.summaryRole;
    return true;
  }
  if (!isCountSummaryRole(role)) return false;
  type.summaryRole = role;
  return true;
}

/** True when at least one category carries each role the cards read. */
export function summaryRolesPresent(project: Pick<Project, "categories" | "countTypes">): {
  wall: boolean;
  door: boolean;
} {
  return {
    wall: project.categories.some((category) => category.summaryRole === "wall"),
    door: project.countTypes.some((type) => type.summaryRole === "door"),
  };
}
