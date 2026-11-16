import { t, type MessageKey } from "../../../i18n";
import { formatNumber } from "../../../i18n/format";
import { formatBytes } from "../../../io/platform";
import { MAX_SCHEDULE_CSV_BYTES } from "../../../io/limits";
import { el } from "../../../ui/dom";
import { MAX_SCHEDULE_CSV_ROWS } from "../csv";
import type { ScheduleCsvImportPlan, ScheduleCsvIssue, ScheduleCsvRow } from "../csv";

/**
 * Dry-run report for the CSV import dialog. Every value is written with
 * `textContent`; a cell is data, never markup. The changed preview is capped so
 * a 20 000-row file cannot build an enormous table in the modal.
 */

const PREVIEW_LIMIT = 100;

const REASON_KEYS: Record<string, MessageKey> = {
  notANumber: "schedulesCsv.reason.notANumber",
  belowMin: "schedulesCsv.reason.belowMin",
  aboveMax: "schedulesCsv.reason.aboveMax",
  tooLong: "schedulesCsv.reason.tooLong",
  notADate: "schedulesCsv.reason.notADate",
  unknownOption: "schedulesCsv.reason.unknownOption",
  notBoolean: "schedulesCsv.reason.notBoolean",
  required: "schedulesCsv.reason.required",
  invalidValue: "schedulesCsv.reason.invalidValue",
};

function reasonText(reason: string | undefined): string {
  return t(REASON_KEYS[reason ?? "invalidValue"] ?? "schedulesCsv.reason.invalidValue");
}

function columnRef(label: string | undefined, field: string | undefined): string {
  const name = label || field || "";
  if (!field || field === name) return name;
  return `${name} [${field}]`;
}

function section(title: string, items: readonly string[]): HTMLElement | null {
  if (!items.length) return null;
  const block = el("section", "schedules-csv-section");
  block.append(el("h3", "", title));
  const list = el("ul", "schedules-csv-list");
  for (const item of items) list.append(el("li", "", item));
  block.append(list);
  return block;
}

function rowIssues(plan: ScheduleCsvImportPlan, code: ScheduleCsvIssue["code"]): ScheduleCsvRow[] {
  return plan.rejected.filter((row) => row.issues.some((issue) => issue.code === code));
}

function rowIdText(row: ScheduleCsvRow): string {
  return t("schedulesCsv.issue.rowId", { row: row.row, id: row.id });
}
function rowIssuesSection(
  plan: ScheduleCsvImportPlan,
  code: ScheduleCsvIssue["code"],
  title: string,
  format: (row: ScheduleCsvRow, issue: ScheduleCsvIssue) => string,
): HTMLElement | null {
  const lines: string[] = [];
  for (const row of rowIssues(plan, code)) {
    const issue = row.issues.find((entry) => entry.code === code);
    if (issue) lines.push(format(row, issue));
  }
  return section(title, lines);
}

function invalidSection(plan: ScheduleCsvImportPlan): HTMLElement | null {
  const rows = rowIssues(plan, "invalidValue");
  const lines: string[] = [];
  for (const row of rows) {
    for (const issue of row.issues.filter((entry) => entry.code === "invalidValue")) {
      lines.push(
        t("schedulesCsv.issue.invalid", {
          row: row.row,
          field: columnRef(issue.label, issue.field),
          value: issue.value ?? "",
          reason: reasonText(issue.reason),
        }),
      );
    }
  }
  return section(t("schedulesCsv.rejectedInvalid"), lines);
}

export function blockedMessage(plan: ScheduleCsvImportPlan): string {
  switch (plan.blocked) {
    case "tooLarge":
      return t("schedulesCsv.blocked.tooLarge", {
        size: formatBytes(MAX_SCHEDULE_CSV_BYTES),
        actual: formatBytes(plan.sizeBytes),
      });
    case "tooManyRows":
      return t("schedulesCsv.blocked.tooManyRows", {
        rows: formatNumber(plan.totalRows, 0),
        max: formatNumber(MAX_SCHEDULE_CSV_ROWS, 0),
      });
    case "notUtf8":
      return t("schedulesCsv.blocked.notUtf8");
    case "empty":
      return t("schedulesCsv.blocked.empty");
    case "missingHeader":
      return t("schedulesCsv.blocked.missingHeader");
    case "groupedSchedule":
      return t("schedulesCsv.blocked.groupedSchedule");
    case "missingSchedule":
      return t("schedulesCsv.blocked.missingSchedule");
    case null:
      return "";
    default:
      return "";
  }
}

