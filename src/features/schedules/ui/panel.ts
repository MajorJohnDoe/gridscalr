import { pageDisplayName, pageNumber } from "../../../model/pages";
import { spaceMeasurements } from "../../spaces";
import type { PageId, PageSize, ScheduleFilter, SummaryCardId } from "../../../model/types";
import { store } from "../../../state/store";
import { el, option } from "../../../ui/dom";
import { t, type MessageKey } from "../../../i18n";
import { cachedSchedule, findSchedule, scheduleDisplayEntries } from "../model";
import type { ScheduleResult, ScheduleRow } from "../model";
import { cachedSummary, type SummaryTable } from "../summary";
import { openScheduleBuilder } from "./builder";
import { openPlacementDialog } from "./placement";
import { summaryCardsElement } from "./panelCards";
import { panelTable } from "./panelTable";
import { openSummaryRolesDialog } from "./roles";
import {
  setSummaryFilter,
  setSummarySelectedScheduleId,
  summaryFiltersActive,
  summaryPanelFilters,
  summarySelectedScheduleId,
  syncSummaryProject,
  type SummaryPanelFilters,
} from "./state";

/**
 * The right-dock Takeoff tab. It renders the KPI cards, a takeoff table picker,
 * the filter chips and one live table. The built-in table previews visible
 * measurements by category; choosing a stored takeoff table shows its own
 * columns, grouping, sorting and totals. Nothing is stored by the panel.
 */

const ACTION_REASON_ID = "schedules-action-reason";

export interface SummaryPanelHost {
  navigateToItem?: (pageId: PageId, layerId: string, itemId: string) => void;
  goToPage?: (page: number) => void;
  openSpaces?: () => void;
  /** Page size for the default placement box; missing falls back to A3. */
  pageSize?: (page: number) => PageSize | undefined;
  /** Repaints the shell after a panel-level change. */
  refresh?: () => void;
  /** Exports the selected schedule as CSV. */
  exportScheduleCsv?: (scheduleId: string) => void;
  /** Opens the CSV import flow for the selected schedule. */
  importScheduleCsv?: (scheduleId: string) => void;
}

function extraFilter(): ScheduleFilter | undefined {
  const filters = summaryPanelFilters();
  const extra: ScheduleFilter = {};
  if (filters.pageId) extra.pageIds = [filters.pageId];
  if (filters.categoryId) extra.categoryIds = [filters.categoryId];
  if (filters.spaceId) extra.spaceIds = [filters.spaceId];
  return Object.keys(extra).length ? extra : undefined;
}

function builtInTable(table: SummaryTable): HTMLElement {
  const wrap = el("div", "schedules-table-wrap");
  const node = el("table", "schedules-table schedules-built-in");
  const caption = el("caption", "schedules-visually-hidden", t("schedules.builtInCaption"));
  const head = el("thead");
  const headRow = el("tr");
  for (const key of ["group", "count", "length", "area", "unit"] as const) {
    const th = el("th", key === "group" || key === "unit" ? "" : "is-numeric");
    th.scope = "col";
    th.textContent = t(`schedules.table.${key}` as MessageKey);
    headRow.append(th);
  }
  head.append(headRow);
  const body = el("tbody");
  for (const row of table.rows) {
    const tr = el("tr", "schedules-row");
    tr.append(
      el("td", "schedules-first-cell", row.label),
      el("td", "is-numeric", String(row.count)),
      el("td", "is-numeric", row.lengthText),
      el("td", "is-numeric", row.areaText),
      el("td", "", row.unit),
    );
    body.append(tr);
  }
  const foot = el("tfoot");
  const totalRow = el("tr", "schedules-total-row");
  const label = el("th", "schedules-total-label", t("schedules.table.total"));
  label.scope = "row";
  totalRow.append(
    label,
    el("td", "is-numeric", String(table.totals.count)),
    el("td", "is-numeric", table.totals.lengthText),
    el("td", "is-numeric", table.totals.areaText),
    el("td", "", table.totals.unit),
  );
  foot.append(totalRow);
  node.append(caption, head, body, foot);
  wrap.append(node);
  return wrap;
}

