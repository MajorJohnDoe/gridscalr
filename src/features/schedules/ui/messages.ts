import { t } from "../../../i18n";
import type { ScheduleProblem } from "../model";

/**
 * Localized text for a schedule problem. The builder shows a problem next to
 * the control that caused it; the panel shows the same text once, so a broken
 * reference is never silent.
 */
export function scheduleProblemText(
  problem: ScheduleProblem,
  labels: { field?: string; filter?: string } = {},
): string {
  switch (problem.code) {
    case "missingName":
      return t("schedules.problem.missingName");
    case "noColumns":
      return t("schedules.problem.noColumns");
    case "invalidField":
      return t("schedules.problem.invalidField", {
        field: labels.field ?? problem.ref ?? "",
      });
    case "invalidFilter":
      return t("schedules.problem.invalidFilter", {
        filter: labels.filter ?? problem.fieldId ?? problem.ref ?? "",
      });
    case "inapplicableFilter":
      return t("schedules.problem.inapplicableFilter");
    case "invalidCustomValue":
      return t("schedules.problem.invalidCustomValue", {
        field: labels.field ?? problem.fieldId ?? "",
      });
    case "inUse":
      return t("schedules.problem.inUse");
    case "unknownSchedule":
      return t("schedules.problem.unknownSchedule");
  }
}

/** Short text for a field reference that does not resolve. */
export function invalidFieldText(ref: string): string {
  return t("schedules.invalidField", { field: ref });
}
