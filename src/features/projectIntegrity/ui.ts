import { t } from "../../i18n";
import type { ProjectIssue } from "../../model/integrity";
import type { Project } from "../../model/types";
import { confirmDialog, showModal } from "../../ui/dialogs";
import { el } from "../../ui/dom";
import type { DoctorLoadReport } from "./doctor";
import { issueMessage, repairLabel } from "./issueText";
import type { DoctorIssueFilter } from "./repairFilter";
import type { RepairKind } from "./repairPlan";
import { addRepairSection, type DoctorRepairRequest } from "./repairUi";
import type { DoctorSourceCleanupResult } from "./sourceAvailability";
import type { DoctorSourceSnapshot } from "./sourceModel";
import { addDoctorSources, type DoctorSourceRequest } from "./sourceUi";

type MessageKey = Parameters<typeof t>[0];

export type ProjectDoctorDialogResult =
  | { kind: "close" | "save" | "export" | "open" | "open-read-only" }
  | DoctorRepairRequest
  | DoctorSourceRequest;

export interface ProjectDoctorDialogOptions {
  project: Project;
  issues: readonly ProjectIssue[];
  repairs: readonly RepairKind[];
  canOpen: boolean;
  canOpenReadOnly: boolean;
  loadReport?: DoctorLoadReport;
  notice?: { repairs: readonly RepairKind[]; changed: number };
  filter?: DoctorIssueFilter;
  sources?: DoctorSourceSnapshot;
  sourceNotice?: DoctorSourceCleanupResult;
  canChangeSources?: boolean;
  canRelinkSources?: boolean;
  canCopySources?: boolean;
}

function totalItems(project: Project): number {
  return project.layers.reduce((total, layer) => total + layer.items.length, 0);
}

function addLine(body: HTMLElement, text: string, className = "settings-note"): void {
  body.append(el("p", className, text));
}

function addIssueGroup(body: HTMLElement, title: string, issues: readonly ProjectIssue[]): void {
  if (!issues.length) return;
  body.append(el("h3", "settings-subtitle", title));
  for (const issue of issues) {
    body.append(el("p", "settings-note", issueMessage(issue)));
  }
}

function addLoadReport(body: HTMLElement, report: DoctorLoadReport): void {
  if (!report.warnings.length && !report.dropped.length && !report.repaired.length) return;
  body.append(el("h3", "settings-subtitle", t("projectIntegrity.load.title")));
  for (const key of report.warnings) {
    addLine(body, t(key as MessageKey));
  }
  for (const entry of report.dropped) {
    addLine(body, t("projectIntegrity.load.dropped", { count: entry.count, code: entry.code }));
  }
  for (const entry of report.repaired) {
    addLine(body, t("projectIntegrity.load.repaired", { count: entry.count, code: entry.code }));
  }
}

/** One doctor view. The controller reopens it after every explicit repair. */
export async function projectDoctorDialog(
  options: ProjectDoctorDialogOptions,
): Promise<ProjectDoctorDialogResult> {
  const errors = options.issues.filter((entry) => entry.severity === "error");
  const warnings = options.issues.filter((entry) => entry.severity === "warning");
  let pending: ProjectDoctorDialogResult | null = null;
  let closeDialog: () => void = () => undefined;
  const request = (next: DoctorRepairRequest | DoctorSourceRequest): void => {
    pending = next;
    closeDialog();
  };
  const body = el("div", "form-stack");
  body.append(
    el(
      "p",
      "modal-message",
      t("projectIntegrity.doctor.summary", {
        errors: errors.length,
        warnings: warnings.length,
        pages: options.project.pages.length,
        items: totalItems(options.project),
      }),
    ),
  );
  if (options.loadReport) addLoadReport(body, options.loadReport);
  if (options.notice) {
    addLine(
      body,
      t("projectIntegrity.repair.applied", {
        count: options.notice.changed,
        repairs: options.notice.repairs.map(repairLabel).join(", "),
      }),
    );
  }
  if (!options.issues.length) {
    addLine(body, t("projectIntegrity.doctor.clean"));
  }
  if (options.repairs.length) {
    addRepairSection(body, {
      project: options.project,
      issues: options.issues,
      repairs: options.repairs,
      filter: options.filter,
      request,
    });
  } else {
    addIssueGroup(body, t("projectIntegrity.severity.error"), errors);
    addIssueGroup(body, t("projectIntegrity.severity.warning"), warnings);
  }
  addDoctorSources(body, {
    snapshot: options.sources,
    notice: options.sourceNotice,
    canChange: options.canChangeSources ?? false,
    canRelink: options.canRelinkSources ?? false,
    canCopy: options.canCopySources ?? false,
    request,
  });

  const actions = [
    { label: t("common.cancel"), value: "cancel" },
    { label: t("projectIntegrity.doctor.exportDiagnostics"), value: "export" },
    { label: t("projectIntegrity.doctor.saveRepaired"), value: "save" },
    ...(options.canOpen
      ? [
          {
            label: t("projectIntegrity.doctor.open"),
            value: "open",
            danger: errors.length > 0,
          },
        ]
      : []),
    ...(options.canOpenReadOnly
      ? [
          {
            label: t("projectIntegrity.doctor.openReadOnly"),
            value: "open-read-only",
            primary: true,
          },
        ]
      : []),
  ];
  if (!options.canOpenReadOnly) {
    const save = actions.find((action) => action.value === "save") as {
      primary?: boolean;
    };
    save.primary = true;
  }

  const value = await showModal({
    title: t("projectIntegrity.doctor.title"),
    subtitle: options.project.name,
    body,
    wide: true,
    actions,
    onMount: (_modal, close) => {
      closeDialog = close;
    },
  });
  if (pending) return pending;
  if (value === "save" || value === "export" || value === "open" || value === "open-read-only") {
    return { kind: value };
  }
  return { kind: "close" };
}

/** Shows the warning issues that a normal save is allowed to accept. */
export async function confirmProjectValidationWarnings(
  issues: readonly ProjectIssue[],
): Promise<boolean> {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    if (issue.severity !== "warning") continue;
    counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
  }
  const lines = [...counts.entries()].map(([code, count]) =>
    t("projectIntegrity.issue.count", {
      count,
      message: t(`projectIntegrity.issue.${code}` as MessageKey),
    }),
  );
  return confirmDialog(
    t("projectIntegrity.saveWarnings.title"),
    [t("projectIntegrity.saveWarnings.intro"), ...lines].join("\n\n"),
    t("common.save"),
  );
}
