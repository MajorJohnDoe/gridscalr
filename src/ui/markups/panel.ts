import { countTypeLabel } from "../../features/countTypes/model";
import {
  ALL_SYMBOL_CATEGORIES,
  symbolCategoryLabel,
} from "../../features/schematics/symbols/registry";
import { t } from "../../i18n";
import {
  MARKUPS_GROUP_PRESETS,
  defaultMarkupsViewSettings,
  groupMarkupRows,
  markupsColumnLabel,
  markupsGroupPresetFor,
  markupsGroupPresetLabel,
} from "../../model/markups";
import type { MarkupGroup } from "../../model/markups";
import type { MarkupsColumnId, SymbolCategory } from "../../model/types";
import { store } from "../../state/store";
import { confirmDialog } from "../dialogs";
import { clear, el, option } from "../dom";
import { icon } from "../icons";
import type { PanelActions } from "../panels";
import { showPopover } from "../popover";
import type { ShellRefs } from "../shell";
import {
  COLUMN_WIDTHS,
  DEFAULT_HEIGHT,
  clampHeight,
  markupsState,
  savePreferences,
  setMarkupsOpen,
} from "./state";
import { filteredRows, groupValue, markupRowElement, type MarkupRow } from "./rows";
import {
  applyView,
  markViewDirty,
  openColumnsDialog,
  openManageViews,
  saveCurrentView,
  saveViewAs,
  syncProject,
  updateViewControls,
} from "./views";

export function bindResizer(refs: ShellRefs): void {
  if (markupsState.resizerBound) return;
  markupsState.resizerBound = true;
  refs.markupsResizer.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = markupsState.height;
    const onMove = (move: PointerEvent) => {
      markupsState.height = clampHeight(startHeight + startY - move.clientY);
      refs.markupsPanel.style.setProperty("--markups-h", `${markupsState.height}px`);
    };
    const onUp = () => {
      savePreferences();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  });
  refs.markupsResizer.addEventListener("dblclick", () => {
    markupsState.height = DEFAULT_HEIGHT;
    refs.markupsPanel.style.setProperty("--markups-h", `${markupsState.height}px`);
    savePreferences();
  });
}

