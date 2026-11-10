import { countQuantityOf, countTypeLabel } from "../../features/countTypes/model";
import {
  INSPECTION_STATUSES,
  inspectionStatusLabel,
} from "../../features/schematics/symbols/registry";
import { t } from "../../i18n";
import { allRooms, categoryForItem } from "../../model/categories";
import { setItemsStatus } from "../../model/commands";
import { LABEL_MAX_SIZE, LABEL_MIN_SIZE, clampLabelSize } from "../../model/label";
import {
  DEFAULT_DRAW_COLOR,
  isMeasurementKind,
  itemIsVisible,
  layerLockedOnPage,
  layerVisibleOnPage,
  moveTargetLayers,
} from "../../model/layers";
import { resolveSelection, selectionKind } from "../../model/selection";
import { STROKE_WIDTH_OPTIONS } from "../../model/style";
import type { AreaMode, CountType, InspectionStatus, SelectionRef } from "../../model/types";
import { formatNumber } from "../../model/units";
import { store } from "../../state/store";
import { colorInputValue, setColorInput } from "../colorInput";
import { colorWithEyedropper } from "../colorPicker";
import { el, option } from "../dom";
import { icon } from "../icons";
import type { PanelActions } from "../panels";
import { toast } from "../toast";

export function multiSelectionSection(
  project: NonNullable<typeof store.project>,
  refs: SelectionRef[],
  actions: PanelActions,
): HTMLElement {
  const section = el("section", "inspector-section");
  const head = el("div", "section-head");
  head.append(el("h3", "", t("inspector.selectionHeader")));
  head.append(el("span", "status-chip", t("inspector.selectedCount", { count: refs.length })));
  section.append(head);

  const resolved = resolveSelection(project, refs);
  const kind = selectionKind(project, refs);
  const lockedCount = resolved.filter((entry) => entry.locked).length;
  const hiddenCount = resolved.filter((entry) => !itemIsVisible(entry.item, entry.layer)).length;
  const commonColor =
    resolved.length > 0 && resolved.every((entry) => entry.item.color === resolved[0].item.color)
      ? resolved[0].item.color
      : "";
  const allSymbols = resolved.length > 0 && resolved.every((entry) => entry.item.kind === "symbol");
  const containsSymbols = resolved.some((entry) => entry.item.kind === "symbol");

  const card = el("div", "selection-card multi");
  card.append(el("div", "selection-value", `${resolved.length} selected`));
  card.append(
    el(
      "div",
      "selection-secondary",
      kind
        ? t(kind === "measure" ? "selection.measurementMarks" : "selection.drawingMarks")
        : t("inspector.mixedSelection"),
    ),
  );
  if (lockedCount || hiddenCount) {
    card.append(
      el(
        "div",
        "selection-secondary",
        [lockedCount ? `${lockedCount} locked` : "", hiddenCount ? `${hiddenCount} hidden` : ""]
          .filter(Boolean)
          .join(" · "),
      ),
    );
  }
  section.append(card);

  if (!kind) {
    section.append(el("div", "empty-note small", t("inspector.mixedSelectionNote")));
  }

  if (kind) {
    const layerField = el("label", "field");
    layerField.append(el("span", "field-label", t("inspector.moveToLayer")));
    const layerSelect = el("select", "select");
    layerSelect.append(option("", t("inspector.chooseLayer"), true));
    for (const candidate of moveTargetLayers(
      project,
      kind,
      resolved.map((entry) => entry.item.pageId),
    )) {
      if (candidate.locked) continue;
      if (resolved.every((entry) => entry.layer.id === candidate.id)) continue;
      layerSelect.append(option(candidate.id, candidate.name, false));
    }
    layerSelect.addEventListener("change", () => {
      if (layerSelect.value) actions.moveSelectionToLayer(layerSelect.value);
    });
    layerField.append(layerSelect);
    if (layerSelect.options.length > 1) section.append(layerField);
  }

  if (kind === "measure") {
    const measurements = resolved.filter((entry) => isMeasurementKind(entry.item.kind));
    const editable = measurements.filter((entry) => !entry.locked);
    const allLocked = editable.length === 0;
    if (measurements.length) {
      const firstCategory = categoryForItem(project, measurements[0].item)?.id ?? "";
      const commonCategory = measurements.every(
        (entry) => (categoryForItem(project, entry.item)?.id ?? "") === firstCategory,
      )
        ? firstCategory
        : "";
      const categoryField = el("label", "field");
      categoryField.append(el("span", "field-label", t("measureOptions.category")));
      const categorySelect = el("select", "select");
      categorySelect.append(option("", t("inspector.multipleValues"), !commonCategory));
      for (const category of project.categories) {
        categorySelect.append(option(category.id, category.name, category.id === commonCategory));
      }
      categorySelect.disabled = allLocked;
      categorySelect.setAttribute("aria-label", t("inspector.categorySelected"));
      categorySelect.title = allLocked
        ? t("inspector.unlockSelectedMeasurements")
        : t("inspector.applyCategory");
      categorySelect.addEventListener("change", () => {
        if (categorySelect.value) actions.setSelectionCategory(categorySelect.value);
      });
      categoryField.append(categorySelect);
      section.append(categoryField);

      const firstRoom = (measurements[0].item.room ?? "").trim();
      const roomsMatch = measurements.every(
        (entry) => (entry.item.room ?? "").trim() === firstRoom,
      );
      const commonRoom = roomsMatch ? firstRoom : "";
      const roomField = el("div", "field");
      roomField.append(el("span", "field-label", t("measureOptions.room")));
      const roomRow = el("div", "input-row");
      const roomInput = el("input", "input");
      roomInput.type = "text";
      roomInput.value = commonRoom;
      roomInput.placeholder = roomsMatch ? t("inspector.setRoom") : t("inspector.multipleValues");
      roomInput.disabled = allLocked;
      roomInput.title = allLocked
        ? t("inspector.unlockSelectedMeasurements")
        : t("inspector.setRoomNote");
      roomInput.setAttribute("aria-label", t("inspector.roomSelected"));
      const roomList = el("datalist");
      roomList.id = "multi-selection-room-options";
      for (const room of allRooms(project)) roomList.append(option(room, room));
      roomInput.setAttribute("list", roomList.id);
      const applyRoom = () => actions.setSelectionRoom(roomInput.value);
      roomInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          applyRoom();
        }
      });
      const roomButton = el("button", "btn btn-small", t("common.apply"));
      roomButton.type = "button";
      roomButton.disabled = allLocked;
      roomButton.addEventListener("click", applyRoom);
      roomRow.append(roomInput, roomButton);
      roomField.append(roomRow, roomList);
      section.append(roomField);

      const sizeField = el("div", "field");
      sizeField.append(el("span", "field-label", t("inspector.labelSize")));
      const sizeRow = el("div", "input-row");
      const sizeInput = el("input", "input");
      sizeInput.type = "number";
      sizeInput.min = String(LABEL_MIN_SIZE);
      sizeInput.max = String(LABEL_MAX_SIZE);
      sizeInput.step = "0.5";
      sizeInput.placeholder = t("inspector.projectDefaultPlaceholder", {
        size: formatNumber(clampLabelSize(project.settings.labelSize), 1),
      });
      sizeInput.disabled = allLocked;
      sizeInput.title = allLocked
        ? t("inspector.unlockSelectedMeasurements")
        : t("inspector.applyLabelSize");
      sizeInput.setAttribute("aria-label", t("inspector.labelSizeSelected"));
      const applySize = () => {
        const value = Number(sizeInput.value);
        if (sizeInput.value.trim() === "" || !Number.isFinite(value)) {
          sizeInput.value = "";
          return;
        }
        actions.setSelectionLabelSize(clampLabelSize(value));
      };
      sizeInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          applySize();
        }
      });
      const sizeButton = el("button", "btn btn-small", t("common.apply"));
      sizeButton.type = "button";
      sizeButton.disabled = allLocked;
      sizeButton.addEventListener("click", applySize);
      sizeRow.append(sizeInput, sizeButton);
      sizeField.append(sizeRow);
      section.append(sizeField);

      if (measurements.every((entry) => entry.item.kind === "area")) {
        const firstMode = measurements[0].item.areaMode ?? "add";
        const commonMode = measurements.every(
          (entry) => (entry.item.areaMode ?? "add") === firstMode,
        )
          ? firstMode
          : "";
        const modeField = el("label", "field");
        modeField.append(el("span", "field-label", t("inspector.areaMode")));
        const modeSelect = el("select", "select");
        modeSelect.append(option("", t("inspector.multipleValues"), !commonMode));
        modeSelect.append(
          option("add", t("inspector.addToArea"), commonMode === "add"),
          option("subtract", t("inspector.deductFromArea"), commonMode === "subtract"),
        );
        modeSelect.disabled = allLocked;
        modeSelect.setAttribute("aria-label", t("inspector.areaModeSelected"));
        modeSelect.title = allLocked
          ? t("inspector.unlockSelectedMeasurements")
          : t("inspector.applyAreaMode");
        modeSelect.addEventListener("change", () => {
          if (modeSelect.value) {
            actions.setSelectionAreaMode(modeSelect.value as AreaMode);
          }
        });
        modeField.append(modeSelect);
        section.append(modeField);
      }

      if (measurements.every((entry) => entry.item.kind === "count")) {
        const firstType = measurements[0].item.countType ?? "other";
        const commonType = measurements.every(
          (entry) => (entry.item.countType ?? "other") === firstType,
        )
          ? firstType
          : "";
        const countField = el("label", "field");
        countField.append(el("span", "field-label", t("inspector.objectType")));
        const countSelect = el("select", "select");
        countSelect.append(option("", t("inspector.multipleValues"), !commonType));
        for (const type of project.countTypes) {
          countSelect.append(
            option(type.id, countTypeLabel(project, type.id), type.id === commonType),
          );
        }
        countSelect.disabled = allLocked;
        countSelect.setAttribute("aria-label", t("inspector.objectTypeSelected"));
        countSelect.title = allLocked
          ? t("inspector.unlockSelectedMeasurements")
          : t("inspector.applyObjectType");
        countSelect.addEventListener("change", () => {
          if (countSelect.value) {
            actions.setSelectionCountType(countSelect.value as CountType);
          }
        });
        countField.append(countSelect);
        section.append(countField);

        const quantities = measurements.map((entry) => countQuantityOf(entry.item));
        const firstQuantity = quantities[0];
        const commonQuantity = quantities.every((value) => value === firstQuantity)
          ? firstQuantity
          : null;
        const quantityField = el("label", "field");
        quantityField.append(el("span", "field-label", t("inspector.piecesPerObject")));
        const quantityInput = el("input", "input");
        quantityInput.type = "number";
        quantityInput.min = "1";
        quantityInput.max = "100000";
        quantityInput.step = "1";
        quantityInput.value = commonQuantity === null ? "" : String(commonQuantity);
        quantityInput.placeholder =
          commonQuantity === null ? t("inspector.multipleValues") : String(commonQuantity);
        quantityInput.disabled = allLocked;
        quantityInput.setAttribute("aria-label", t("inspector.piecesSelected"));
        quantityInput.title = allLocked
          ? t("inspector.unlockSelectedMeasurements")
          : t("inspector.applyPieces");
        quantityInput.addEventListener("change", () => {
          const value = Number(quantityInput.value);
          if (!Number.isFinite(value) || value < 1) {
            quantityInput.value = commonQuantity === null ? "" : String(commonQuantity);
            toast(t("inspector.piecesInvalid"), "warning");
            return;
          }
          actions.setSelectionCountQuantity(value);
        });
        quantityField.append(quantityInput);
        section.append(quantityField);
      }

      if (allLocked) {
        section.append(el("div", "empty-note small", t("inspector.allLocked")));
      } else if (lockedCount > 0) {
        section.append(el("div", "empty-note small", t("inspector.lockedSkipped")));
      }
    }
  }

  if (allSymbols) {
    const statuses = resolved.map((entry) => entry.item.status ?? "");
    const firstStatus = statuses[0] ?? "";
    const statusesMatch = statuses.every((status) => status === firstStatus);
    const commonStatus = statusesMatch ? firstStatus : "";
    const statusField = el("label", "field");
    statusField.append(el("span", "field-label", t("markups.column.status")));
    const statusSelect = el("select", "select");
    statusSelect.append(
      option("", statusesMatch ? t("inspector.setStatus") : t("inspector.multipleValues"), true),
    );
    for (const status of INSPECTION_STATUSES) {
      statusSelect.append(option(status, inspectionStatusLabel(status), status === commonStatus));
    }
    statusSelect.disabled = lockedCount === resolved.length;
    statusSelect.setAttribute("aria-label", t("inspector.statusSelected"));
    statusSelect.title =
      lockedCount === resolved.length
        ? t("inspector.unlockSelectedSymbols")
        : t("inspector.applyStatus");
    statusSelect.addEventListener("change", () => {
      if (!statusSelect.value) return;
      store.mutate((project) => {
        setItemsStatus(
          project,
          refs,
          statusSelect.value ? (statusSelect.value as InspectionStatus) : null,
        );
      }, "change");
    });
    statusField.append(statusSelect);
    section.append(statusField);
    section.append(el("div", "empty-note small", t("inspector.symbolColourBulk")));
  }

  if (!containsSymbols) {
    const colorField = el("label", "field");
    colorField.append(el("span", "field-label", t("toolFlyout.colour")));
    const colorInput = el("input", "color-swatch");
    colorInput.type = "color";
    setColorInput(colorInput, commonColor || DEFAULT_DRAW_COLOR, DEFAULT_DRAW_COLOR);
    colorInput.disabled = lockedCount === resolved.length;
    colorInput.addEventListener("change", () =>
      actions.setSelectionColor(colorInputValue(colorInput, DEFAULT_DRAW_COLOR)),
    );
    colorField.append(colorWithEyedropper(colorInput, t("toolFlyout.colour")));
    section.append(colorField);

    const weights = resolved.map((entry) => entry.item.strokeWidth);
    const firstWeight = weights[0] ?? 1;
    const commonWeight = weights.every((value) => Math.abs(value - firstWeight) < 0.01)
      ? firstWeight
      : null;
    const weightField = el("label", "field");
    weightField.append(el("span", "field-label", t("inspector.lineWeight")));
    const weightSelect = el("select", "select");
    weightSelect.append(
      option(
        "",
        commonWeight === null ? t("inspector.setLineWeight") : `${commonWeight} pt (current)`,
        true,
      ),
    );
    for (const value of STROKE_WIDTH_OPTIONS) {
      weightSelect.append(option(String(value), `${value} pt`, false));
    }
    weightSelect.disabled = lockedCount === resolved.length;
    weightSelect.setAttribute("aria-label", t("inspector.lineWeightSelected"));
    weightSelect.title =
      lockedCount === resolved.length
        ? t("inspector.unlockSelectedItems")
        : t("inspector.applyLineWeight");
    weightSelect.addEventListener("change", () => {
      if (weightSelect.value) actions.setSelectionStrokeWidth(Number(weightSelect.value));
    });
    weightField.append(weightSelect);
    section.append(weightField);
  }

  const toggles = el("div", "field-row");
  const anyVisible = resolved.some((entry) => itemIsVisible(entry.item, entry.layer));
  const canShow = resolved.some((entry) => layerVisibleOnPage(entry.layer, entry.item.pageId));
  const visible = el("button", `toggle${anyVisible ? " is-on" : ""}`);
  visible.type = "button";
  visible.disabled = !anyVisible && !canShow;
  visible.title = visible.disabled ? t("inspector.layersHidden") : "";
  visible.innerHTML = `${icon(anyVisible ? "eye" : "eyeOff", 13)}<span>${anyVisible ? t("common.hide") : t("common.show")}</span>`;
  visible.addEventListener("click", () => actions.setSelectionVisible(!anyVisible));
  const anyUnlocked = resolved.some((entry) => !entry.locked);
  const canUnlock = resolved.some((entry) => !layerLockedOnPage(entry.layer, entry.item.pageId));
  const lock = el("button", `toggle${!anyUnlocked ? " is-on" : ""}`);
  lock.type = "button";
  lock.disabled = !anyUnlocked && !canUnlock;
  lock.title = lock.disabled ? t("inspector.layersLocked") : "";
  lock.innerHTML = `${icon(anyUnlocked ? "unlock" : "lock", 13)}<span>${anyUnlocked ? t("common.lock") : t("common.unlock")}</span>`;
  lock.addEventListener("click", () => actions.setSelectionLocked(anyUnlocked));
  toggles.append(visible, lock);
  section.append(toggles);

  const actionsWrap = el("div", "selection-actions");
  const allLocked = lockedCount === resolved.length;
  const duplicate = el("button", "btn btn-small", t("layer.duplicate"));
  duplicate.type = "button";
  duplicate.disabled = allLocked;
  duplicate.innerHTML = `${icon("copy", 13)}<span>${t("layer.duplicate")}</span>`;
  duplicate.addEventListener("click", actions.duplicateSelection);
  const remove = el("button", "btn btn-small btn-danger", t("common.delete"));
  remove.type = "button";
  remove.disabled = allLocked;
  remove.innerHTML = `${icon("trash", 13)}<span>${t("common.delete")}</span>`;
  remove.addEventListener("click", actions.deleteSelection);
  actionsWrap.append(duplicate, remove);
  section.append(actionsWrap);

  return section;
}
