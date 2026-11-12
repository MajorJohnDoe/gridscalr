import { t } from "../../i18n";
import type { ProjectIssue } from "../../model/integrity";
import type { Project } from "../../model/types";
import { confirmDialog, showModal } from "../../ui/dialogs";
import { el } from "../../ui/dom";
import type { DoctorLoadReport } from "./doctor";
import type { RepairKind } from "./repair";
import type { DoctorSourceCleanupResult } from "./sourceAvailability";
import type { DoctorSourceSnapshot } from "./sourceModel";
import { addDoctorSources, type DoctorSourceRequest } from "./sourceUi";

type MessageKey = Parameters<typeof t>[0];

export type ProjectDoctorDialogResult =
  | { kind: "close" | "save" | "export" | "open" | "open-read-only" }
  | { kind: "repair"; repair: RepairKind }
  | DoctorSourceRequest;

export interface ProjectDoctorDialogOptions {
  project: Project;
  issues: readonly ProjectIssue[];
  repairs: readonly RepairKind[];
  canOpen: boolean;
  canOpenReadOnly: boolean;
  loadReport?: DoctorLoadReport;
  notice?: { repair: RepairKind; changed: number };
  sources?: DoctorSourceSnapshot;
  sourceNotice?: DoctorSourceCleanupResult;
  canChangeSources?: boolean;
  canRelinkSources?: boolean;
  canCopySources?: boolean;
}

const ENTITY_KEYS: Record<string, MessageKey> = {
  project: "projectIntegrity.entity.project",
  document: "projectIntegrity.entity.document",
  page: "projectIntegrity.entity.page",
  layer: "projectIntegrity.entity.layer",
  item: "projectIntegrity.entity.item",
  asset: "projectIntegrity.entity.asset",
  category: "projectIntegrity.entity.category",
  countType: "projectIntegrity.entity.countType",
  lineType: "projectIntegrity.entity.lineType",
  countPreset: "projectIntegrity.entity.countPreset",
  markupsView: "projectIntegrity.entity.markupsView",
  settings: "projectIntegrity.entity.settings",
};

const REPAIR_KEYS: Record<RepairKind, MessageKey> = {
  duplicateIds: "projectIntegrity.repair.duplicateIds",
  danglingReferences: "projectIntegrity.repair.danglingReferences",
  staleOcr: "projectIntegrity.repair.staleOcr",
};

function issueMessage(issue: ProjectIssue): string {
  const message = t(`projectIntegrity.issue.${issue.code}` as MessageKey);
  if (!issue.entity) return message;
  const kind = ENTITY_KEYS[issue.entity.kind]
    ? t(ENTITY_KEYS[issue.entity.kind])
    : issue.entity.kind;
  const id = issue.entity.id ? `:${issue.entity.id}` : "";
  return t("projectIntegrity.issue.entity", { message, kind, id });
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
  const request = (next: DoctorSourceRequest): void => {
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
      t("projectIntegrity.doctor.repaired", {
        count: options.notice.changed,
        repair: t(REPAIR_KEYS[options.notice.repair]),
      }),
    );
  }
  if (!options.issues.length) {
    addLine(body, t("projectIntegrity.doctor.clean"));
  }
  addIssueGroup(body, t("projectIntegrity.severity.error"), errors);
  addIssueGroup(body, t("projectIntegrity.severity.warning"), warnings);
  if (options.repairs.length) {
    body.append(el("h3", "settings-subtitle", t("projectIntegrity.repair.title")));
    for (const repair of options.repairs) {
      const button = el("button", "btn btn-small", t(REPAIR_KEYS[repair]));
      button.type = "button";
      button.dataset.repair = repair;
      body.append(button);
    }
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
    onMount: (modal, close) => {
      closeDialog = close;
      for (const button of modal.querySelectorAll<HTMLButtonElement>("[data-repair]")) {
        button.addEventListener("click", () => {
          const repair = button.dataset.repair as RepairKind;
          pending = { kind: "repair", repair };
          close();
        });
      }
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
