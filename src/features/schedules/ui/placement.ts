import { t } from "../../../i18n";
import { pageDisplayName, pageNumber } from "../../../model/pages";
import type { PageId, PageSize } from "../../../model/types";
import { findItem } from "../../../model/layers";
import { store } from "../../../state/store";
import { showModal } from "../../../ui/dialogs";
import { el, option } from "../../../ui/dom";
import { toast } from "../../../ui/toast";
import { TEXT_FONT_STACK } from "../../../model/text";
import type { MeasureText } from "../layout";
import { estimateTextWidth } from "../layout";
import { findSchedule } from "../model";
import { createPlacement, updatePlacement, type PlacementResult } from "../placement";

/**
 * Placement dialogs: **Place on drawing…** from the Takeoff tab and the
 * takeoff table list, and **Change row range…** from the inspector or the context
 * menu. Both write one store mutation, so a placement or a range change is one
 * undo step.
 */

const MM_PER_POINT = 25.4 / 72;

export interface PlacementHost {
  goToPage?: (page: number) => void;
  refresh?: () => void;
  pageSize?: (page: number) => PageSize | undefined;
}

/** Canvas-backed text metrics for the inspector's overflow warning. */
let cachedMeasure: MeasureText | null = null;
export function placementMeasure(): MeasureText {
  if (cachedMeasure) return cachedMeasure;
  if (typeof document === "undefined") return estimateTextWidth;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return estimateTextWidth;
  cachedMeasure = (text, size, bold) => {
    context.font = `${bold ? 700 : 400} ${Math.max(1, size)}px ${TEXT_FONT_STACK}`;
    return context.measureText(text).width;
  };
  return cachedMeasure;
}

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const wrap = el("label", "field");
  wrap.append(el("span", "field-label", labelText), control);
  return wrap;
}

