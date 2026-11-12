import { countQuantityOf, countTypeLabel } from "../../model/countTypes";
import { t } from "../../i18n";
import { allRooms, categoryForItem, normalizeRoom } from "../../model/categories";
import { LABEL_MAX_SIZE, LABEL_MIN_SIZE, clampLabelSize } from "../../model/label";
import { labelFitLabel } from "../../model/labelLayout";
import { findItem, isMeasurementKind } from "../../model/layers";
import type { AreaMode, CountType } from "../../model/types";
import { formatNumber } from "../../model/units";
import { store } from "../../state/store";
import { el, option } from "../dom";
import { toast } from "../toast";
import type { InspectorContext } from "./context";

export function appendMeasurement(section: HTMLElement, context: InspectorContext): void {
  const { project, item, locked } = context;
  if (isMeasurementKind(item.kind)) {
    section.append(el("div", "empty-note small", t("inspector.labelHelp")));
    if (item.labelOffset || item.labelAnchor || item.labelFit) {
      const resetLabel = el("button", "btn btn-small btn-ghost", t("inspector.resetLabelPosition"));
      resetLabel.type = "button";
      resetLabel.disabled = locked;
      resetLabel.title = locked
        ? t("inspector.unlockLayerMove")
        : t("inspector.resetLabelPositionTitle");
      resetLabel.addEventListener("click", () => {
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (!target) return;
          delete target.labelOffset;
          delete target.labelAnchor;
          delete target.labelFit;
          target.updatedAt = new Date().toISOString();
        }, "change");
      });
      section.append(resetLabel);
    }

    if (item.labelFit) {
      section.append(
        el(
          "div",
          "empty-note small",
          t("inspector.labelLockedInside", { placement: labelFitLabel(item.labelFit) }),
        ),
      );
      const release = el("button", "btn btn-small btn-ghost", t("inspector.releaseInsideArea"));
      release.type = "button";
      release.disabled = locked;
      release.addEventListener("click", () => {
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (!target) return;
          delete target.labelFit;
          target.updatedAt = new Date().toISOString();
        }, "change");
      });
      section.append(release);
    }

    const projectLabelSize = clampLabelSize(project.settings.labelSize);
    const currentLabelSize = clampLabelSize(item.labelSize ?? projectLabelSize);
    const sizeField = el("label", "field");
    const sizeHead = el("div", "section-head");
    sizeHead.style.marginBottom = "4px";
    sizeHead.append(el("span", "field-label", t("inspector.labelSize")));
    const sizeValue = el("span", "range-value", `${formatNumber(currentLabelSize, 1)} pt`);
    sizeHead.append(sizeValue);
    const sizeRange = el("input");
    sizeRange.type = "range";
    sizeRange.min = String(LABEL_MIN_SIZE);
    sizeRange.max = String(LABEL_MAX_SIZE);
    sizeRange.step = "0.5";
    sizeRange.value = String(currentLabelSize);
    sizeRange.disabled = locked;
    sizeRange.setAttribute("aria-label", t("inspector.labelSizePoints"));
    sizeRange.title = t("inspector.labelSizeNote");
    sizeRange.addEventListener("input", () => {
      sizeValue.textContent = `${formatNumber(Number(sizeRange.value), 1)} pt`;
    });
    sizeRange.addEventListener("change", () => {
      const value = clampLabelSize(Number(sizeRange.value));
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (!target) return;
        target.labelSize = value;
        target.updatedAt = new Date().toISOString();
      }, "change");
    });
    sizeField.append(sizeHead, sizeRange);
    section.append(sizeField);

    if (item.labelSize !== undefined) {
      const resetSize = el("button", "btn btn-small btn-ghost", t("inspector.resetLabelSize"));
      resetSize.type = "button";
      resetSize.disabled = locked;
      resetSize.title = locked
        ? t("inspector.unlockLayerResetLabel")
        : t("inspector.followProjectDefault", { size: formatNumber(projectLabelSize, 1) });
      resetSize.addEventListener("click", () => {
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (!target) return;
          delete target.labelSize;
          target.updatedAt = new Date().toISOString();
        }, "change");
      });
      section.append(resetSize);
    }

    if (item.kind === "count") {
      const typeField = el("label", "field");
      typeField.append(el("span", "field-label", t("inspector.objectType")));
      const typeSelect = el("select", "select");
      for (const type of project.countTypes) {
        typeSelect.append(
          option(
            type.id,
            countTypeLabel(project, type.id),
            type.id === (item.countType ?? "other"),
          ),
        );
      }
      typeSelect.disabled = locked;
      typeSelect.title = locked ? t("inspector.unlockLayerEdit") : t("inspector.countType");
      typeSelect.addEventListener("change", () => {
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (target) target.countType = typeSelect.value as CountType;
        }, "change");
      });
      typeField.append(typeSelect);
      section.append(typeField);

      const quantityField = el("label", "field");
      quantityField.append(el("span", "field-label", t("inspector.piecesPerObject")));
      const quantityInput = el("input", "input");
      quantityInput.type = "number";
      quantityInput.min = "1";
      quantityInput.max = "100000";
      quantityInput.step = "1";
      quantityInput.value = String(countQuantityOf(item));
      quantityInput.disabled = locked;
      quantityInput.title = locked
        ? t("inspector.unlockLayerEditCount")
        : t("inspector.piecesHelp");
      quantityInput.setAttribute("aria-label", t("inspector.piecesAria"));
      quantityInput.addEventListener("change", () => {
        const value = Number(quantityInput.value);
        if (!Number.isFinite(value) || value < 1) {
          quantityInput.value = String(countQuantityOf(item));
          toast(t("inspector.piecesInvalid"), "warning");
          return;
        }
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (!target) return;
          const quantity = Math.max(1, Math.round(value));
          if (quantity > 1) target.countQuantity = quantity;
          else delete target.countQuantity;
          target.updatedAt = new Date().toISOString();
        }, "change");
      });
      quantityField.append(quantityInput);
      section.append(quantityField);
    }

    const categoryField = el("label", "field");
    categoryField.append(el("span", "field-label", t("measureOptions.category")));
    const categorySelect = el("select", "select");
    const currentCategory = categoryForItem(project, item);
    for (const category of project.categories) {
      categorySelect.append(
        option(category.id, category.name, category.id === currentCategory?.id),
      );
    }
    categorySelect.disabled = locked;
    categorySelect.title = locked ? t("inspector.unlockLayerEdit") : t("inspector.groupingHelp");
    categorySelect.addEventListener("change", () => {
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (target) target.categoryId = categorySelect.value;
      }, "change");
    });
    categoryField.append(categorySelect);
    section.append(categoryField);

    if (item.kind === "area") {
      const modeField = el("label", "field");
      modeField.append(el("span", "field-label", t("inspector.areaMode")));
      const modeSelect = el("select", "select");
      modeSelect.append(
        option("add", t("inspector.addToArea"), (item.areaMode ?? "add") === "add"),
        option("subtract", t("inspector.deductFromArea"), item.areaMode === "subtract"),
      );
      modeSelect.disabled = locked;
      modeSelect.title = locked ? t("inspector.unlockLayerEdit") : t("inspector.deductNote");
      modeSelect.addEventListener("change", () => {
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (target) target.areaMode = modeSelect.value as AreaMode;
        }, "change");
      });
      modeField.append(modeSelect);
      section.append(modeField);
    }

    const roomField = el("label", "field");
    roomField.append(el("span", "field-label", t("measureOptions.room")));
    const roomInput = el("input", "input");
    roomInput.type = "text";
    roomInput.value = item.room ?? "";
    roomInput.placeholder = t("common.optional");
    roomInput.disabled = locked;
    roomInput.title = locked ? t("inspector.unlockLayerEdit") : t("inspector.roomHelp");
    const roomList = el("datalist");
    roomList.id = "selection-room-options";
    for (const room of allRooms(project)) roomList.append(option(room, room));
    roomInput.setAttribute("list", roomList.id);
    roomInput.addEventListener("change", () => {
      const room = normalizeRoom(roomInput.value);
      roomInput.value = room ?? "";
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (!target) return;
        if (room) target.room = room;
        else delete target.room;
      }, "change");
    });
    roomField.append(roomInput, roomList);
    section.append(roomField);
  }
}
