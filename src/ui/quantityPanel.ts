import {
  calculateQuantities,
  type QuantitySummary,
  type QuantityType,
  type QuantityTypeTotal,
} from "../model/quantity";
import { formatNumber } from "../model/units";
import { store } from "../state/store";
import { clear, el, option } from "./dom";
import { icon } from "./icons";
import { t } from "../i18n";

let pageFilter: "current" | "all" = "current";
let categoryFilter = "";
let roomFilter = "";
let includeHidden = false;
let layerFilter: Set<string> | null = null;
let layersOpen = false;

let projectIdentity = "";
let cachedRevision = -1;
let cachedKey = "";
let cachedSummary: QuantitySummary | null = null;

function resetFilters(): void {
  pageFilter = "current";
  categoryFilter = "";
  roomFilter = "";
  includeHidden = false;
  layerFilter = null;
  layersOpen = false;
  cachedRevision = -1;
  cachedKey = "";
  cachedSummary = null;
}

function formatValue(value: number, type: QuantityType): string {
  return formatNumber(value, type === "count" ? 0 : type === "angle" || type === "slope" ? 1 : 2);
}

function formatTotal(total: QuantityTypeTotal): string {
  return `${formatValue(total.net, total.type)} ${total.unit}`;
}

function itemCount(count: number): string {
  return t("quantity.itemsSummary", { count });
}

function typeLabel(type: QuantityType): string {
  if (type === "length") return t("quantity.type.length");
  if (type === "area") return t("quantity.type.area");
  if (type === "angle") return t("quantity.type.angle");
  if (type === "slope") return t("quantity.type.slope");
  if (type === "volume") return t("quantity.type.volume");
  return t("quantity.type.count");
}

function filtersKey(projectId: string): string {
  return JSON.stringify({
    projectId,
    page: pageFilter,
    currentPage: store.ui.page,
    category: categoryFilter,
    room: roomFilter,
    hidden: includeHidden,
    layers: layerFilter ? [...layerFilter].sort() : null,
  });
}

function currentSummary(): QuantitySummary | null {
  const project = store.project;
  if (!project) return null;
  const key = filtersKey(project.id);
  if (cachedSummary && cachedRevision === store.revision && cachedKey === key) {
    return cachedSummary;
  }
  cachedSummary = calculateQuantities(project, {
    page: pageFilter === "current" ? store.ui.page : "all",
    layerIds: layerFilter ? [...layerFilter] : null,
    categoryId: categoryFilter || null,
    room: roomFilter,
    includeHidden,
  });
  cachedRevision = store.revision;
  cachedKey = key;
  return cachedSummary;
}

function totalsChips(totals: QuantityTypeTotal[], label: string): HTMLElement {
  const wrap = el("div", "quantity-chips");
  wrap.append(el("span", "quantity-chips-label", label));
  for (const total of totals) {
    const chip = el("span", "quantity-chip", formatTotal(total));
    chip.title = `${typeLabel(total.type)} · gross ${formatValue(total.gross, total.type)} ${total.unit} · deduction ${formatValue(total.deduction, total.type)} ${total.unit} · net ${formatValue(total.net, total.type)} ${total.unit} · waste ${formatValue(total.wasteQuantity, total.type)} ${total.unit} · order ${formatValue(total.orderQuantity, total.type)} ${total.unit}`;
    if (total.clamped) {
      chip.classList.add("is-clamped");
      chip.title += t("quantity.clampedTitle");
    }
    wrap.append(chip);
  }
  return wrap;
}