function numberInput(value: string, min: number, max: number, label: string): HTMLInputElement {
  const input = el("input", "input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = "1";
  input.value = value;
  input.setAttribute("aria-label", label);
  return input;
}

function checkRow(
  labelText: string,
  checked: boolean,
): { row: HTMLLabelElement; input: HTMLInputElement } {
  const row = el("label", "check-row");
  const input = el("input");
  input.type = "checkbox";
  input.checked = checked;
  row.append(input, el("span", "", labelText));
  return { row, input };
}

export function openPlacementDialog(scheduleId: string, host: PlacementHost = {}): Promise<void> {
  const project = store.project;
  if (!project || store.readOnly) return Promise.resolve();
  const schedule = findSchedule(project, scheduleId);
  if (!schedule) return Promise.resolve();
  if (!project.pages.length) {
    toast(t("schedules.placement.noPages"), "warning");
    return Promise.resolve();
  }

  const currentPageId =
    project.pages[Math.min(project.pages.length - 1, Math.max(0, store.ui.page - 1))]?.id ??
    project.pages[0].id;
  const body = el("div", "form-stack schedules-placement");
  const pageSelect = el("select", "select");
  pageSelect.setAttribute("aria-label", t("schedules.placement.page"));
  for (const page of project.pages) {
    pageSelect.append(
      option(
        page.id,
        pageDisplayName(project, page.id) ||
          t("schedules.pageOnly", { page: pageNumber(project, page.id) }),
        page.id === currentPageId,
      ),
    );
  }
  pageSelect.value = currentPageId;

  const pageWidthMm = (() => {
    const size = host.pageSize?.(pageNumber(project, currentPageId));
    return Math.round((size?.width ?? 842) * MM_PER_POINT);
  })();
  const widthInput = numberInput(
    "200",
    30,
    Math.max(30, pageWidthMm - 20),
    t("schedules.placement.width"),
  );
  const widthField = el("label", "field");
  widthField.append(el("span", "field-label", t("schedules.placement.width")), widthInput);
  widthField.append(el("span", "field-hint", t("schedules.placement.widthHint")));

  const allRows = checkRow(t("schedules.placement.allRows"), true);
  const startInput = numberInput("1", 1, 100000, t("schedules.placement.rowStart"));
  const limitInput = numberInput("20", 1, 10000, t("schedules.placement.rowLimit"));
  startInput.disabled = true;
  limitInput.disabled = true;
  allRows.input.addEventListener("change", () => {
    startInput.disabled = allRows.input.checked;
    limitInput.disabled = allRows.input.checked;
  });
  const rangeRow = el("div", "field-row");
  rangeRow.append(
    field(t("schedules.placement.rowStart"), startInput),
    field(t("schedules.placement.rowLimit"), limitInput),
  );

  const header = checkRow(t("schedules.placement.showHeader"), true);
  const totals = checkRow(t("schedules.placement.showTotals"), false);

  body.append(
    el("p", "settings-note", t("schedules.placement.intro", { name: schedule.name })),
    field(t("schedules.placement.page"), pageSelect),
    widthField,
    allRows.row,
    rangeRow,
    header.row,
    totals.row,
    el("p", "empty-note small", t("schedules.placement.hint")),
  );

  return showModal({
    title: t("schedules.placement.title"),
    subtitle: schedule.name,
    body,
    wide: false,
    actions: [
      { label: t("common.cancel"), value: "cancel" },
      { label: t("schedules.placement.place"), value: "save", primary: true },
    ],
    onValidate: () => {
      const width = Number(widthInput.value);
      if (!Number.isFinite(width) || width < 30) return t("schedules.placement.invalidWidth");
      if (!allRows.input.checked) {
        const start = Number(startInput.value);
        const limit = Number(limitInput.value);
        if (!Number.isInteger(start) || start < 1) return t("schedules.placement.invalidRange");
        if (!Number.isInteger(limit) || limit < 1) return t("schedules.placement.invalidRange");
      }
      return null;
    },
  }).then((value) => {
    if (value !== "save") return;
    const current = store.project;
    if (!current || store.readOnly) return;
    const pageId = pageSelect.value as PageId;
    const page = current.pages.find((entry) => entry.id === pageId);
    if (!page) return;
    const size = host.pageSize?.(pageNumber(current, pageId));
    let created: PlacementResult | null = null;
    store.mutate((project) => {
      created = createPlacement(project, {
        scheduleId,
        pageId,
        width: Math.max(30, Number(widthInput.value)) / MM_PER_POINT,
        pageSize: size,
        rowStart: allRows.input.checked ? 0 : Number(startInput.value) - 1,
        rowLimit: allRows.input.checked ? null : Number(limitInput.value),
        showHeader: header.input.checked,
        showTotals: totals.input.checked,
        layerName: t("schedules.placement.layerName"),
      });
    }, "change");
    const result = created as PlacementResult | null;
    if (!result) {
      toast(t("schedules.placement.failed"), "warning");
      return;
    }
    host.goToPage?.(pageNumber(store.project ?? current, pageId));
    store.setSelection({ layerId: result.layerId, itemId: result.item.id });
    toast(t("schedules.placement.placed", { name: schedule.name }), "success");
    host.refresh?.();
  });
}

export function openRowRangeDialog(itemId: string, host: PlacementHost = {}): Promise<void> {
  const project = store.project;
  if (!project || store.readOnly) return Promise.resolve();
  const found = findItem(project, itemId);
  if (!found || found.item.kind !== "schedule") return Promise.resolve();
  const schedule = findSchedule(project, found.item.scheduleId);
  const item = found.item;
  const body = el("div", "form-stack schedules-placement");
  const allRows = checkRow(t("schedules.placement.allRows"), item.rowLimit === undefined);
  const startInput = numberInput(
    String((item.rowStart ?? 0) + 1),
    1,
    100000,
    t("schedules.placement.rowStart"),
  );
  const limitInput = numberInput(
    item.rowLimit ? String(item.rowLimit) : "20",
    1,
    10000,
    t("schedules.placement.rowLimit"),
  );
  startInput.disabled = allRows.input.checked;
  limitInput.disabled = allRows.input.checked;
  allRows.input.addEventListener("change", () => {
    startInput.disabled = allRows.input.checked;
    limitInput.disabled = allRows.input.checked;
  });
  const rangeRow = el("div", "field-row");
  rangeRow.append(
    field(t("schedules.placement.rowStart"), startInput),
    field(t("schedules.placement.rowLimit"), limitInput),
  );
  const header = checkRow(t("schedules.placement.showHeader"), item.showHeader !== false);
  const totals = checkRow(t("schedules.placement.showTotals"), item.showTotals === true);
  body.append(
    schedule
      ? el("p", "settings-note", t("schedules.placement.intro", { name: schedule.name }))
      : el("p", "form-warning", t("schedules.placement.missing")),
    allRows.row,
    rangeRow,
    header.row,
    totals.row,
  );

  return showModal({
    title: t("schedules.placement.rangeTitle"),
    body,
    actions: [
      { label: t("common.cancel"), value: "cancel" },
      { label: t("common.save"), value: "save", primary: true },
    ],
    onValidate: () => {
      if (allRows.input.checked) return null;
      const start = Number(startInput.value);
      const limit = Number(limitInput.value);
      if (!Number.isInteger(start) || start < 1) return t("schedules.placement.invalidRange");
      if (!Number.isInteger(limit) || limit < 1) return t("schedules.placement.invalidRange");
      return null;
    },
  }).then((value) => {
    if (value !== "save") return;
    let changed = false;
    store.mutate((project) => {
      changed = updatePlacement(project, itemId, {
        rowStart: allRows.input.checked ? 0 : Number(startInput.value) - 1,
        rowLimit: allRows.input.checked ? null : Number(limitInput.value),
        showHeader: header.input.checked,
        showTotals: totals.input.checked,
      });
    }, "change");
    if (!changed) {
      toast(t("schedules.placement.failed"), "warning");
      return;
    }
    host.refresh?.();
  });
}
