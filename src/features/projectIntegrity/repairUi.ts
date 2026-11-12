import { t } from "../../i18n";
import { validateProject, type ProjectIssue } from "../../model/integrity";
import { sanitizePaths } from "../../model/pathText";
import type { Project } from "../../model/types";
import { el, option } from "../../ui/dom";
import { entityLabel, issueMessage, issueReasonText, repairLabel } from "./issueText";
import {
  DEFAULT_DOCTOR_FILTER,
  countDoctorIssues,
  doctorFilterKinds,
  doctorShownRepairs,
  filterDoctorIssues,
  isDefaultDoctorFilter,
  type DoctorIssueFilter,
} from "./repairFilter";
import {
  REPAIR_ORDER,
  planRepair,
  type RepairChange,
  type RepairKind,
  type RepairRun,
} from "./repairPlan";

type MessageKey = Parameters<typeof t>[0];

/** What the repair section asks the doctor loop to do next. */
export interface DoctorRepairRequest {
  kind: "repair";
  repairs: RepairKind[];
  filter: DoctorIssueFilter;
}

export interface DoctorRepairSectionOptions {
  project: Project;
  issues: readonly ProjectIssue[];
  repairs: readonly RepairKind[];
  filter?: DoctorIssueFilter;
  request: (request: DoctorRepairRequest) => void;
}

const SEVERITY_KEYS: Record<DoctorIssueFilter["severity"], MessageKey> = {
  all: "projectIntegrity.repair.filter.all",
  error: "projectIntegrity.severity.error",
  warning: "projectIntegrity.severity.warning",
};

const AVAILABILITY_KEYS: Record<DoctorIssueFilter["repair"], MessageKey> = {
  all: "projectIntegrity.repair.filter.all",
  repairable: "projectIntegrity.repair.filter.repairable",
  "report-only": "projectIntegrity.repair.filter.reportOnly",
};

const MAX_PREVIEW_ROWS = 20;

function selectedKinds(selected: ReadonlySet<RepairKind>): RepairKind[] {
  return REPAIR_ORDER.filter((kind) => selected.has(kind));
}

function changeText(change: RepairChange): string {
  const scope = entityLabel(change.scope);
  const id = sanitizePaths(change.id);
  if (change.action === "rename") {
    return t("projectIntegrity.repair.change.rename", {
      scope,
      from: id,
      to: sanitizePaths(change.to ?? ""),
    });
  }
  return t(`projectIntegrity.repair.change.${change.action}` as MessageKey, { scope, id });
}

function addSelect(
  row: HTMLElement,
  labelKey: MessageKey,
  entries: readonly { value: string; label: string }[],
  value: string,
  filter: string,
  onChange: (next: string) => void,
): void {
  const label = el("label", "doctor-filter");
  label.append(el("span", "doctor-filter-label", t(labelKey)));
  const select = el("select", "doctor-filter-select");
  for (const entry of entries) {
    select.append(option(entry.value, entry.label, entry.value === value));
  }
  select.value = value;
  select.dataset.filter = filter;
  select.addEventListener("change", () => onChange(select.value));
  label.append(select);
  row.append(label);
}

/**
 * Filters, repair selection and a preview generated from the same plan the
 * doctor applies. Nothing here mutates the project or writes a file: applying a
 * repair returns a request to the doctor loop, which owns the repaired copy.
 */
