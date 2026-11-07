import {
  INSPECTION_STATUSES,
  inspectionStatusColor,
  inspectionStatusLabel,
  symbolTagPrefix,
} from "../../features/schematics/symbols/registry";
import { t } from "../../i18n";
import { setItemsStatus } from "../../model/commands";
import { findItem } from "../../model/layers";
import type { InspectionStatus } from "../../model/types";
import { store } from "../../state/store";
import { el, option } from "../dom";
import type { InspectorContext } from "./context";

export function appendSymbol(section: HTMLElement, context: InspectorContext): void {
  const { item, actions, locked, selection } = context;
  if (item.kind === "symbol") {
    const statusField = el("label", "field");
    statusField.append(el("span", "field-label", t("markups.column.status")));
    const statusSelect = el("select", "select");
    statusSelect.append(option("", t("inspector.notAssessed"), !item.status));
    for (const status of INSPECTION_STATUSES) {
      statusSelect.append(option(status, inspectionStatusLabel(status), item.status === status));
    }
    statusSelect.value = item.status ?? "";
    statusSelect.disabled = locked;
    statusSelect.title = locked ? t("inspector.unlockStatus") : t("inspector.statusHelp");
    statusSelect.style.color = inspectionStatusColor(item.status ?? undefined);
    statusSelect.addEventListener("change", () => {
      store.mutate((project) => {
        setItemsStatus(
          project,
          [selection],
          statusSelect.value ? (statusSelect.value as InspectionStatus) : null,
        );
      }, "change");
    });
    statusField.append(statusSelect);
    section.append(statusField);

    const tagField = el("label", "field");
    tagField.append(el("span", "field-label", t("inspector.symbolTag")));
    const tagInput = el("input", "input");
    tagInput.type = "text";
    tagInput.maxLength = 40;
    tagInput.value = item.tag ?? "";
    tagInput.placeholder = symbolTagPrefix(item.symbolId) ?? t("inspector.symbolTagPlaceholder");
    tagInput.disabled = locked;
    tagInput.addEventListener("change", () => {
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (!target) return;
        const value = tagInput.value.replace(/\s+/g, " ").trim().slice(0, 40);
        target.tag = value || undefined;
        target.updatedAt = new Date().toISOString();
      }, "change");
    });
    tagField.append(tagInput);
    section.append(tagField);

    const offset = item.tagOffset ?? { x: 0, y: 0 };
    const offsetRow = el("div", "field-row");
    for (const axis of ["x", "y"] as const) {
      const axisField = el("label", "field");
      axisField.append(
        el(
          "span",
          "field-label",
          axis === "x" ? t("inspector.tagOffsetX") : t("inspector.tagOffsetY"),
        ),
      );
      const input = el("input", "input");
      input.type = "number";
      input.min = "-2000";
      input.max = "2000";
      input.step = "1";
      input.value = String(Math.round(offset[axis]));
      input.disabled = locked;
      input.addEventListener("change", () => {
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (!target) return;
          const current = target.tagOffset ?? { x: 0, y: 0 };
          target.tagOffset = {
            x: axis === "x" ? Math.round(Number(input.value) || 0) : current.x,
            y: axis === "y" ? Math.round(Number(input.value) || 0) : current.y,
          };
          target.updatedAt = new Date().toISOString();
        }, "change");
      });
      axisField.append(input);
      offsetRow.append(axisField);
    }
    section.append(offsetRow);
    section.append(el("div", "empty-note small", t("inspector.symbolColourNote")));
  }

  if (item.kind === "rail") {
    const railField = el("label", "field");
    railField.append(el("span", "field-label", t("kind.rail")));
    const editRail = el("button", "btn btn-small", t("inspector.editRail"));
    editRail.type = "button";
    editRail.disabled = locked;
    editRail.addEventListener("click", () => actions.editRail(item.id));
    railField.append(editRail);
    section.append(railField);
  }
}
