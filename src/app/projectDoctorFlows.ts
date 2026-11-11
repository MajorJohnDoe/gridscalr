import {
  projectDoctorDialog,
  runLoadReport,
  runProjectDoctor,
  validateProject,
  type LoadReportOutcome,
  type ProjectIssue,
} from "../features/projectIntegrity";
import { outsideReferenceIssues } from "../features/sourceStorage";
import { t } from "../i18n";
import type { ProjectLoadReport } from "../io/projectFile";
import { saveTextFile } from "../io/platform";
import type { Project } from "../model/types";
import { store } from "../state/store";
import { toast } from "../ui/toast";

export interface ProjectDoctorFlowHost {
  saveRepairedCopy: (project: Project) => Promise<boolean>;
}

async function exportDoctorDiagnostics(text: string): Promise<void> {
  const path = await saveTextFile(text, "gridscalr-project-diagnostics.txt", [
    { name: t("projectIntegrity.diagnosticsFilter"), extensions: ["txt"] },
  ]);
  if (path) toast(t("projectIntegrity.diagnosticsSaved", { path }), "success");
}

function doctorOptions(host: ProjectDoctorFlowHost) {
  return { saveRepairedCopy: host.saveRepairedCopy, exportDiagnostics: exportDoctorDiagnostics };
}

/** Opens the doctor for the current project from the File menu. */
export async function openProjectDoctorFlow(
  host: ProjectDoctorFlowHost,
  issues?: readonly ProjectIssue[],
): Promise<void> {
  const project = store.project;
  if (!project) return;
  const base = issues ?? validateProject(project);
  await runProjectDoctor(
    {
      project,
      host: doctorOptions(host),
      issues: [...base, ...outsideReferenceIssues(project, store.projectPath)],
    },
    { dialog: projectDoctorDialog },
  );
}

/** Shows the load report and doctor before a damaged project is opened. */
export function confirmProjectLoadReportFlow(
  host: ProjectDoctorFlowHost,
  report: ProjectLoadReport,
  project: Project,
): Promise<LoadReportOutcome> {
  return runLoadReport(
    { project, report, host: doctorOptions(host) },
    { dialog: projectDoctorDialog },
  );
}
