import { validateProject, type ProjectIssue } from "../../model/integrity";
import type { Project } from "../../model/types";
import type { LoadReportCount } from "../../io/projectFile/report";
import { applyRepair, availableRepairs, type RepairKind } from "./repair";
import type { ProjectDoctorDialogResult } from "./ui";

export interface DoctorLoadReport {
  warnings: readonly string[];
  dropped: readonly LoadReportCount[];
  repaired: readonly LoadReportCount[];
}

export interface ProjectDoctorHost {
  saveRepairedCopy: (project: Project) => Promise<boolean>;
  exportDiagnostics: (text: string) => Promise<void>;
}

export interface ProjectDoctorOptions {
  project: Project;
  host: ProjectDoctorHost;
  issues?: readonly ProjectIssue[];
  canOpenReadOnly?: boolean;
  loadReport?: DoctorLoadReport;
  /** Keep the "Open" action; only meaningful for a load report. */
  canOpen?: boolean;
}

export type ProjectDoctorAction = "close" | "saved" | "open" | "read-only";

export interface ProjectDoctorOutcome {
  action: ProjectDoctorAction;
  /** The current in-memory project, including any applied repairs. */
  project: Project;
}

export interface ProjectDoctorDialogState {
  project: Project;
  issues: readonly ProjectIssue[];
  repairs: readonly RepairKind[];
  canOpen: boolean;
  canOpenReadOnly: boolean;
  loadReport?: DoctorLoadReport;
  notice?: { repair: RepairKind; changed: number };
}

export interface ProjectDoctorDialogHost {
  dialog: (state: ProjectDoctorDialogState) => Promise<ProjectDoctorDialogResult>;
}

/** Runs the explicit repair loop. Nothing is written until the user saves a copy. */
export async function runProjectDoctor(
  options: ProjectDoctorOptions,
  dialogHost: ProjectDoctorDialogHost,
): Promise<ProjectDoctorOutcome> {
  let project = options.project;
  let issues = [...(options.issues ?? validateProject(project))];
  let notice: { repair: RepairKind; changed: number } | undefined;
  for (;;) {
    const action = await dialogHost.dialog({
      project,
      issues,
      repairs: availableRepairs(issues),
      canOpen: options.canOpen ?? false,
      canOpenReadOnly: options.canOpenReadOnly ?? false,
      loadReport: options.loadReport,
      notice,
    });
    if (action.kind === "repair") {
      const result = applyRepair(project, action.repair);
      project = result.project;
      issues = validateProject(project);
      notice = { repair: action.repair, changed: result.changed };
      continue;
    }
    if (action.kind === "export") {
      await options.host.exportDiagnostics(
        buildDoctorDiagnostics(project, issues, options.loadReport),
      );
      continue;
    }
    if (action.kind === "save") {
      const saved = await options.host.saveRepairedCopy(project);
      if (saved) return { action: "saved", project };
      continue;
    }
    if (action.kind === "open") return { action: "open", project };
    if (action.kind === "open-read-only") return { action: "read-only", project };
    return { action: "close", project };
  }
}

export type LoadReportDecision = "open" | "read-only" | "cancel";

export interface LoadReportOutcome {
  decision: LoadReportDecision;
  /** The loaded project or the explicitly repaired in-memory version. */
  project?: Project;
}

function hasLoadReportContent(report: DoctorLoadReport): boolean {
  return (
    report.warnings.length > 0 ||
    report.dropped.some((entry) => entry.count > 0) ||
    report.repaired.some((entry) => entry.count > 0)
  );
}

/**
 * Shows the load report and the doctor for a damaged project. A clean project
 * opens directly. Choosing a repair changes only the in-memory project that
 * the caller opens; a copy is written only through Save repaired copy.
 */
export async function runLoadReport(
  options: {
    project: Project;
    report: DoctorLoadReport & { issues: readonly ProjectIssue[] };
    host: ProjectDoctorHost;
  },
  dialogHost: ProjectDoctorDialogHost,
): Promise<LoadReportOutcome> {
  const errors = options.report.issues.filter((entry) => entry.severity === "error");
  if (!hasLoadReportContent(options.report) && !errors.length) {
    return { decision: "open" };
  }
  const outcome = await runProjectDoctor(
    {
      project: options.project,
      host: options.host,
      issues: options.report.issues,
      canOpenReadOnly: true,
      canOpen: true,
      loadReport: options.report,
    },
    dialogHost,
  );
  if (outcome.action === "open") return { decision: "open", project: outcome.project };
  if (outcome.action === "read-only") {
    return { decision: "read-only", project: outcome.project };
  }
  return { decision: "cancel" };
}

function countBySeverity(issues: readonly ProjectIssue[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (issue.severity === "error") errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}

/**
 * Diagnostics for the doctor. It contains issue codes, entity kinds and counts
 * only: no drawing names, labels, project metadata or file paths.
 */
export function buildDoctorDiagnostics(
  project: Project,
  issues: readonly ProjectIssue[],
  loadReport?: DoctorLoadReport,
): string {
  const counts = countBySeverity(issues);
  let items = 0;
  for (const layer of project.layers) items += layer.items.length;
  const lines = [
    "GridScalr project doctor",
    `Schema: ${project.schemaVersion}`,
    `Project shape: ${project.documents.length} documents, ${project.pages.length} pages, ` +
      `${project.layers.length} layers, ${items} items, ` +
      `${Object.keys(project.assets).length} assets, ${project.categories.length} categories, ` +
      `${project.countTypes.length} count types, ${project.lineTypes.length} line types`,
    `Issues: ${counts.errors} error(s), ${counts.warnings} warning(s)`,
  ];
  for (const issue of issues) {
    const entity = issue.entity
      ? ` · ${issue.entity.kind}${issue.entity.id ? `:${issue.entity.id}` : ""}`
      : "";
    lines.push(`- [${issue.severity}] ${issue.code}${entity}`);
  }
  if (loadReport) {
    lines.push(`Load warnings: ${loadReport.warnings.length}`);
    for (const entry of loadReport.dropped) lines.push(`- dropped ${entry.code}: ${entry.count}`);
    for (const entry of loadReport.repaired) lines.push(`- repaired ${entry.code}: ${entry.count}`);
  }
  return `${lines.join("\n")}\n`;
}