function renderRows(summary: QuantitySummary): HTMLElement {
  const list = el("div", "quantity-list");
  if (!summary.rows.length) {
    const empty = el("div", "empty-note quantity-empty");
    empty.setAttribute("role", "status");
    empty.innerHTML = `${icon("quantities", 24)}<div>${t("quantity.empty")}</div>`;
    list.append(empty);
    return list;
  }

  for (const category of summary.categories) {
    const section = el("section", "quantity-category");
    const head = el("div", "quantity-category-head");
    const title = el("div", "quantity-section-title");
    const items = category.rooms.reduce(
      (sum, room) => sum + room.rows.reduce((roomSum, row) => roomSum + row.items, 0),
      0,
    );
    title.append(
      el("span", "quantity-section-name", category.categoryName),
      el("span", "quantity-section-count", itemCount(items)),
    );
    head.append(title, totalsChips(category.totals, t("quantity.net")));
    section.append(head);

    for (const room of category.rooms) {
      const roomEl = el("div", "quantity-room");
      const roomHead = el("div", "quantity-room-head");
      roomHead.append(
        el("span", "quantity-room-name", room.room || t("quantity.noRoom")),
        totalsChips(room.totals, t("quantity.net")),
      );
      roomEl.append(roomHead);

      for (const row of room.rows) {
        const rowEl = el("div", "quantity-row");
        rowEl.classList.toggle("is-clamped", row.clamped);
        const rowHead = el("div", "quantity-row-head");
        const type = el("span", "quantity-row-type");
        type.append(
          el(
            "span",
            "quantity-type-name",
            row.countTypeLabel
              ? `${typeLabel(row.type)} · ${row.countTypeLabel}`
              : typeLabel(row.type),
          ),
          el("span", "quantity-unit", row.unit),
        );
        rowHead.append(type, el("span", "quantity-items", itemCount(row.items)));
        rowEl.append(rowHead);

        const values = el("div", "quantity-values");
        for (const [label, value, className] of [
          [t("quantity.gross"), row.gross, ""],
          [t("quantity.deduct"), row.deduction, "is-deduction"],
          [t("quantity.net"), row.net, "is-net"],
          [
            t("quantity.wastePercent", { percent: formatNumber(row.wastePercent, 1) }),
            row.wasteQuantity,
            "is-waste",
          ],
          [t("quantity.order"), row.orderQuantity, "is-order"],
        ] as const) {
          const stat = el("div", `quantity-stat ${className}`.trim());
          stat.append(
            el("span", "quantity-stat-label", label),
            el(
              "span",
              "quantity-stat-value",
              className === "is-waste" ? formatNumber(value, 2) : formatValue(value, row.type),
            ),
          );
          if (className === "is-order") {
            stat.title =
              row.roundingStep > 0
                ? t("quantity.roundedUp", {
                    step: formatNumber(row.roundingStep, 2),
                    unit: row.unit,
                  })
                : t("quantity.noRounding");
          }
          if (className === "is-waste") {
            stat.title = t("quantity.wasteTitle", { percent: formatNumber(row.wastePercent, 2) });
          }
          values.append(stat);
        }
        rowEl.append(values);

        if (row.clamped) {
          const warning = el("div", "quantity-warning");
          warning.innerHTML = `${icon("warning", 12)}<span>${t("quantity.clamped")}</span>`;
          rowEl.append(warning);
        }
        roomEl.append(rowEl);
      }
      section.append(roomEl);
    }
    list.append(section);
  }

  const grand = el("section", "quantity-grand");
  grand.append(
    el("div", "quantity-section-title", t("quantity.total")),
    totalsChips(summary.totals, t("quantity.net")),
  );
  list.append(grand);
  return list;
}

function sanitizeFilters(project: NonNullable<typeof store.project>): void {
  if (categoryFilter && !project.categories.some((category) => category.id === categoryFilter)) {
    categoryFilter = "";
  }
  if (layerFilter) {
    const valid = new Set(
      project.layers.filter((layer) => layer.kind === "measure").map((layer) => layer.id),
    );
    const next = new Set([...layerFilter].filter((id) => valid.has(id)));
    layerFilter = next.size ? next : null;
  }
}