export function renderMarkupsPanel(refs: ShellRefs, actions: PanelActions): void {
  const project = store.project;
  if (!project) {
    markupsState.currentProjectId = null;
    markupsState.activeViewId = null;
    markupsState.settings = defaultMarkupsViewSettings();
    markupsState.viewDirty = false;
    markupsState.collapsedGroups.clear();
  } else {
    syncProject(project);
  }

  const visible = markupsState.open && Boolean(project);
  refs.markupsPanel.hidden = !visible;
  refs.markupsResizer.hidden = !visible;
  if (!visible || !project) return;

  bindResizer(refs);
  const panel = refs.markupsPanel;
  panel.style.setProperty("--markups-h", `${markupsState.height}px`);
  const previousScroll = panel.querySelector<HTMLElement>(".markups-table-wrap")?.scrollTop ?? 0;
  clear(panel);
  markupsState.viewDirtyEl = null;
  markupsState.saveViewBtn = null;

  const head = el("div", "markups-head");
  const title = el("div", "markups-title");
  title.append(el("span", "markups-title-text", t("shell.markups")));
  const count = el("span", "markups-count", "0");
  title.append(count);
  const headActions = el("div", "markups-head-actions");

  const viewSelect = el("select", "select markups-view-select");
  viewSelect.setAttribute("aria-label", t("markups.view"));
  viewSelect.title = t("markups.applyView");
  viewSelect.append(option("", t("markups.allMarkups"), !markupsState.activeViewId));
  for (const view of project.markupsViews) {
    viewSelect.append(option(view.id, view.name, view.id === markupsState.activeViewId));
  }
  viewSelect.value = markupsState.activeViewId ?? "";
  viewSelect.addEventListener("change", () => {
    const nextId = viewSelect.value || null;
    const proceed = async () => {
      if (
        markupsState.viewDirty &&
        markupsState.activeViewId &&
        nextId !== markupsState.activeViewId
      ) {
        const discard = await confirmDialog(
          t("markups.discardViewTitle"),
          t("markups.discardViewNote"),
          t("markups.discardChanges"),
          { danger: true },
        );
        if (!discard) {
          viewSelect.value = markupsState.activeViewId;
          return;
        }
      }
      applyView(nextId, actions);
    };
    void proceed();
  });

  markupsState.viewDirtyEl = el("span", "markups-view-dirty", "•");
  markupsState.viewDirtyEl.title = t("markups.unsavedView");
  markupsState.viewDirtyEl.hidden = true;

  markupsState.saveViewBtn = el("button", "icon-btn markups-save-view");
  markupsState.saveViewBtn.type = "button";
  markupsState.saveViewBtn.innerHTML = icon("check", 14);
  markupsState.saveViewBtn.setAttribute("aria-label", t("markups.saveView"));
  markupsState.saveViewBtn.addEventListener("click", () => saveCurrentView(actions));

  const more = el("button", "icon-btn");
  more.type = "button";
  more.title = t("markups.moreOptions");
  more.setAttribute("aria-label", t("markups.moreOptions"));
  more.innerHTML = icon("markupsState.settings", 14);
  more.addEventListener("click", () =>
    showPopover(more, [
      {
        label: t("markups.saveAsNew"),
        icon: "plus",
        action: () => void saveViewAs(actions),
      },
      {
        label: t("markups.manageViews"),
        icon: "markupsState.settings",
        action: () => openManageViews(project, actions),
      },
    ]),
  );

  const columns = el("button", "btn btn-small btn-ghost", t("markups.columns"));
  columns.type = "button";
  columns.title = t("markups.columnsToggle");
  columns.innerHTML = `${icon("grid", 13)}<span>${t("markups.columns")}</span>`;
  columns.addEventListener("click", () => openColumnsDialog(actions));

  const exportCsv = el("button", "btn btn-small btn-ghost", t("markups.exportCsv"));
  exportCsv.type = "button";
  exportCsv.innerHTML = `${icon("csv", 13)}<span>${t("markups.exportCsv")}</span>`;
  exportCsv.title = t("markups.exportCsvTitle");
  exportCsv.addEventListener("click", () => actions.exportAs("csv"));

  const close = el("button", "icon-btn");
  close.type = "button";
  close.title = t("markups.closeList");
  close.setAttribute("aria-label", t("markups.closeList"));
  close.innerHTML = icon("close", 15);
  close.addEventListener("click", () => {
    setMarkupsOpen(false);
    actions.refresh();
  });

  headActions.append(
    viewSelect,
    markupsState.viewDirtyEl,
    markupsState.saveViewBtn,
    more,
    columns,
    exportCsv,
    close,
  );
  head.append(title, headActions);

  const toolbar = el("div", "markups-toolbar");
  const pageSelect = el("select", "select markups-page-filter");
  pageSelect.setAttribute("aria-label", t("markups.filterPage"));
  pageSelect.append(
    option("all", t("markups.allPages"), markupsState.settings.pageFilter === "all"),
    option(
      "current",
      t("markups.currentPage", { page: store.ui.page }),
      markupsState.settings.pageFilter === "current",
    ),
  );
  pageSelect.value = markupsState.settings.pageFilter;
  pageSelect.addEventListener("change", () => {
    markupsState.settings.pageFilter = pageSelect.value === "current" ? "current" : "all";
    markupsState.collapsedGroups.clear();
    markViewDirty();
    refreshTable();
  });

  const typeSelect = el("select", "select markups-type-filter");
  typeSelect.setAttribute("aria-label", t("markups.filterType"));
  typeSelect.append(
    option("all", t("markups.allTypes"), markupsState.settings.typeFilter === "all"),
    option("measure", t("context.measurements"), markupsState.settings.typeFilter === "measure"),
    option("draw", t("context.drawings"), markupsState.settings.typeFilter === "draw"),
    option("symbol", t("symbols.title"), markupsState.settings.typeFilter === "symbol"),
    option("count", t("markups.typeCounts"), markupsState.settings.typeFilter === "count"),
  );
  typeSelect.value = markupsState.settings.typeFilter;
  typeSelect.addEventListener("change", () => {
    markupsState.settings.typeFilter =
      typeSelect.value === "measure" ||
      typeSelect.value === "draw" ||
      typeSelect.value === "symbol" ||
      typeSelect.value === "count"
        ? (typeSelect.value as "measure" | "draw" | "symbol" | "count")
        : "all";
    markupsState.collapsedGroups.clear();
    markViewDirty();
    refreshTable();
  });

  const categorySelect = el("select", "select markups-category-filter");
  categorySelect.setAttribute("aria-label", t("markups.filterCategory"));
  const categoryValue = markupsState.settings.symbolCategory
    ? `symbol:${markupsState.settings.symbolCategory}`
    : (markupsState.settings.categoryId ?? "");
  categorySelect.append(option("", t("markups.allCategories"), !categoryValue));
  const measurementGroup = document.createElement("optgroup");
  measurementGroup.label = t("markups.measurementCategories");
  for (const category of project.categories) {
    measurementGroup.append(
      option(category.id, category.name, category.id === markupsState.settings.categoryId),
    );
  }
  if (measurementGroup.childElementCount) categorySelect.append(measurementGroup);
  const symbolGroup = document.createElement("optgroup");
  symbolGroup.label = t("markups.symbolCategories");
  for (const category of ALL_SYMBOL_CATEGORIES) {
    symbolGroup.append(
      option(
        `symbol:${category}`,
        symbolCategoryLabel(category),
        category === markupsState.settings.symbolCategory,
      ),
    );
  }
  categorySelect.append(symbolGroup);
  categorySelect.value = categoryValue;
  categorySelect.addEventListener("change", () => {
    if (categorySelect.value.startsWith("symbol:")) {
      markupsState.settings.symbolCategory = categorySelect.value.slice(
        "symbol:".length,
      ) as SymbolCategory;
      markupsState.settings.categoryId = null;
      markupsState.settings.typeFilter = "symbol";
    } else {
      markupsState.settings.symbolCategory = null;
      markupsState.settings.categoryId = categorySelect.value || null;
      if (markupsState.settings.categoryId && markupsState.settings.typeFilter === "symbol")
        markupsState.settings.typeFilter = "measure";
    }
    typeSelect.value = markupsState.settings.typeFilter;
    markupsState.collapsedGroups.clear();
    markViewDirty();
    refreshTable();
  });

  const countTypeSelect = el("select", "select markups-count-type-filter");
  countTypeSelect.setAttribute("aria-label", t("markups.filterCountType"));
  countTypeSelect.append(option("", t("markups.allCountTypes"), !markupsState.settings.countType));
  for (const type of project.countTypes) {
    countTypeSelect.append(
      option(
        type.id,
        countTypeLabel(project, type.id),
        type.id === markupsState.settings.countType,
      ),
    );
  }
  countTypeSelect.value = markupsState.settings.countType ?? "";
  countTypeSelect.addEventListener("change", () => {
    markupsState.settings.countType = countTypeSelect.value || null;
    if (markupsState.settings.countType) {
      markupsState.settings.typeFilter = "count";
      typeSelect.value = "count";
    }
    markupsState.collapsedGroups.clear();
    markViewDirty();
    refreshTable();
  });

  const groupSelect = el("select", "select markups-group-select");
  groupSelect.setAttribute("aria-label", t("markups.group"));
  const groupPreset = markupsGroupPresetFor(markupsState.settings.groupBy);
  for (const preset of MARKUPS_GROUP_PRESETS) {
    groupSelect.append(
      option(preset.id, markupsGroupPresetLabel(preset), preset.id === groupPreset?.id),
    );
  }
  if (!groupPreset && markupsState.settings.groupBy.length) {
    groupSelect.append(option("custom", t("markups.customGrouping"), true));
  }
  groupSelect.value = groupPreset?.id ?? (markupsState.settings.groupBy.length ? "custom" : "none");
  groupSelect.addEventListener("change", () => {
    const preset = MARKUPS_GROUP_PRESETS.find((entry) => entry.id === groupSelect.value);
    if (!preset) return;
    markupsState.settings.groupBy = [...preset.fields];
    if (preset.id === "count-type") {
      markupsState.settings.typeFilter = "count";
      typeSelect.value = "count";
    }
    markupsState.collapsedGroups.clear();
    markViewDirty();
    refreshTable();
  });

  const search = el("input", "input markups-search");
  search.type = "search";
  search.placeholder = t("markups.searchPlaceholder");
  search.value = markupsState.settings.search;
  search.setAttribute("aria-label", t("markups.search"));
  search.addEventListener("input", () => {
    markupsState.settings.search = search.value;
    markViewDirty();
    refreshTable();
  });

  const selectAll = el("button", "btn btn-small btn-ghost", t("markups.selectAll"));
  selectAll.type = "button";
  selectAll.title = t("markups.selectAllTitle");
  selectAll.addEventListener("click", () => {
    store.setSelectionMany(rows.map((row) => ({ layerId: row.layer.id, itemId: row.item.id })));
  });

  toolbar.append(
    pageSelect,
    typeSelect,
    categorySelect,
    countTypeSelect,
    groupSelect,
    search,
    selectAll,
  );
  panel.append(head, toolbar);

  const wrap = el("div", "markups-table-wrap");
  const table = el("table", "markups-table");
  wrap.append(table);
  panel.append(wrap);

  const foot = el("div", "markups-foot");
  const footLeft = el("span", "markups-foot-count", "");
  const footRight = el("span", "markups-foot-hint", t("markups.hint"));
  foot.append(footLeft, footRight);
  panel.append(foot);

  let rows: MarkupRow[] = [];

  function refreshTable(): void {
    clear(table);
    const columns = markupsState.settings.columns;
    const colgroup = el("colgroup");
    for (const column of columns) {
      const col = el("col");
      col.style.width = `${COLUMN_WIDTHS[column]}%`;
      colgroup.append(col);
    }
    const thead = el("thead");
    const headerRow = el("tr");
    for (const column of columns) {
      const th = el("th");
      th.scope = "col";
      th.dataset.column = column;
      const sorted =
        markupsState.settings.sort?.column === column ? markupsState.settings.sort.direction : null;
      th.setAttribute(
        "aria-sort",
        sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none",
      );
      const button = el("button", "markups-sort-button");
      button.type = "button";
      button.title = t("markups.sortBy", { name: markupsColumnLabel(column) });
      button.append(el("span", "", markupsColumnLabel(column)));
      if (sorted) {
        button.append(el("span", "markups-sort-arrow", sorted === "asc" ? "↑" : "↓"));
      }
      button.addEventListener("click", () => {
        if (markupsState.settings.sort?.column !== column) {
          markupsState.settings.sort = { column, direction: "asc" };
        } else if (markupsState.settings.sort.direction === "asc") {
          markupsState.settings.sort = { column, direction: "desc" };
        } else {
          markupsState.settings.sort = null;
        }
        markViewDirty();
        refreshTable();
      });
      th.append(button);
      headerRow.append(th);
    }
    thead.append(headerRow);

    const tbody = el("tbody");
    const currentProject = project!;
    rows = filteredRows(currentProject);
    if (!rows.length) {
      const emptyRow = el("tr", "markups-empty");
      const cell = el("td");
      cell.colSpan = columns.length;
      cell.innerHTML = `${icon("markups", 22)}<div>${t("markups.noMatches")}</div>`;
      emptyRow.append(cell);
      tbody.append(emptyRow);
    } else if (markupsState.settings.groupBy.length) {
      const groups = groupMarkupRows(rows, markupsState.settings.groupBy, (row, field) =>
        groupValue(row, field, currentProject),
      );
      for (const group of groups) {
        appendGroup(group, 0, tbody, columns, actions, refreshTable);
      }
    } else {
      for (const row of rows) tbody.append(markupRowElement(row, columns, actions, refreshTable));
    }
    table.append(colgroup, thead, tbody);
    count.textContent = String(rows.length);
    footLeft.textContent = t("markups.footer", {
      count: rows.length,
      selected: store.ui.selection.length,
    });
    updateViewControls();
  }

  refreshTable();
  wrap.scrollTop = previousScroll;
}