export function addRepairSection(body: HTMLElement, options: DoctorRepairSectionOptions): void {
  if (!options.repairs.length) return;
  const state = {
    filter: options.filter ?? DEFAULT_DOCTOR_FILTER,
    selected: new Set<RepairKind>(options.repairs),
    run: planRepair(options.project, options.repairs),
  };
  // A per-kind count is what that repair would change on its own, independent
  // of the filters and of the other checkboxes.
  const standalone = new Map(
    options.repairs.map((kind) => [kind, planRepair(options.project, [kind]).plan.changes.length]),
  );

  body.append(el("h3", "settings-subtitle", t("projectIntegrity.repair.title")));
  body.append(el("p", "settings-note", t("projectIntegrity.repair.intro")));

  const filters = el("div", "doctor-filters");
  addSelect(
    filters,
    "projectIntegrity.repair.filter.severity",
    (["all", "error", "warning"] as const).map((value) => ({
      value,
      label: t(SEVERITY_KEYS[value]),
    })),
    state.filter.severity,
    "severity",
    (value) => {
      state.filter = { ...state.filter, severity: value as DoctorIssueFilter["severity"] };
      renderList();
    },
  );
  const kinds = doctorFilterKinds(options.issues);
  addSelect(
    filters,
    "projectIntegrity.repair.filter.kind",
    [
      { value: "all", label: t("projectIntegrity.repair.filter.all") },
      ...kinds.map((kind) => ({ value: kind, label: entityLabel(kind) })),
    ],
    state.filter.kind,
    "kind",
    (value) => {
      state.filter = {
        ...state.filter,
        kind: value as DoctorIssueFilter["kind"],
      };
      renderList();
    },
  );
  addSelect(
    filters,
    "projectIntegrity.repair.filter.repair",
    (["all", "repairable", "report-only"] as const).map((value) => ({
      value,
      label: t(AVAILABILITY_KEYS[value]),
    })),
    state.filter.repair,
    "repair",
    (value) => {
      state.filter = { ...state.filter, repair: value as DoctorIssueFilter["repair"] };
      renderList();
    },
  );
  body.append(filters);

  const shown = el("p", "settings-note");
  const issueList = el("div", "doctor-issue-list");
  body.append(shown, issueList);

  const repairList = el("div", "doctor-repair-list");
  const inputs = new Map<RepairKind, HTMLInputElement>();
  for (const repair of options.repairs) {
    const row = el("label", "doctor-repair-row");
    const box = el("input");
    box.type = "checkbox";
    box.checked = true;
    box.dataset.repairKind = repair;
    const count = standalone.get(repair) ?? 0;
    const text = el(
      "span",
      "doctor-repair-label",
      t("projectIntegrity.repair.withCount", {
        repair: repairLabel(repair),
        count,
      }),
    );
    if (!count) text.classList.add("is-muted");
    box.addEventListener("change", () => {
      if (box.checked) state.selected.add(repair);
      else state.selected.delete(repair);
      recalculate();
    });
    inputs.set(repair, box);
    row.append(box, text);
    repairList.append(row);
  }
  body.append(repairList);

  const selectAll = el("button", "btn btn-small", t("projectIntegrity.repair.selectAll"));
  selectAll.type = "button";
  selectAll.dataset.action = "select-all-repairs";
  selectAll.addEventListener("click", () => {
    for (const repair of doctorShownRepairs(options.issues, state.filter)) {
      state.selected.add(repair);
      const box = inputs.get(repair);
      if (box) box.checked = true;
    }
    recalculate();
  });
  body.append(selectAll);

  const selectionNote = el("p", "settings-note");
  body.append(selectionNote);

  const preview = el("div", "doctor-preview");
  body.append(preview);

  const apply = el("button", "btn btn-small btn-primary", t("projectIntegrity.repair.apply"));
  apply.type = "button";
  apply.dataset.action = "apply-repairs";
  apply.addEventListener("click", () => {
    const repairs = selectedKinds(state.selected);
    if (!repairs.length) return;
    options.request({ kind: "repair", repairs, filter: state.filter });
  });
  body.append(apply);

  function renderList(): void {
    const visible = filterDoctorIssues(options.issues, state.filter);
    shown.textContent = t("projectIntegrity.repair.filter.shown", {
      shown: visible.length,
      total: options.issues.length,
    });
    issueList.replaceChildren();
    if (!visible.length) {
      issueList.append(el("p", "settings-note", t("projectIntegrity.repair.filter.none")));
    }
    for (const issue of visible) {
      const row = el("p", "settings-note", issueMessage(issue));
      row.dataset.issueCode = issue.code;
      issueList.append(row);
    }
    const shownRepairs = doctorShownRepairs(options.issues, state.filter);
    selectionNote.textContent = isDefaultDoctorFilter(state.filter)
      ? t("projectIntegrity.repair.selectAllNote", { count: visible.length })
      : t("projectIntegrity.repair.selectAllFiltered", {
          count: shownRepairs.length,
          issues: visible.length,
        });
  }

  function recalculate(): void {
    state.run = planRepair(options.project, selectedKinds(state.selected));
    renderPreview();
    apply.disabled = state.selected.size === 0 || state.run.plan.changes.length === 0;
  }

  function renderPreview(): void {
    const run: RepairRun = state.run;
    const before = countDoctorIssues(options.issues);
    const after = countDoctorIssues(validateProject(run.project));
    preview.replaceChildren();
    preview.append(el("h4", "settings-subtitle", t("projectIntegrity.repair.previewTitle")));
    preview.append(
      el(
        "p",
        "settings-note",
        t("projectIntegrity.repair.beforeAfter", {
          beforeErrors: before.errors,
          beforeWarnings: before.warnings,
          afterErrors: after.errors,
          afterWarnings: after.warnings,
        }),
      ),
    );
    if (!run.plan.changes.length) {
      preview.append(el("p", "settings-note", t("projectIntegrity.repair.previewEmpty")));
      return;
    }
    const rows = el("div", "doctor-change-list");
    for (const change of run.plan.changes.slice(0, MAX_PREVIEW_ROWS)) {
      const row = el("div", "doctor-change-row");
      row.append(
        el("span", "doctor-change-label", changeText(change)),
        el("span", "doctor-change-reason", issueReasonText(change.reason)),
      );
      rows.append(row);
    }
    preview.append(rows);
    const hidden = run.plan.changes.length - MAX_PREVIEW_ROWS;
    if (hidden > 0) {
      preview.append(
        el("p", "settings-note", t("projectIntegrity.repair.previewMore", { count: hidden })),
      );
    }
  }

  renderList();
  recalculate();
}
