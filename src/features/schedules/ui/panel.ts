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
 * The right-dock Summary tab. It renders the KPI cards, a schedule picker, the
 * filter chips and one live table. The built-in table summarizes visible
 * measurements by category; choosing a stored schedule shows its own columns,
 * grouping, sorting and totals. Nothing is stored by the panel.
 */

export interface SummaryPanelHost {
  navigateToItem?: (pageId: PageId, layerId: string, itemId: string) => void;
  goToPage?: (page: number) => void;
  openSpaces?: () => void;
  /** Page size for the default placement box; missing falls back to A3. */
  pageSize?: (page: number) => PageSize | undefined;
  /** Repaints the shell after a panel-level change. */
  refresh?: () => void;
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
): HTMLLabelElement {
  const field = el("label", "schedules-chip");
  field.append(el("span", "schedules-chip-label", label));
  const select = el("select", "select schedules-chip-select");
  select.setAttribute("aria-label", label);
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
  create.disabled = store.readOnly;
  create.addEventListener("click", () => void openScheduleBuilder().then(() => reschedule(host)));
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

  const head = el("div", "schedules-head");
  const picker = el("select", "select schedules-schedule-select");
  picker.setAttribute("aria-label", t("schedules.pickerAria"));
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
  add.disabled = store.readOnly;
  add.addEventListener("click", () => void openScheduleBuilder().then(() => reschedule(host)));
  const edit = el("button", "btn btn-small btn-ghost", t("schedules.editSchedule"));
  edit.type = "button";
  edit.disabled = !schedule || store.readOnly;
  edit.addEventListener("click", () => {
    if (schedule) void openScheduleBuilder(schedule.id).then(() => reschedule(host));
  });
  const place = el("button", "btn btn-small btn-ghost", t("schedules.placement.action"));
  place.type = "button";
  place.disabled = !schedule || store.readOnly;
  place.title = t("schedules.placement.actionHint");
  place.addEventListener("click", () => {
    if (schedule) void openPlacementDialog(schedule.id, host).then(() => reschedule(host));
  });
  const roles = el("button", "btn btn-small btn-ghost", t("schedules.manageRoles"));
  roles.type = "button";
  roles.disabled = store.readOnly;
  roles.addEventListener(
    "click",
    () => void openSummaryRolesDialog("walls").then(() => reschedule(host)),
  );
  head.append(picker, add, edit, place, roles);
  root.append(head);

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
    ),
    filterChip(
      t("schedules.filter.category"),
      filters.categoryId ?? "",
      [
        { value: "", label: t("schedules.filter.allCategories") },
        ...project.categories.map((category) => ({ value: category.id, label: category.name })),
      ],
      (value) => setChip("categoryId", value, host),
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
