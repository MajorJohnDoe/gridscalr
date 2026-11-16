import { t } from "../../i18n";
import {
  cachedSchedule,
  continuePlacement,
  findSchedule,
  layoutForItem,
  openRowRangeDialog,
  openScheduleBuilder,
  placementMeasure,
  updatePlacement,
  type PlacementResult,
} from "../../features/schedules";
import { store } from "../../state/store";
import { el } from "../dom";
import { icon } from "../icons";
import type { InspectorContext } from "./context";

/**
 * Properties for a placed schedule table: the schedule it shows, its row
 * range, header/total choice, and the overflow continuation action. A missing
 * schedule is shown as an explicit placeholder, never an empty box.
 */
export function appendSchedule(section: HTMLElement, context: InspectorContext): void {
  const { project, item, actions, locked } = context;
  if (item.kind !== "schedule") return;

  const heading = el("div", "section-head");
  heading.append(el("h3", "", t("schedules.inspector.title")));
  section.append(heading);

  const schedule = findSchedule(project, item.scheduleId);
  if (!schedule) {
    const warning = el("div", "scale-warning-note");
    warning.innerHTML = icon("warning", 13);
    warning.append(el("span", "", t("schedules.inspector.missing")));
    section.append(warning);
    const remove = el("button", "btn btn-small btn-danger", t("common.delete"));
    remove.type = "button";
    remove.disabled = locked;
    remove.addEventListener("click", actions.deleteSelection);
    section.append(remove);
    return;
  }

  section.append(el("div", "schedules-inspector-name", schedule.name));
  const layout = layoutForItem(
    cachedSchedule(store.revision, project, schedule),
    item,
    placementMeasure(),
  );
  const start = item.rowStart ?? 0;
  if (layout) {
    const rangeText =
      layout.overflow || start > 0
        ? t("schedules.inspector.rowRange", {
            from: start + 1,
            to: Math.max(start + 1, start + layout.visibleRows),
            total: layout.totalRows,
          })
        : t("schedules.inspector.allRows", { total: layout.totalRows });
    section.append(el("div", "selection-secondary", rangeText));
  }

  const buttons = el("div", "selection-actions");
  const edit = el("button", "btn btn-small", t("schedules.inspector.edit"));
  edit.type = "button";
  edit.disabled = locked || !item.scheduleId;
  edit.addEventListener("click", () => {
    if (item.scheduleId) void openScheduleBuilder(item.scheduleId);
  });
  const range = el("button", "btn btn-small", t("schedules.inspector.changeRange"));
  range.type = "button";
  range.disabled = locked;
  range.addEventListener(
    "click",
    () => void openRowRangeDialog(item.id, { refresh: actions.refresh }),
  );
  buttons.append(edit, range);
  section.append(buttons);

  for (const key of ["showHeader", "showTotals"] as const) {
    const row = el("label", "check-row");
    const input = el("input");
    input.type = "checkbox";
    input.checked = key === "showHeader" ? item.showHeader !== false : item.showTotals === true;
    input.disabled = locked;
    input.addEventListener("change", () => {
      store.mutate((project) => {
        updatePlacement(project, item.id, { [key]: input.checked });
      }, "change");
    });
    row.append(
      input,
      el(
        "span",
        "",
        t(
          key === "showHeader"
            ? "schedules.placement.showHeader"
            : "schedules.placement.showTotals",
        ),
      ),
    );
    section.append(row);
  }

  if (layout?.overflow && layout.continuationRowStart !== null) {
    const warning = el("div", "scale-warning-note");
    warning.innerHTML = icon("warning", 13);
    warning.append(
      el(
        "span",
        "",
        layout.overflowReason === "box"
          ? t("schedules.placement.overflowBox", { row: layout.continuationRowStart + 1 })
          : t("schedules.placement.overflowRange", {
              from: start + 1,
              to: Math.max(start + 1, start + layout.visibleRows),
              total: layout.totalRows,
            }),
      ),
    );
    section.append(warning);
    const nextStart = layout.continuationRowStart;
    const next = el("button", "btn btn-small", t("schedules.placement.continue"));
    next.type = "button";
    next.disabled = locked;
    next.title = t("schedules.placement.continueHint", { row: nextStart + 1 });
    next.addEventListener("click", () => {
      let created: PlacementResult | null = null;
      store.mutate((project) => {
        created = continuePlacement(project, item.id, nextStart, {
          layerName: t("schedules.placement.layerName"),
        });
      }, "change");
      const result = created as PlacementResult | null;
      if (result) store.setSelection({ layerId: result.layerId, itemId: result.item.id });
      actions.refresh();
    });
    section.append(next);
  }
}
