import { t } from "../../i18n";
import { currentPageId } from "../../model/pages";
import type { QuantitySummary, QuantityType, QuantityTypeTotal } from "../../model/quantity";
import { formatNumber } from "../../model/units";
import { store } from "../../state/store";
import { clear, el, option } from "../../ui/dom";
import { icon } from "../../ui/icons";
import { resolveQuantitySummary } from "./model";
import {
  quantityPanelState,
  resetQuantityPanelFilters,
  sanitizeQuantityPanelFilters,
} from "./state";

const state = quantityPanelState;

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

function currentSummary(): QuantitySummary | null {
  const project = store.project;
  if (!project) return null;
  state.cache = resolveQuantitySummary({
    project,
    revision: store.revision,
    currentPage: currentPageId(project, store.ui.page),
    filters: state,
    cache: state.cache,
  });
  return state.cache.summary;
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

function renderFilters(): HTMLElement {
  const project = store.project!;
  const wrap = el("div", "quantity-filters");

  const pageField = el("label", "quantity-field");
  pageField.append(el("span", "field-label", t("quantity.page")));
  const pageSelect = el("select", "select");
  pageSelect.setAttribute("aria-label", t("quantity.filterPage"));
  pageSelect.append(
    option("current", t("quantity.currentPage", { page: store.ui.page }), state.page === "current"),
    option("all", t("quantity.allPages"), state.page === "all"),
  );
  pageSelect.addEventListener("change", () => {
    state.page = pageSelect.value === "all" ? "all" : "current";
    rerender();
  });
  pageField.append(pageSelect);

  const categoryField = el("label", "quantity-field");
  categoryField.append(el("span", "field-label", t("quantity.category")));
  const categorySelect = el("select", "select");
  categorySelect.setAttribute("aria-label", t("quantity.filterCategory"));
  categorySelect.append(option("", t("quantity.allCategories"), !state.categoryId));
  for (const category of project.categories) {
    categorySelect.append(option(category.id, category.name, category.id === state.categoryId));
  }
  categorySelect.addEventListener("change", () => {
    state.categoryId = categorySelect.value;
    rerender();
  });
  categoryField.append(categorySelect);

  const roomField = el("label", "quantity-field quantity-field-wide");
  roomField.append(el("span", "field-label", t("quantity.room")));
  const roomInput = el("input", "input");
  roomInput.type = "search";
  roomInput.placeholder = t("quantity.filterRoom");
  roomInput.value = state.room;
  roomInput.setAttribute("aria-label", t("quantity.filterRoomAria"));
  roomInput.addEventListener("change", () => {
    state.room = roomInput.value;
    rerender();
  });
  roomField.append(roomInput);

  const layers = project.layers.filter((layer) => layer.kind === "measure");
  const layerDetails = el("details", "quantity-layers quantity-field-wide");
  layerDetails.setAttribute("aria-label", t("quantity.filterLayer"));
  layerDetails.open = state.layersOpen;
  layerDetails.addEventListener("toggle", () => {
    state.layersOpen = layerDetails.open;
  });
  const selectedCount = state.layerIds === null ? layers.length : state.layerIds.size;
  const layerSummary = el(
    "summary",
    "quantity-layers-summary",
    state.layerIds === null
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
  allInput.checked = state.layerIds === null;
  allInput.addEventListener("change", () => {
    state.layerIds = allInput.checked ? null : new Set();
    rerender();
  });
  allRow.append(allInput, el("span", "", t("quantity.allMeasurementLayers")));
  layerList.append(allRow);

  for (const layer of layers) {
    const row = el("label", "check-row");
    const input = el("input");
    input.type = "checkbox";
    input.checked = state.layerIds === null || state.layerIds.has(layer.id);
    input.addEventListener("change", () => {
      const layerIds = state.layerIds;
      if (layerIds === null) {
        if (!input.checked) {
          state.layerIds = new Set(layers.map((entry) => entry.id).filter((id) => id !== layer.id));
        }
      } else {
        const next = new Set(layerIds);
        if (input.checked) next.add(layer.id);
        else next.delete(layer.id);
        state.layerIds =
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
  hiddenInput.checked = state.includeHidden;
  hiddenInput.addEventListener("change", () => {
    state.includeHidden = hiddenInput.checked;
    rerender();
  });
  hiddenRow.append(hiddenInput, el("span", "", t("quantity.includeHidden")));

  const actions = el("div", "quantity-filter-actions quantity-field-wide");
  const reset = el("button", "btn btn-small btn-ghost", t("quantity.resetFilters"));
  reset.type = "button";
  reset.addEventListener("click", () => {
    resetQuantityPanelFilters();
    rerender();
  });
  actions.append(reset);

  wrap.append(pageField, categoryField, roomField, layerDetails, hiddenRow, actions);
  return wrap;
}

function renderNotice(summary: QuantitySummary): HTMLElement | null {
  const notes: string[] = [];
  if (!state.includeHidden && summary.hiddenExcluded > 0) {
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
  if (!state.activeContainer) return;
  renderQuantitiesBody(state.activeContainer);
}

function renderQuantitiesBody(body: HTMLElement): void {
  const project = store.project;
  if (!project) return;
  sanitizeQuantityPanelFilters(state, project);
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

export function unmountQuantities(): void {
  state.activeContainer = null;
}

export function mountQuantities(container: HTMLElement): void {
  const project = store.project;
  if (!project) return;
  const identity = `${project.id}\u0000${project.documents.map((document) => document.sha256).join("+")}`;
  if (identity !== state.projectIdentity) {
    state.projectIdentity = identity;
    resetQuantityPanelFilters();
  }
  state.activeContainer = container;
  renderQuantitiesBody(container);
}
