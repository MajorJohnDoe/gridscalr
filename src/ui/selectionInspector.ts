import { allRooms, categoryForItem, normalizeRoom } from "../model/categories";
import { countQuantityOf, countTypeLabel } from "../features/countTypes/model";
import { STROKE_WIDTH_OPTIONS } from "../model/style";
import {
  INSPECTION_STATUSES,
  inspectionStatusColor,
  inspectionStatusLabel,
  symbolCategoryLabel,
  symbolCategoryOf,
  symbolName,
  symbolTagPrefix,
} from "../features/schematics/symbols/registry";
import { setItemsStatus } from "../model/commands";
import {
  formatImageDimensions,
  IMAGE_MODE_LABELS,
  imageAssetForItem,
  imageModeOf,
  imageOpacity,
} from "../model/images";
import {
  findItem,
  isMeasurementKind,
  itemIsLocked,
  itemIsVisible,
  layerLockedOnPage,
  layerVisibleOnPage,
  layersForKind,
  moveItemToLayer,
} from "../model/layers";
import { itemKindLabel, itemMetrics, itemNeedsPageScale, itemScaleWarning } from "../model/measure";
import { clampLabelSize, LABEL_MAX_SIZE, LABEL_MIN_SIZE } from "../model/label";
import { labelFitLabel } from "../model/labelLayout";
import { formatNumber } from "../model/units";
import { resolveSelection, selectionKind } from "../model/selection";
import type {
  AreaMode,
  CountType,
  ImageMode,
  InspectionStatus,
  SelectionRef,
} from "../model/types";
import { formatBytes } from "../io/platform";
import { store } from "../state/store";
import { el, option } from "./dom";
import { icon } from "./icons";
import type { PanelActions } from "./panels";
import { toast } from "./toast";
import { t } from "../i18n";

