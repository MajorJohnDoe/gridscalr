import type { ProjectIssue, ProjectIssueSeverity } from "../../model/integrity";
import { availableRepairs, repairForCode, type RepairKind, type RepairScope } from "./repairPlan";

/**
 * Doctor issue filters. Filtering only narrows the list that is shown: it never
 * changes which repairs exist, which repairs are checked, or what an applied
 * repair does. "Select all" is the one filtered action and it is explicit.
 */
export type DoctorSeverityFilter = "all" | ProjectIssueSeverity;
export type DoctorRepairFilter = "all" | "repairable" | "report-only";

export interface DoctorIssueFilter {
  severity: DoctorSeverityFilter;
  kind: RepairScope | "all";
  repair: DoctorRepairFilter;
}

export const DEFAULT_DOCTOR_FILTER: DoctorIssueFilter = {
  severity: "all",
  kind: "all",
  repair: "all",
};

const SCOPES: readonly RepairScope[] = [
  "project",
  "document",
  "page",
  "layer",
  "item",
  "asset",
  "ocr",
  "category",
  "countType",
  "lineType",
  "countPreset",
  "markupsView",
  "settings",
];

const OCR_CODES = new Set(["ocrDocumentMismatch", "ocrSourcePageMismatch"]);

/** The entity scope used by the kind filter. OCR text has its own scope. */
export function issueScope(issue: ProjectIssue): RepairScope {
  if (OCR_CODES.has(issue.code)) return "ocr";
  const kind = issue.entity?.kind as RepairScope | undefined;
  return kind && SCOPES.includes(kind) ? kind : "project";
}

/** Repair kinds present in the issue list, in a stable display order. */
export function doctorFilterKinds(issues: readonly ProjectIssue[]): RepairScope[] {
  const present = new Set(issues.map(issueScope));
  return SCOPES.filter((scope) => present.has(scope));
}

export function filterDoctorIssues(
  issues: readonly ProjectIssue[],
  filter: DoctorIssueFilter,
): ProjectIssue[] {
  return issues.filter((issue) => {
    if (filter.severity !== "all" && issue.severity !== filter.severity) return false;
    if (filter.kind !== "all" && issueScope(issue) !== filter.kind) return false;
    if (filter.repair !== "all") {
      const repairable = repairForCode(issue.code) !== null;
      if (filter.repair === "repairable" && !repairable) return false;
      if (filter.repair === "report-only" && repairable) return false;
    }
    return true;
  });
}

/**
 * Repairs that address at least one shown issue. This is what an explicit
 * "select all" adds to the selection; it never removes a selected repair.
 */
export function doctorShownRepairs(
  issues: readonly ProjectIssue[],
  filter: DoctorIssueFilter,
): RepairKind[] {
  return availableRepairs(filterDoctorIssues(issues, filter));
}

export function isDefaultDoctorFilter(filter: DoctorIssueFilter): boolean {
  return (
    filter.severity === DEFAULT_DOCTOR_FILTER.severity &&
    filter.kind === DEFAULT_DOCTOR_FILTER.kind &&
    filter.repair === DEFAULT_DOCTOR_FILTER.repair
  );
}

export function countDoctorIssues(issues: readonly ProjectIssue[]): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (issue.severity === "error") errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}