function renderFilters(): HTMLElement {
  const project = store.project!;
  const wrap = el("div", "quantity-filters");

  const pageField = el("label", "quantity-field");
  pageField.append(el("span", "field-label", t("quantity.page")));
  const pageSelect = el("select", "select");
  pageSelect.setAttribute("aria-label", t("quantity.filterPage"));
  pageSelect.append(
    option("current", t("quantity.currentPage", { page: store.ui.page }), pageFilter === "current"),
    option("all", t("quantity.allPages"), pageFilter === "all"),
  );
  pageSelect.addEventListener("change", () => {
    pageFilter = pageSelect.value === "all" ? "all" : "current";
    rerender();
  });
  pageField.append(pageSelect);

  const categoryField = el("label", "quantity-field");
  categoryField.append(el("span", "field-label", t("quantity.category")));
  const categorySelect = el("select", "select");
  categorySelect.setAttribute("aria-label", t("quantity.filterCategory"));
  categorySelect.append(option("", t("quantity.allCategories"), !categoryFilter));
  for (const category of project.categories) {
    categorySelect.append(option(category.id, category.name, category.id === categoryFilter));
  }
  categorySelect.addEventListener("change", () => {
    categoryFilter = categorySelect.value;
    rerender();
  });
  categoryField.append(categorySelect);

  const roomField = el("label", "quantity-field quantity-field-wide");
  roomField.append(el("span", "field-label", t("quantity.room")));
  const roomInput = el("input", "input");
  roomInput.type = "search";
  roomInput.placeholder = t("quantity.filterRoom");
  roomInput.value = roomFilter;
  roomInput.setAttribute("aria-label", t("quantity.filterRoomAria"));
  roomInput.addEventListener("change", () => {
    roomFilter = roomInput.value;
    rerender();
  });
  roomField.append(roomInput);

  const layers = project.layers.filter((layer) => layer.kind === "measure");
  const layerDetails = el("details", "quantity-layers quantity-field-wide");
  layerDetails.setAttribute("aria-label", t("quantity.filterLayer"));
  layerDetails.open = layersOpen;
  layerDetails.addEventListener("toggle", () => {
    layersOpen = layerDetails.open;
  });
  const selectedCount = layerFilter === null ? layers.length : layerFilter.size;
  const layerSummary = el(
    "summary",
    "quantity-layers-summary",
    layerFilter === null
      ? t("quantity.allLayers")
      : selectedCount === 0
        ? t("quantity.noLayers")
        : t("quantity.layersSummary", { count: selectedCount }),
  );
  layerDetails.append(layerSummary);

  const layerList = el("div", "quantity-layer-list");
  const allRow = el("label", "check-row");
  const allInput = el("input");
  allInput.type = "checkbox";
  allInput.checked = layerFilter === null;
  allInput.addEventListener("change", () => {
    layerFilter = allInput.checked ? null : new Set();
    rerender();
  });
  allRow.append(allInput, el("span", "", t("quantity.allMeasurementLayers")));
  layerList.append(allRow);

  for (const layer of layers) {
    const row = el("label", "check-row");
    const input = el("input");
    input.type = "checkbox";
    input.checked = layerFilter === null || layerFilter.has(layer.id);
    input.addEventListener("change", () => {
      if (layerFilter === null) {
        if (!input.checked) {
          layerFilter = new Set(layers.map((entry) => entry.id).filter((id) => id !== layer.id));
        }
      } else {
        const next = new Set(layerFilter);
        if (input.checked) next.add(layer.id);
        else next.delete(layer.id);
        layerFilter =
          layers.length > 0 && layers.every((entry) => next.has(entry.id)) ? null : next;
      }
      rerender();
    });
    row.append(input, el("span", "", layer.name));
    layerList.append(row);
  }
  layerDetails.append(layerList);

  const hiddenRow = el("label", "check-row quantity-field-wide");
  const hiddenInput = el("input");
  hiddenInput.type = "checkbox";
  hiddenInput.checked = includeHidden;
  hiddenInput.addEventListener("change", () => {
    includeHidden = hiddenInput.checked;
    rerender();
  });
  hiddenRow.append(hiddenInput, el("span", "", t("quantity.includeHidden")));

  const actions = el("div", "quantity-filter-actions quantity-field-wide");
  const reset = el("button", "btn btn-small btn-ghost", t("quantity.resetFilters"));
  reset.type = "button";
  reset.addEventListener("click", () => {
    resetFilters();
    rerender();
  });
  actions.append(reset);

  wrap.append(pageField, categoryField, roomField, layerDetails, hiddenRow, actions);
  return wrap;
}

function renderNotice(summary: QuantitySummary): HTMLElement | null {
  const notes: string[] = [];
  if (!includeHidden && summary.hiddenExcluded > 0) {
    notes.push(t("quantity.hiddenExcluded", { count: summary.hiddenExcluded }));
  }
  if (summary.uncalibratedExcluded > 0) {
    notes.push(t("quantity.uncalibratedExcluded", { count: summary.uncalibratedExcluded }));
  }
  if (!notes.length) return null;
  const notice = el("div", "quantity-notice");
  notice.setAttribute("role", "status");
  notice.innerHTML = `${icon("info", 12)}<span>${notes.join(" · ")}</span>`;
  return notice;
}

function rerender(): void {
  if (!activeContainer) return;
  renderQuantitiesBody(activeContainer);
}

function renderQuantitiesBody(body: HTMLElement): void {
  const project = store.project;
  if (!project) return;
  sanitizeFilters(project);
  clear(body);
  const summary = currentSummary();
  if (!summary) return;
  const panel = el("div", "quantity-panel");
  panel.append(renderFilters());
  const notice = renderNotice(summary);
  if (notice) panel.append(notice);
  panel.append(renderRows(summary));
  body.append(panel);
}

let activeContainer: HTMLElement | null = null;

export function unmountQuantities(): void {
  activeContainer = null;
}

export function mountQuantities(container: HTMLElement): void {
  const project = store.project;
  if (!project) return;
  const identity = `${project.id}\u0000${project.documents.map((document) => document.sha256).join("+")}`;
  if (identity !== projectIdentity) {
    projectIdentity = identity;
    resetFilters();
  }
  activeContainer = container;
  renderQuantitiesBody(container);
}
