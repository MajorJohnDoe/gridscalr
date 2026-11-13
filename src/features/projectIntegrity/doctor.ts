import { validateProject, type ProjectIssue } from "../../model/integrity";
import { sanitizePaths } from "../../model/pathText";
import type { Project } from "../../model/types";
import type { LoadReportCount } from "../../io/projectFile/report";
import { countDoctorIssues, type DoctorIssueFilter } from "./repairFilter";
import { planRepair, plannedRepairs, type RepairKind } from "./repairPlan";
import type { DoctorSourceCleanupResult, DoctorSourceHost } from "./sourceAvailability";
import type { DoctorSourceSnapshot } from "./sourceModel";
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
  /** Source availability and the explicit managed-copy cleanup. */
  sources?: DoctorSourceHost;
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
  notice?: { repairs: readonly RepairKind[]; changed: number };
  /** The issue filter is kept across an in-dialog repair so the list does not reset. */
  filter?: DoctorIssueFilter;
  sources?: DoctorSourceSnapshot;
  sourceNotice?: DoctorSourceCleanupResult;
  canChangeSources: boolean;
  canRelinkSources: boolean;
  canCopySources: boolean;
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
  let notice: { repairs: readonly RepairKind[]; changed: number } | undefined;
  let filter: DoctorIssueFilter | undefined;
  let sourceNotice: DoctorSourceCleanupResult | undefined;
  let sources = options.sources ? await options.sources.load(project) : undefined;
  // A repaired in-memory copy is not the open project, so source actions that
  // mutate the open project would silently diverge from what is on screen.
  let repairedCopy = false;
  for (;;) {
    const canChangeSources = Boolean(options.sources?.canChange) && !repairedCopy;
    // Offered repairs come from the planner, so a repairable code whose repair
    // would change nothing is not presented as available (F-085).
    const offered = plannedRepairs(project, issues);
    const action = await dialogHost.dialog({
      project,
      issues,
      repairs: offered.map((entry) => entry.kind),
      canOpen: options.canOpen ?? false,
      canOpenReadOnly: options.canOpenReadOnly ?? false,
      loadReport: options.loadReport,
      notice,
      filter,
      sources,
      sourceNotice,
      canChangeSources,
      canRelinkSources: canChangeSources && Boolean(options.sources?.relink),
      canCopySources: canChangeSources && Boolean(options.sources?.copyIntoProject),
    });
    if (action.kind === "repair") {
      const kinds = offered
        .map((entry) => entry.kind)
        .filter((kind) => action.repairs.includes(kind));
      if (!kinds.length) continue;
      const run = planRepair(project, kinds);
      project = run.project;
      issues = validateProject(project);
      notice = { repairs: run.plan.kinds, changed: run.plan.changes.length };
      filter = action.filter;
      repairedCopy = true;
      continue;
    }
    if (action.kind === "cleanup-sources") {
      if (!options.sources || !canChangeSources) continue;
      const confirmed = await options.sources.confirmCleanup(action.files);
      if (confirmed) {
        sourceNotice = await options.sources.delete(project, action.files);
      }
      sources = await options.sources.load(project);
      continue;
    }
    if (action.kind === "source-action") {
      if (!options.sources || !canChangeSources) continue;
      if (action.action === "relink") await options.sources.relink?.(action.documentId);
      else await options.sources.copyIntoProject?.(action.documentId);
      sources = await options.sources.load(project);
      continue;
    }
    if (action.kind === "export") {
      await options.host.exportDiagnostics(
        buildDoctorDiagnostics(project, issues, options.loadReport, sources),
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
    sources?: DoctorSourceHost;
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
      sources: options.sources,
    },
    dialogHost,
  );
  if (outcome.action === "open") return { decision: "open", project: outcome.project };
  if (outcome.action === "read-only") {
    return { decision: "read-only", project: outcome.project };
  }
  return { decision: "cancel" };
}

/**
 * Diagnostics for the doctor. It contains issue codes, entity kinds and counts
 * only: no drawing names, labels, project metadata or file paths.
 */
export function buildDoctorDiagnostics(
  project: Project,
  issues: readonly ProjectIssue[],
  loadReport?: DoctorLoadReport,
  sources?: DoctorSourceSnapshot,
): string {
  const counts = countDoctorIssues(issues);
  let items = 0;
  for (const layer of project.layers) items += layer.items.length;
  const lines = [
    `GridScalr project doctor`,
    `schema: ${project.schemaVersion}`,
    `shape: ${project.documents.length} documents, ${project.pages.length} pages, ` +
      `${project.layers.length} layers, ${items} items, ` +
      `${Object.keys(project.assets).length} assets, ${project.categories.length} categories, ` +
      `${project.countTypes.length} count types, ${project.lineTypes.length} line types`,
    `issues: ${counts.errors} error(s), ${counts.warnings} warning(s)`,
  ];
  if (sources) {
    lines.push(
      sources.checked
        ? `sources: ${sources.missing} missing, ${sources.changed} changed, ` +
            `${sources.managed.length} managed, ${sources.orphans.length} unused`
        : `sources: not checked`,
    );
  }
  for (const issue of issues) {
    const entity = issue.entity
      ? ` · ${issue.entity.kind}${issue.entity.id ? `:${issue.entity.id}` : ""}`
      : "";
    lines.push(`- [${issue.severity}] ${issue.code}${entity}`);
  }
  if (loadReport) {
    lines.push(`load warnings: ${loadReport.warnings.length}`);
    for (const entry of loadReport.dropped) {
      lines.push(`- dropped ${entry.code}: ${entry.count}`);
    }
    for (const entry of loadReport.repaired) {
      lines.push(`- repaired ${entry.code}: ${entry.count}`);
    }
  }
  return `${sanitizePaths(lines.join("\n"))}\n`;
}