function pageOptions(): { id: PageId; label: string }[] {
  const project = store.project;
  if (!project) return [];
  return project.pages.map((page) => ({
    id: page.id,
    label:
      pageDisplayName(project, page.id) ||
      t("schedules.pageOnly", { page: pageNumber(project, page.id) }),
  }));
}

function filterChip(
  label: string,
  value: string,
  options: { value: string; label: string }[],
  onChange: (value: string) => void,
  focusKey: string,
): HTMLLabelElement {
  const field = el("label", "schedules-chip");
  field.append(el("span", "schedules-chip-label", label));
  const select = el("select", "select schedules-chip-select");
  select.setAttribute("aria-label", label);
  select.dataset.summaryFocus = focusKey;
  for (const entry of options) {
    select.append(option(entry.value, entry.label, entry.value === value));
  }
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  field.append(select);
  return field;
}

function reschedule(host: SummaryPanelHost): void {
  host.refresh?.();
}

function configure(id: SummaryCardId, host: SummaryPanelHost): void {
  if (id === "rooms" || id === "area") {
    host.openSpaces?.();
    return;
  }
  void openSummaryRolesDialog(id === "doors" ? "doors" : "walls").then(() => reschedule(host));
}

function explainDisabled(button: HTMLButtonElement, reason: string): void {
  button.disabled = true;
  button.title = reason;
  button.setAttribute("aria-describedby", ACTION_REASON_ID);
}

function previewNotice(host: SummaryPanelHost): HTMLElement {
  const block = el("div", "schedules-preview");
  const text = el("div", "schedules-preview-text");
  text.append(
    el("p", "schedules-preview-title", t("schedules.preview.title")),
    el("p", "schedules-preview-hint", t("schedules.preview.hint")),
  );
  const create = el("button", "btn btn-small btn-primary", t("schedules.preview.create"));
  create.type = "button";
  create.dataset.summaryFocus = "preview-create";
  if (store.readOnly) {
    explainDisabled(create, t("schedules.action.readOnly"));
  } else {
    create.title = t("schedules.preview.createHint");
    create.addEventListener("click", () => void openScheduleBuilder().then(() => reschedule(host)));
  }
  block.append(text, create);
  return block;
}

function navigateRow(
  row: ScheduleRow,
  source: ScheduleResult["source"],
  host: SummaryPanelHost,
): void {
  const project = store.project;
  if (!project) return;
  if (source === "measurements") {
    if (row.pageId && row.layerId) host.navigateToItem?.(row.pageId, row.layerId, row.entityId);
    return;
  }
  const link = (spaceMeasurements(project).get(row.entityId) ?? []).find((entry) => entry.visible);
  if (link) host.navigateToItem?.(link.pageId, link.layerId, link.itemId);
  else if (row.pageId) host.goToPage?.(pageNumber(project, row.pageId));
}

function emptyState(host: SummaryPanelHost): HTMLElement {
  const block = el("div", "schedules-empty");
  block.append(el("p", "schedules-empty-title", t("schedules.empty")));
  block.append(el("p", "schedules-empty-hint", t("schedules.emptyHint")));
  const create = el("button", "btn btn-small btn-primary", t("schedules.newSchedule"));
  create.type = "button";
  if (store.readOnly) {
    explainDisabled(create, t("schedules.action.readOnly"));
  } else {
    create.addEventListener("click", () => void openScheduleBuilder().then(() => reschedule(host)));
  }
  block.append(create);
  return block;
}