export function appendGroup(
  group: MarkupGroup<MarkupRow>,
  level: number,
  tbody: HTMLElement,
  columns: MarkupsColumnId[],
  actions: PanelActions,
  refreshRows: () => void,
): void {
  const collapsed = markupsState.collapsedGroups.has(group.key);
  const row = el("tr", "markups-group-row");
  const cell = el("td");
  cell.colSpan = columns.length;
  cell.style.paddingLeft = `${8 + level * 16}px`;
  const toggle = el("button", "markups-group-toggle");
  toggle.type = "button";
  toggle.title = collapsed ? t("markups.expandGroup") : t("markups.collapseGroup");
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.innerHTML = icon(collapsed ? "chevronRight" : "chevronDown", 12);
  toggle.addEventListener("click", () => {
    if (markupsState.collapsedGroups.has(group.key)) markupsState.collapsedGroups.delete(group.key);
    else markupsState.collapsedGroups.add(group.key);
    refreshRows();
  });
  cell.append(
    toggle,
    el("span", "markups-group-label", group.value),
    el("span", "markups-group-count", String(group.count)),
  );
  row.append(cell);
  tbody.append(row);
  if (collapsed) return;
  if (group.children.length) {
    for (const child of group.children) {
      appendGroup(child, level + 1, tbody, columns, actions, refreshRows);
    }
    return;
  }
  for (const entry of group.rows) {
    tbody.append(markupRowElement(entry, columns, actions, refreshRows));
  }
}