export function selectionSection(
  project: NonNullable<typeof store.project>,
  actions: PanelActions,
): HTMLElement {
  const refs = store.ui.selection;
  if (refs.length > 1) return multiSelectionSection(project, refs, actions);

  const section = el("section", "inspector-section");
  const head = el("div", "section-head");
  head.append(el("h3", "", t("inspector.selectionHeader")));
  if (refs.length) head.append(el("span", "status-chip is-selected", t("inspector.selectedChip")));
  section.append(head);
  const selection = refs[0] ?? null;
  const found = selection ? findItem(project, selection.itemId) : undefined;
  if (!selection || !found) {
    const note = el("div", "empty-note small");
    note.style.padding = "12px 6px";
    note.innerHTML = icon("cursor", 18);
    note.append(el("div", "", t("inspector.emptySelection")));
    section.append(note);
    return section;
  }

  const { item, layer } = found;
  const locked = itemIsLocked(item, layer);
  const hidden = !itemIsVisible(item, layer);
  const metrics = itemMetrics(item, project);
  const card = el("div", "selection-card");
  const type = el("div", "selection-type");
  const swatch = el("span", "swatch");
  swatch.style.background = item.color;
  type.append(swatch, el("span", "", itemKindLabel(item.kind)));
  card.append(type);
  if (metrics) {
    card.append(el("div", "selection-value", metrics.primary));
    if (metrics.secondary) card.append(el("div", "selection-secondary", metrics.secondary));
  } else if (item.kind === "symbol") {
    card.append(
      el(
        "div",
        "selection-secondary",
        `${symbolCategoryLabel(symbolCategoryOf(item.symbolId))} · ${inspectionStatusLabel(item.status)}`,
      ),
    );
  } else if (item.kind === "text" || item.kind === "textbox") {
    card.append(el("div", "selection-secondary", t("inspector.textAnnotation")));
  } else if (item.kind === "image") {
    const asset = imageAssetForItem(project, item);
    card.append(
      el(
        "div",
        "selection-secondary",
        `${IMAGE_MODE_LABELS[imageModeOf(item)]} image${asset ? ` · ${formatImageDimensions(asset)}` : ""}`,
      ),
    );
    if (asset) {
      card.append(
        el(
          "div",
          "selection-secondary",
          t("selection.embedded", { size: formatBytes(asset.byteSize) }),
        ),
      );
    }
  }
  card.append(
    el(
      "div",
      "selection-secondary",
      t("selection.pageSummary", {
        page: item.page,
        layer: layer.name,
        count: item.points.length,
      }),
    ),
  );
  section.append(card);

  const scaleWarning = itemScaleWarning(item, project);
  if (scaleWarning) {
    const warning = el("div", "scale-warning-note");
    warning.innerHTML = icon("warning", 13);
    warning.append(el("span", "", scaleWarning));
    section.append(warning);
  }

  if (locked) {
    section.append(
      el(
        "div",
        "empty-note small",
        layerLockedOnPage(layer, item.page)
          ? t("inspector.lockedOnPageMessage", { name: layer.name, page: item.page })
          : t("inspector.lockedEdit"),
      ),
    );
  }
  if (hidden) {
    section.append(el("div", "empty-note small", t("inspector.hidden")));
  }

  if (metrics && !metrics.scale && itemNeedsPageScale(item)) {
    section.append(el("div", "empty-note small", t("inspector.noScale")));
  }

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

  if (item.kind === "image") {
    const image = item.image;
    const asset = image ? imageAssetForItem(project, item) : undefined;
    const modeField = el("label", "field");
    modeField.append(el("span", "field-label", t("inspector.imageMode")));
    const modeSelect = el("select", "select");
    modeSelect.append(
      option("background", t("inspector.backgroundMode"), imageModeOf(item) === "background"),
      option("annotation", t("inspector.annotationMode"), imageModeOf(item) === "annotation"),
    );
    modeSelect.disabled = locked;
    modeSelect.title = locked ? t("inspector.unlockImageMode") : t("inspector.backgroundNote");
    modeSelect.addEventListener("change", () =>
      actions.setSelectionImageMode(modeSelect.value as ImageMode),
    );
    modeField.append(modeSelect);
    section.append(modeField);

    const opacityField = el("label", "field");
    const opacityHead = el("div", "section-head");
    opacityHead.style.marginBottom = "4px";
    opacityHead.append(el("span", "field-label", t("inspector.opacity")));
    const opacityValue = el("span", "range-value", `${Math.round(imageOpacity(item) * 100)}%`);
    opacityHead.append(opacityValue);
    const opacityRange = el("input");
    opacityRange.type = "range";
    opacityRange.min = "0";
    opacityRange.max = "100";
    opacityRange.step = "1";
    opacityRange.value = String(Math.round(imageOpacity(item) * 100));
    opacityRange.disabled = locked;
    opacityRange.setAttribute("aria-label", t("inspector.imageOpacity"));
    opacityRange.addEventListener("input", () => {
      opacityValue.textContent = `${opacityRange.value}%`;
    });
    opacityRange.addEventListener("change", () =>
      actions.setSelectionOpacity(Number(opacityRange.value) / 100),
    );
    opacityField.append(opacityHead, opacityRange);
    section.append(opacityField);

    if (asset) {
      section.append(
        el(
          "div",
          "empty-note small",
          `${asset.name} · ${formatImageDimensions(asset)} · ${formatBytes(asset.byteSize)} embedded`,
        ),
      );
    } else if (image) {
      section.append(el("div", "empty-note small", t("inspector.imageMissing")));
    }
  }

  const labelField = el("label", "field");
  labelField.append(
    el(
      "span",
      "field-label",
      item.kind === "delta"
        ? t("inspector.dateOptional")
        : metrics
          ? t("inspector.labelOptional")
          : t("inspector.listLabelOptional"),
    ),
  );
  const labelInput = el("input", "input");
  labelInput.id = "selection-label-input";
  labelInput.dataset.role = "selection-label";
  labelInput.value = item.label ?? "";
  labelInput.placeholder =
    item.kind === "delta"
      ? "YYYY-MM-DD"
      : item.kind === "symbol"
        ? symbolName(item.symbolId)
        : (metrics?.primary ??
          (item.kind === "text" ? t("inspector.textNote") : t("report.markup.label")));
  labelInput.disabled = locked;
  labelInput.title = locked
    ? t("inspector.unlockLayerEdit")
    : metrics
      ? t("inspector.shownWithMeasurement")
      : t("inspector.markupsMetadata");
  labelInput.addEventListener("change", () => {
    store.mutate((project) => {
      const target = findItem(project, item.id)?.item;
      if (target) target.label = labelInput.value.trim() || undefined;
    }, "change");
  });
  labelField.append(labelInput);
  section.append(labelField);
  if (!metrics) {
    section.append(
      el(
        "div",
        "empty-note small",
        item.kind === "delta"
          ? t("inspector.dateBelowTriangle")
          : item.kind === "symbol"
            ? t("inspector.symbolNameNote")
            : t("inspector.listLabelNote"),
      ),
    );
  }

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

  if (
    item.kind === "text" ||
    item.kind === "textbox" ||
    item.kind === "cloud" ||
    item.kind === "callout" ||
    item.kind === "stamp" ||
    item.kind === "delta"
  ) {
    const textField = el("label", "field");
    textField.append(
      el(
        "span",
        "field-label",
        item.kind === "stamp"
          ? t("inspector.stampText")
          : item.kind === "delta"
            ? t("reference.revision")
            : t("dialogs.textLabel"),
      ),
    );
    const edit = el("button", "btn btn-small", t("inspector.editText"));
    edit.type = "button";
    edit.disabled = locked;
    edit.addEventListener("click", actions.editSelectedText);
    textField.append(edit);
    section.append(textField);
  }

  if (item.kind === "textbox") {
    const backgroundRow = el("label", "check-row");
    const background = el("input");
    background.type = "checkbox";
    background.checked = item.textBackground === "white";
    background.disabled = locked;
    background.addEventListener("change", () => {
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (!target) return;
        if (background.checked) target.textBackground = "white";
        else delete target.textBackground;
      }, "change");
    });
    backgroundRow.append(background, el("span", "", t("inspector.whiteBackground")));
    section.append(backgroundRow);
  }

  if (item.kind === "callout" || item.kind === "cloud") {
    const boxRow = el("div", "field-row");
    const widthField = el("label", "field");
    widthField.append(el("span", "field-label", t("inspector.textBoxWidth")));
    const widthInput = el("input", "input");
    widthInput.type = "number";
    widthInput.min = "20";
    widthInput.max = "2000";
    widthInput.step = "5";
    widthInput.placeholder = t("common.auto");
    widthInput.value = item.textBoxWidth ? String(item.textBoxWidth) : "";
    widthInput.disabled = locked;
    widthInput.addEventListener("change", () => {
      const raw = widthInput.value.trim();
      const value = Number(raw);
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (!target) return;
        if (!raw || !Number.isFinite(value) || value <= 0) delete target.textBoxWidth;
        else target.textBoxWidth = Math.max(20, Math.min(2000, value));
      }, "change");
    });

    const heightField = el("label", "field");
    heightField.append(el("span", "field-label", t("inspector.textBoxHeight")));
    const heightInput = el("input", "input");
    heightInput.type = "number";
    heightInput.min = "15";
    heightInput.max = "2000";
    heightInput.step = "5";
    heightInput.placeholder = t("common.auto");
    heightInput.value = item.textBoxHeight ? String(item.textBoxHeight) : "";
    heightInput.disabled = locked;
    heightInput.addEventListener("change", () => {
      const raw = heightInput.value.trim();
      const value = Number(raw);
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (!target) return;
        if (!raw || !Number.isFinite(value) || value <= 0) delete target.textBoxHeight;
        else target.textBoxHeight = Math.max(15, Math.min(2000, value));
      }, "change");
    });
    widthField.append(widthInput);
    heightField.append(heightInput);
    boxRow.append(widthField, heightField);
    section.append(boxRow);
    section.append(el("div", "empty-note small", t("inspector.sizeHelp")));
  }

  if (item.kind === "cloud") {
    const radiusField = el("label", "field");
    radiusField.append(el("span", "field-label", t("inspector.scallopSize")));
    const radius = el("input", "input");
    radius.type = "number";
    radius.min = "2";
    radius.max = "40";
    radius.step = "0.5";
    radius.placeholder = t("common.auto");
    radius.value = item.cloudRadius ? String(item.cloudRadius) : "";
    radius.disabled = locked;
    radius.addEventListener("change", () => {
      const raw = radius.value.trim();
      const value = Number(raw);
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (!target) return;
        if (!raw || !Number.isFinite(value) || value <= 0) delete target.cloudRadius;
        else target.cloudRadius = Math.max(2, Math.min(40, value));
      }, "change");
    });
    radiusField.append(radius);
    section.append(radiusField);
    section.append(el("div", "empty-note small", t("inspector.scallopNote")));
  }

  if (item.kind === "cloud") {
    const fillRow = el("label", "check-row");
    const fillToggle = el("input");
    fillToggle.type = "checkbox";
    fillToggle.checked = Boolean(item.fillColor);
    fillToggle.disabled = locked;
    fillToggle.addEventListener("change", () => {
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (!target) return;
        if (fillToggle.checked) {
          target.fillColor = target.fillColor ?? target.color;
          target.opacity = target.opacity ?? 0.22;
        } else {
          delete target.fillColor;
        }
      }, "change");
    });
    fillRow.append(fillToggle, el("span", "", t("context.fill")));
    section.append(fillRow);

    const fillColorField = el("label", "field");
    fillColorField.append(el("span", "field-label", t("inspector.fillColour")));
    const fillColor = el("input", "color-swatch");
    fillColor.type = "color";
    fillColor.value = item.fillColor ?? item.color;
    fillColor.disabled = !item.fillColor || locked;
    fillColor.addEventListener("change", () => {
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (!target) return;
        target.fillColor = fillColor.value;
        target.opacity = target.opacity ?? 0.22;
      }, "change");
    });
    fillColorField.append(fillColor);
    section.append(fillColorField);

    const opacityField = el("label", "field");
    const opacityHead = el("div", "section-head");
    opacityHead.style.marginBottom = "4px";
    opacityHead.append(el("span", "field-label", t("inspector.fillOpacity")));
    const opacityValue = el("span", "range-value", `${Math.round((item.opacity ?? 0.22) * 100)}%`);
    opacityHead.append(opacityValue);
    const opacityRange = el("input");
    opacityRange.type = "range";
    opacityRange.min = "0";
    opacityRange.max = "100";
    opacityRange.step = "1";
    opacityRange.value = String(Math.round((item.opacity ?? 0.22) * 100));
    opacityRange.disabled = !item.fillColor || locked;
    opacityRange.setAttribute("aria-label", t("inspector.cloudFillOpacity"));
    opacityRange.addEventListener("input", () => {
      opacityValue.textContent = `${opacityRange.value}%`;
    });
    opacityRange.addEventListener("change", () => {
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (target) target.opacity = Number(opacityRange.value) / 100;
      }, "change");
    });
    opacityField.append(opacityHead, opacityRange);
    section.append(opacityField);
    section.append(el("div", "empty-note small", t("inspector.fillNote")));
  }

  if (item.kind === "highlight") {
    const modeField = el("label", "field");
    modeField.append(el("span", "field-label", t("inspector.highlightMode")));
    const mode = el("select", "select");
    mode.append(
      option("stroke", t("tool.pen"), (item.highlightShape ?? "stroke") === "stroke"),
      option("rectangle", t("measureOptions.rectangle"), item.highlightShape === "rectangle"),
      option("polygon", t("context.polygon"), item.highlightShape === "polygon"),
    );
    mode.disabled = locked;
    mode.addEventListener("change", () => {
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (!target) return;
        target.highlightShape = mode.value as "stroke" | "rectangle" | "polygon";
        if (
          (target.highlightShape === "rectangle" && target.points.length > 2) ||
          (target.highlightShape === "polygon" && target.points.length < 3)
        ) {
          const xs = target.points.map((point) => point.x);
          const ys = target.points.map((point) => point.y);
          const min = { x: Math.min(...xs), y: Math.min(...ys) };
          const max = { x: Math.max(...xs), y: Math.max(...ys) };
          target.points =
            target.highlightShape === "rectangle"
              ? [min, max]
              : [min, { x: max.x, y: min.y }, max, { x: min.x, y: max.y }];
        }
      }, "change");
    });
    modeField.append(mode);
    section.append(modeField);
  }

  if (item.kind !== "image" && item.kind !== "symbol") {
    const styleRow = el("div", "field-row");
    const colorField = el("label", "field");
    colorField.append(
      el(
        "span",
        "field-label",
        item.kind === "text" || item.kind === "textbox"
          ? t("inspector.textColour")
          : t("toolFlyout.colour"),
      ),
    );
    const colorInput = el("input", "color-swatch");
    colorInput.type = "color";
    colorInput.value = item.color;
    colorInput.disabled = locked;
    colorInput.addEventListener("change", () => {
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (target) target.color = colorInput.value;
      }, "change");
    });
    colorField.append(colorInput);
    styleRow.append(colorField);

    const sizeField = el("label", "field");
    if (
      item.kind === "text" ||
      item.kind === "textbox" ||
      item.kind === "cloud" ||
      item.kind === "callout" ||
      item.kind === "stamp" ||
      item.kind === "delta"
    ) {
      sizeField.append(el("span", "field-label", t("inspector.textSize")));
      const sizeWrap = el("div", "input-row");
      const size = el("input", "input");
      size.type = "number";
      size.min = "0.5";
      size.max = "300";
      size.step = "0.5";
      size.value = String(item.fontSize ?? 12);
      size.disabled = locked;
      size.setAttribute("aria-label", t("inspector.textSizePoints"));
      size.addEventListener("change", () => {
        const value = Number(size.value);
        if (!Number.isFinite(value) || value <= 0) {
          size.value = String(item.fontSize ?? 12);
          return;
        }
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (target) target.fontSize = Math.max(0.5, Math.min(300, value));
        }, "change");
      });
      sizeWrap.append(size, el("span", "context-unit", "pt"));
      sizeField.append(sizeWrap);
    } else {
      sizeField.append(el("span", "field-label", t("inspector.strokeWidth")));
      const width = el("select", "select");
      for (const value of STROKE_WIDTH_OPTIONS) {
        width.append(
          option(String(value), `${value} pt`, Math.abs(value - item.strokeWidth) < 0.01),
        );
      }
      width.disabled = locked;
      width.addEventListener("change", () => {
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (target) target.strokeWidth = Number(width.value);
        }, "change");
      });
      sizeField.append(width);
    }
    styleRow.append(sizeField);
    section.append(styleRow);

    if (item.kind === "volume") {
      const depthField = el("label", "field");
      depthField.append(el("span", "field-label", t("dialogs.depth.label")));
      const depthWrap = el("div", "input-row");
      const depth = el("input", "input");
      depth.type = "number";
      depth.min = "0.001";
      depth.step = "0.1";
      depth.value = String(item.depth ?? 1);
      depth.disabled = locked;
      depth.setAttribute("aria-label", t("inspector.volumeDepth"));
      depth.addEventListener("change", () => {
        const value = Number(depth.value);
        if (!Number.isFinite(value) || value <= 0) {
          depth.value = String(item.depth ?? 1);
          return;
        }
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (!target) return;
          target.depth = Math.max(0.001, Math.min(1_000_000, value));
          target.updatedAt = new Date().toISOString();
        }, "change");
      });
      depthWrap.append(depth, el("span", "context-unit", project.settings.lengthUnit));
      depthField.append(depthWrap);
      section.append(depthField);
    }

    if (isMeasurementKind(item.kind)) {
      const lineField = el("label", "field");
      lineField.append(el("span", "field-label", t("inspector.lineStyle")));
      const lineStyle = el("select", "select");
      lineStyle.append(
        option("solid", t("inspector.solid"), item.lineStyle !== "dashed"),
        option("dashed", t("inspector.dashed"), item.lineStyle === "dashed"),
      );
      lineStyle.disabled = locked;
      lineStyle.setAttribute("aria-label", t("inspector.measurementLineStyle"));
      lineStyle.title = locked ? t("inspector.unlockLineStyle") : t("inspector.solidOrDashed");
      lineStyle.addEventListener("change", () => {
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (!target) return;
          if (lineStyle.value === "dashed") target.lineStyle = "dashed";
          else delete target.lineStyle;
          target.updatedAt = new Date().toISOString();
        }, "change");
      });
      lineField.append(lineStyle);
      section.append(lineField);
    }
  }

  if (
    item.kind === "text" ||
    item.kind === "textbox" ||
    item.kind === "rect" ||
    item.kind === "ellipse" ||
    item.kind === "image" ||
    item.kind === "symbol"
  ) {
    const rotationField = el("label", "field");
    rotationField.append(el("span", "field-label", t("inspector.rotation")));
    const rotationWrap = el("div", "input-row");
    const rotation = el("input", "input");
    rotation.type = "number";
    rotation.min = "-360";
    rotation.max = "360";
    rotation.step = "1";
    rotation.value = String(Math.round(item.rotation ?? 0));
    rotation.disabled = locked;
    rotation.setAttribute("aria-label", t("inspector.rotationDegrees"));
    rotation.addEventListener("change", () => {
      const value = Number(rotation.value);
      if (!Number.isFinite(value)) {
        rotation.value = String(Math.round(item.rotation ?? 0));
        return;
      }
      const normalized = ((value % 360) + 360) % 360;
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (!target) return;
        if (normalized === 0) delete target.rotation;
        else target.rotation = normalized;
        target.updatedAt = new Date().toISOString();
      }, "change");
    });
    rotationWrap.append(rotation, el("span", "context-unit", "°"));
    rotationField.append(rotationWrap);
    section.append(rotationField);
  }

  const layerField = el("label", "field");
  layerField.append(el("span", "field-label", t("inspector.moveToLayer")));
  const layerSelect = el("select", "select");
  for (const candidate of layersForKind(project, layer.kind)) {
    layerSelect.append(option(candidate.id, candidate.name, candidate.id === layer.id));
  }
  layerSelect.disabled = locked || layersForKind(project, layer.kind).length < 2;
  layerSelect.addEventListener("change", () => {
    store.mutate((project) => {
      moveItemToLayer(project, layer.id, item.id, layerSelect.value);
    }, "change");
    store.setSelection({ layerId: layerSelect.value, itemId: item.id });
  });
  layerField.append(layerSelect);
  section.append(layerField);

  const visibilityRow = el("div", "field-row");
  const visibleToggle = el("button", `toggle${!hidden ? " is-on" : ""}`);
  visibleToggle.type = "button";
  const layerShown = layerVisibleOnPage(layer, item.page);
  visibleToggle.disabled = !layerShown;
  visibleToggle.title = layerShown ? t("inspector.showHideMarkup") : t("inspector.showLayerFirst");
  visibleToggle.innerHTML = `${icon(hidden ? "eyeOff" : "eye", 13)}<span>${hidden ? t("common.hidden") : t("common.visible")}</span>`;
  visibleToggle.addEventListener("click", () => actions.setSelectionVisible(hidden));
  const lockToggle = el("button", `toggle${locked ? " is-on" : ""}`);
  lockToggle.type = "button";
  lockToggle.disabled = layerLockedOnPage(layer, item.page);
  lockToggle.title = layerLockedOnPage(layer, item.page)
    ? t("inspector.unlockLayerFirst")
    : t("inspector.lockUnlockMarkup");
  lockToggle.innerHTML = `${icon(locked ? "lock" : "unlock", 13)}<span>${locked ? t("layer.locked") : t("common.unlocked")}</span>`;
  lockToggle.addEventListener("click", () => actions.setSelectionLocked(!item.locked));
  visibilityRow.append(visibleToggle, lockToggle);
  section.append(visibilityRow);

  const actionsWrap = el("div", "selection-actions");
  const duplicate = el("button", "btn btn-small", t("layer.duplicate"));
  duplicate.type = "button";
  duplicate.disabled = locked;
  duplicate.innerHTML = `${icon("copy", 13)}<span>${t("layer.duplicate")}</span>`;
  duplicate.addEventListener("click", actions.duplicateSelection);
  const remove = el("button", "btn btn-small btn-danger", t("common.delete"));
  remove.type = "button";
  remove.disabled = locked;
  remove.innerHTML = `${icon("trash", 13)}<span>${t("common.delete")}</span>`;
  remove.addEventListener("click", actions.deleteSelection);
  actionsWrap.append(duplicate, remove);
  section.append(actionsWrap);

  return section;
}

function multiSelectionSection(
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
    for (const candidate of layersForKind(project, kind)) {
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
    colorInput.value = commonColor || "#f2a93b";
    colorInput.disabled = lockedCount === resolved.length;
    colorInput.addEventListener("change", () => actions.setSelectionColor(colorInput.value));
    colorField.append(colorInput);
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
  const canShow = resolved.some((entry) => layerVisibleOnPage(entry.layer, entry.item.page));
  const visible = el("button", `toggle${anyVisible ? " is-on" : ""}`);
  visible.type = "button";
  visible.disabled = !anyVisible && !canShow;
  visible.title = visible.disabled ? t("inspector.layersHidden") : "";
  visible.innerHTML = `${icon(anyVisible ? "eye" : "eyeOff", 13)}<span>${anyVisible ? t("common.hide") : t("common.show")}</span>`;
  visible.addEventListener("click", () => actions.setSelectionVisible(!anyVisible));
  const anyUnlocked = resolved.some((entry) => !entry.locked);
  const canUnlock = resolved.some((entry) => !layerLockedOnPage(entry.layer, entry.item.page));
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