export function renderSummaryPanel(host: SummaryPanelHost, previousScroll = 0): HTMLElement {
  const project = store.project;
  if (!project) {
    const note = el("div", "empty-note", t("schedules.noProject"));
    return note;
  }
  syncSummaryProject(project.id);
  const extra = extraFilter();
  const summary = cachedSummary(store.revision, project, extra);
  const selectedId = summarySelectedScheduleId();
  const schedule = findSchedule(project, selectedId);
  if (selectedId && !schedule) setSummarySelectedScheduleId(null);
  const result = schedule ? cachedSchedule(store.revision, project, schedule, { extra }) : null;

  const root = el("div", "schedules-panel");
  root.append(summaryCardsElement(summary.cards, (id) => configure(id, host)));

  const hasSchedule = Boolean(schedule);
  const noScheduleReason = t("schedules.action.noSchedule");
  const readOnlyReason = t("schedules.action.readOnly");
  const reasons: string[] = [];
  if (!hasSchedule) reasons.push(noScheduleReason);
  if (store.readOnly) reasons.push(readOnlyReason);

  const head = el("div", "schedules-head");
  const picker = el("select", "select schedules-schedule-select");
  picker.setAttribute("aria-label", t("schedules.pickerAria"));
  picker.dataset.summaryFocus = "picker";
  picker.append(option("", t("schedules.builtInTable"), !selectedId));
  for (const entry of project.schedules) {
    picker.append(option(entry.id, entry.name, entry.id === selectedId));
  }
  picker.value = schedule?.id ?? "";
  picker.addEventListener("change", () => {
    setSummarySelectedScheduleId(picker.value || null);
    reschedule(host);
  });
  const add = el("button", "btn btn-small", t("schedules.newSchedule"));
  add.type = "button";
  add.dataset.summaryFocus = "new";
  if (store.readOnly) explainDisabled(add, readOnlyReason);
  add.addEventListener("click", () => void openScheduleBuilder().then(() => reschedule(host)));
  const edit = el("button", "btn btn-small btn-ghost", t("schedules.editSchedule"));
  edit.type = "button";
  edit.dataset.summaryFocus = "edit";
  if (!hasSchedule || store.readOnly) {
    explainDisabled(edit, hasSchedule ? readOnlyReason : noScheduleReason);
  }
  edit.addEventListener("click", () => {
    if (schedule) void openScheduleBuilder(schedule.id).then(() => reschedule(host));
  });
  const place = el("button", "btn btn-small btn-ghost", t("schedules.placement.action"));
  place.type = "button";
  place.dataset.summaryFocus = "place";
  place.title = t("schedules.placement.actionHint");
  if (!hasSchedule || store.readOnly) {
    explainDisabled(place, hasSchedule ? readOnlyReason : noScheduleReason);
  }
  place.addEventListener("click", () => {
    if (schedule) void openPlacementDialog(schedule.id, host).then(() => reschedule(host));
  });
  const roles = el("button", "btn btn-small btn-ghost", t("schedules.manageRoles"));
  roles.type = "button";
  roles.dataset.summaryFocus = "roles";
  if (store.readOnly) explainDisabled(roles, readOnlyReason);
  roles.addEventListener(
    "click",
    () => void openSummaryRolesDialog("walls").then(() => reschedule(host)),
  );
  const exportCsv = el("button", "btn btn-small btn-ghost", t("schedulesCsv.export"));
  exportCsv.type = "button";
  exportCsv.dataset.summaryFocus = "export";
  exportCsv.title = t("schedulesCsv.exportHint");
  if (!hasSchedule) explainDisabled(exportCsv, noScheduleReason);
  else if (!host.exportScheduleCsv) exportCsv.disabled = true;
  exportCsv.addEventListener("click", () => {
    if (schedule) host.exportScheduleCsv?.(schedule.id);
  });
  const importCsv = el("button", "btn btn-small btn-ghost", t("schedulesCsv.import"));
  importCsv.type = "button";
  importCsv.dataset.summaryFocus = "import";
  const importReason = !hasSchedule
    ? noScheduleReason
    : store.readOnly
      ? readOnlyReason
      : schedule && schedule.rowMode !== "items"
        ? t("schedulesCsv.importReadOnly")
        : !host.importScheduleCsv
          ? t("schedulesCsv.importHint")
          : null;
  importCsv.title = importReason ?? t("schedulesCsv.importHint");
  if (importReason) explainDisabled(importCsv, importReason);
  importCsv.addEventListener("click", () => {
    if (schedule) host.importScheduleCsv?.(schedule.id);
  });
  head.append(picker, add, edit, place, roles, exportCsv, importCsv);
  root.append(head);
  if (reasons.length) {
    const reason = el("p", "schedules-action-reason", reasons.join(" "));
    reason.id = ACTION_REASON_ID;
    root.append(reason);
  }

  const filters = summaryPanelFilters();
  const chips = el("div", "schedules-chips");
  chips.append(
    filterChip(
      t("schedules.filter.page"),
      filters.pageId ?? "",
      [
        { value: "", label: t("schedules.filter.allPages") },
        ...pageOptions().map((page) => ({ value: page.id, label: page.label })),
      ],
      (value) => setChip("pageId", value, host),
      "filter-page",
    ),
    filterChip(
      t("schedules.filter.category"),
      filters.categoryId ?? "",
      [
        { value: "", label: t("schedules.filter.allCategories") },
        ...project.categories.map((category) => ({ value: category.id, label: category.name })),
      ],
      (value) => setChip("categoryId", value, host),
      "filter-category",
    ),
    filterChip(
      t("schedules.filter.space"),
      filters.spaceId ?? "",
      [
        { value: "", label: t("schedules.filter.allSpaces") },
        ...project.spaces.map((space) => ({
          value: space.id,
          label: space.number ? `${space.number} ${space.name}` : space.name,
        })),
      ],
      (value) => setChip("spaceId", value, host),
      "filter-space",
    ),
  );
  root.append(chips);

  const rowCount = result ? result.rowCount : summary.table.rows.length;
  if (!rowCount) {
    root.append(emptyState(host));
  } else if (result) {
    const caption = schedule ? schedule.name : t("schedules.builtInCaption");
    root.append(
      panelTable({
        columns: result.columns,
        entries: scheduleDisplayEntries(result),
        totals: result.totals,
        caption,
        previousScroll,
        onNavigate: (row) => navigateRow(row, result.source, host),
      }),
    );
  } else {
    root.append(previewNotice(host));
    root.append(builtInTable(summary.table));
  }

  const foot = el("div", "schedules-foot");
  foot.append(
    el(
      "span",
      "schedules-foot-count",
      t("schedules.footer", { count: result ? result.rowCount : summary.table.rows.length }),
    ),
  );
  if (summaryFiltersActive()) {
    const clear = el("button", "btn btn-small btn-ghost", t("schedules.filter.clear"));
    clear.type = "button";
    clear.dataset.summaryFocus = "clear-filters";
    clear.addEventListener("click", () => {
      setSummaryFilter("pageId", null);
      setSummaryFilter("categoryId", null);
      setSummaryFilter("spaceId", null);
      reschedule(host);
    });
    foot.append(clear);
  }
  foot.append(el("span", "schedules-foot-hint", t("schedules.hiddenExcluded")));
  if (result && result.problems.some((problem) => problem.code !== "missingName")) {
    foot.append(el("span", "schedules-foot-warning", t("schedules.invalidWarning")));
  }
  if (result?.totals.some((total) => total.mixedUnits)) {
    foot.append(el("span", "schedules-foot-warning", t("schedules.mixedUnits")));
  }
  root.append(foot);
  return root;
}

function setChip(key: keyof SummaryPanelFilters, value: string, host: SummaryPanelHost): void {
  setSummaryFilter(key, value || null);
  reschedule(host);
}
