import { calculateQuantities, type QuantityFilters, type QuantitySummary } from "../model/quantity";
import { formatScale } from "../model/units";
import type { Project } from "../model/types";

export interface QuantityReport {
  projectName: string;
  documentName: string;
  documentSha256: string;
  generatedAt: string;
  hiddenExcluded: boolean;
  /** Human-readable description of where the report's scale comes from. */
  scaleSummary: string;
  summary: QuantitySummary;
}

export interface QuantityReportOptions {
  /** Fixed timestamp for tests; defaults to now. */
  generatedAt?: string;
  /** Defaults to every page and every visible item. */
  filters?: QuantityFilters;
}

/**
 * Builds the quantity report from current item data. The report is never
 * stored in the project file; CSV and PDF exports both consume this model.
 */
export function buildQuantityReport(
  project: Project,
  options: QuantityReportOptions = {},
): QuantityReport {
  const summary = calculateQuantities(project, {
    ...options.filters,
    page: options.filters?.page ?? "all",
    includeHidden: options.filters?.includeHidden ?? false,
  });
  return {
    projectName: project.name,
    documentName: project.document.name,
    documentSha256: project.document.sha256,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    hiddenExcluded: summary.hiddenExcluded > 0,
    scaleSummary: describeScale(project),
    summary,
  };
}

function describeScale(project: Project): string {
  const calibrated = Object.entries(project.pages)
    .map(([page, state]) => ({ page: Number(page), calibration: state.calibration }))
    .filter((entry) => entry.calibration)
    .sort((a, b) => a.page - b.page);
  if (!calibrated.length) return "No page calibration";
  const unique = new Set(
    calibrated.map((entry) => {
      const calibration = entry.calibration!;
      return calibration.source === "manual"
        ? `manual:${calibration.ratio}`
        : `reference:${calibration.pointsPerMeter}`;
    }),
  );
  if (unique.size > 1) {
    return `Per-page calibration (${calibrated.length} page${calibrated.length === 1 ? "" : "s"})`;
  }
  const calibration = calibrated[0].calibration;
  if (!calibration) return "No page calibration";
  const pages =
    calibrated.length === project.document.pageCount
      ? "All pages"
      : `Page${calibrated.length === 1 ? "" : "s"} ${calibrated
          .map((entry) => entry.page)
          .join(", ")}`;
  return `${pages} · ${formatScale(
    {
      pointsPerMeter: calibration.pointsPerMeter,
      sourceUnit: calibration.source === "manual" ? "m" : calibration.unit,
    },
    calibration,
  )}`;
}