function summary(plan: ScheduleCsvImportPlan): HTMLElement {
  const block = el("div", "schedules-csv-summary");
  block.append(
    el(
      "p",
      "settings-note",
      t("schedulesCsv.summary", {
        rows: formatNumber(plan.totalRows, 0),
        changed: formatNumber(plan.changed.length, 0),
        unchanged: formatNumber(plan.unchanged.length, 0),
        rejected: formatNumber(plan.rejected.length, 0),
      }),
    ),
  );
  block.append(el("p", "empty-note small", t("schedulesCsv.updatesOnly")));
  if (!plan.changed.length)
    block.append(el("p", "empty-note small", t("schedulesCsv.nothingToApply")));
  if (plan.missingRowCount) {
    block.append(
      el(
        "p",
        "empty-note small",
        t("schedulesCsv.missingRows", { count: formatNumber(plan.missingRowCount, 0) }),
      ),
    );
  }
  return block;
}

function fileIssues(plan: ScheduleCsvImportPlan): HTMLElement | null {
  const unknown = plan.issues
    .filter((issue) => issue.code === "unknownField")
    .map((issue) => columnRef(issue.label, issue.field));
  const duplicates = plan.issues
    .filter((issue) => issue.code === "duplicateHeader")
    .map((issue) => columnRef(issue.label, issue.field));
  const readOnly = plan.readOnlyColumns.map((column) => columnRef(column.label, column.field));
  const sections = [
    section(t("schedulesCsv.unknownFields"), unknown),
    section(t("schedulesCsv.duplicateHeaders"), duplicates),
    section(t("schedulesCsv.readOnlyColumns"), readOnly),
  ].filter((entry): entry is HTMLElement => Boolean(entry));
  if (!sections.length) return null;
  const block = el("div", "schedules-csv-sections");
  block.append(...sections);
  return block;
}

function changedPreview(plan: ScheduleCsvImportPlan): HTMLElement | null {
  const updates = plan.changed.flatMap((row) => row.updates.map((update) => ({ row, update })));
  if (!updates.length) return null;
  const shown = updates.slice(0, PREVIEW_LIMIT);
  const block = el("section", "schedules-csv-section");
  block.append(el("h3", "", t("schedulesCsv.preview")));
  const wrap = el("div", "schedules-csv-table-wrap");
  const table = el("table", "schedules-csv-table");
  table.append(el("caption", "schedules-visually-hidden", t("schedulesCsv.previewCaption")));
  const head = el("thead");
  const headRow = el("tr");
  for (const key of ["row", "id", "field", "before", "after"] as const) {
    const th = el("th", "", t(`schedulesCsv.column.${key}` as MessageKey));
    th.scope = "col";
    headRow.append(th);
  }
  head.append(headRow);
  const body = el("tbody");
  for (const entry of shown) {
    const tr = el("tr");
    tr.append(
      el("td", "is-numeric", String(entry.row.row)),
      el("td", "", entry.row.id),
      el("td", "", entry.update.label),
      el("td", "", entry.update.before),
      el("td", "", entry.update.after),
    );
    body.append(tr);
  }
  table.append(head, body);
  wrap.append(table);
  block.append(wrap);
  if (updates.length > shown.length) {
    block.append(
      el(
        "p",
        "empty-note small",
        t("schedulesCsv.previewLimited", {
          shown: formatNumber(shown.length, 0),
          total: formatNumber(updates.length, 0),
        }),
      ),
    );
  }
  return block;
}

function rejectedSections(plan: ScheduleCsvImportPlan): HTMLElement | null {
  const sections = [
    rowIssuesSection(plan, "unknownId", t("schedulesCsv.rejectedUnknownIds"), rowIdText),
    rowIssuesSection(plan, "duplicateId", t("schedulesCsv.rejectedDuplicateIds"), rowIdText),
    rowIssuesSection(plan, "wrongType", t("schedulesCsv.rejectedWrongType"), (row, issue) =>
      t("schedulesCsv.issue.rowType", {
        row: row.row,
        type: issue.value || row.type,
      }),
    ),
    invalidSection(plan),
    rowIssuesSection(plan, "missingId", t("schedulesCsv.rejectedMalformed"), (row) =>
      t("schedulesCsv.issue.rowMissingId", { row: row.row }),
    ),
    rowIssuesSection(plan, "missingType", t("schedulesCsv.rejectedMalformed"), (row) =>
      t("schedulesCsv.issue.rowMissingType", { row: row.row }),
    ),
    rowIssuesSection(plan, "extraCells", t("schedulesCsv.rejectedMalformed"), (row) =>
      t("schedulesCsv.issue.rowExtraCells", { row: row.row }),
    ),
  ].filter((entry): entry is HTMLElement => Boolean(entry));
  if (!sections.length) return null;
  const block = el("div", "schedules-csv-sections");
  block.append(...sections);
  return block;
}

export function csvImportReport(plan: ScheduleCsvImportPlan): HTMLElement {
  const root = el("div", "schedules-csv-report");
  root.append(summary(plan));
  const file = fileIssues(plan);
  if (file) root.append(file);
  const preview = changedPreview(plan);
  if (preview) root.append(preview);
  const rejected = rejectedSections(plan);
  if (rejected) root.append(rejected);
  return root;
}
