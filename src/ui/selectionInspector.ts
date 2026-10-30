import { allRooms, categoryForItem, normalizeRoom } from "../model/categories";
import { COUNT_TYPES, COUNT_TYPE_LABELS } from "../model/countSymbols";
import { STROKE_WIDTH_OPTIONS } from "../model/style";
import {
  INSPECTION_STATUSES,
  INSPECTION_STATUS_LABELS,
  inspectionStatusColor,
  inspectionStatusLabel,
  symbolCategoryLabel,
  symbolCategoryOf,
  symbolName,
} from "../model/symbols";
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
import { LABEL_FIT_LABELS } from "../model/labelLayout";
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

export function selectionSection(
  project: NonNullable<typeof store.project>,
  actions: PanelActions,
): HTMLElement {
  const refs = store.ui.selection;
  if (refs.length > 1) return multiSelectionSection(project, refs, actions);

  const section = el("section", "inspector-section");
  const head = el("div", "section-head");
  head.append(el("h3", "", "Selection"));
  if (refs.length) head.append(el("span", "status-chip is-selected", "Selected"));
  section.append(head);
  const selection = refs[0] ?? null;
  const found = selection ? findItem(project, selection.itemId) : undefined;
  if (!selection || !found) {
    const note = el("div", "empty-note small");
    note.style.padding = "12px 6px";
    note.innerHTML = `${icon("cursor", 18)}<div>Select a markup to edit it. Shift-click or drag a box to select several.</div>`;
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
  } else if (item.kind === "text") {
    card.append(el("div", "selection-secondary", "Text annotation"));
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
      card.append(el("div", "selection-secondary", `${formatBytes(asset.byteSize)} embedded`));
    }
  }
  card.append(
    el(
      "div",
      "selection-secondary",
      `Page ${item.page} · ${layer.name} · ${item.points.length} point${item.points.length === 1 ? "" : "s"}`,
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
          ? `“${layer.name}” is locked on Page ${item.page}. Unlock it to edit this markup.`
          : "This markup is locked. Unlock it below to edit it.",
      ),
    );
  }
  if (hidden) {
    section.append(el("div", "empty-note small", "This markup is hidden."));
  }

  if (metrics && !metrics.scale && itemNeedsPageScale(item)) {
    section.append(
      el(
        "div",
        "empty-note small",
        "This measurement has no scale. Calibrate its page to show real-world values.",
      ),
    );
  }

  if (isMeasurementKind(item.kind)) {
    section.append(
      el(
        "div",
        "empty-note small",
        "Drag the value label to position it freely, or drag the corner handle to resize it. Reset label position and Reset label size return it to automatic placement and the project size.",
      ),
    );
    if (item.labelOffset || item.labelAnchor || item.labelFit) {
      const resetLabel = el("button", "btn btn-small btn-ghost", "Reset label position");
      resetLabel.type = "button";
      resetLabel.disabled = locked;
      resetLabel.title = locked
        ? "Unlock the layer to move or reset this label."
        : "Return the value label to automatic placement";
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
          `Locked inside area: ${LABEL_FIT_LABELS[item.labelFit]}. The size adapts to the available space. Drag the label to release it.`,
        ),
      );
      const release = el("button", "btn btn-small btn-ghost", "Release inside area");
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
    sizeHead.append(el("span", "field-label", "Label size"));
    const sizeValue = el("span", "range-value", `${formatNumber(currentLabelSize, 1)} pt`);
    sizeHead.append(sizeValue);
    const sizeRange = el("input");
    sizeRange.type = "range";
    sizeRange.min = String(LABEL_MIN_SIZE);
    sizeRange.max = String(LABEL_MAX_SIZE);
    sizeRange.step = "0.5";
    sizeRange.value = String(currentLabelSize);
    sizeRange.disabled = locked;
    sizeRange.setAttribute("aria-label", "Measurement label size in points");
    sizeRange.title = "Paper-space label size. The canvas and the PDF export use the same value.";
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
      const resetSize = el("button", "btn btn-small btn-ghost", "Reset label size");
      resetSize.type = "button";
      resetSize.disabled = locked;
      resetSize.title = locked
        ? "Unlock the layer to reset this label."
        : `Follow the project default (${formatNumber(projectLabelSize, 1)} pt)`;
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
      typeField.append(el("span", "field-label", "Object type"));
      const typeSelect = el("select", "select");
      for (const type of COUNT_TYPES) {
        typeSelect.append(
          option(type, COUNT_TYPE_LABELS[type], type === (item.countType ?? "other")),
        );
      }
      typeSelect.disabled = locked;
      typeSelect.title = locked
        ? "Unlock the layer to edit this markup."
        : "Count symbol and label type";
      typeSelect.addEventListener("change", () => {
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (target) target.countType = typeSelect.value as CountType;
        }, "change");
      });
      typeField.append(typeSelect);
      section.append(typeField);
    }

    const categoryField = el("label", "field");
    categoryField.append(el("span", "field-label", "Category"));
    const categorySelect = el("select", "select");
    const currentCategory = categoryForItem(project, item);
    for (const category of project.categories) {
      categorySelect.append(
        option(category.id, category.name, category.id === currentCategory?.id),
      );
    }
    categorySelect.disabled = locked;
    categorySelect.title = locked
      ? "Unlock the layer to edit this markup."
      : "Grouping used by the quantity report";
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
      modeField.append(el("span", "field-label", "Area mode"));
      const modeSelect = el("select", "select");
      modeSelect.append(
        option("add", "Add to area", (item.areaMode ?? "add") === "add"),
        option("subtract", "Deduct from area", item.areaMode === "subtract"),
      );
      modeSelect.disabled = locked;
      modeSelect.title = locked
        ? "Unlock the layer to edit this markup."
        : "Deducted areas are subtracted from their category and room";
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
    roomField.append(el("span", "field-label", "Room"));
    const roomInput = el("input", "input");
    roomInput.type = "text";
    roomInput.value = item.room ?? "";
    roomInput.placeholder = "Optional";
    roomInput.disabled = locked;
    roomInput.title = locked
      ? "Unlock the layer to edit this markup."
      : "Free text; suggestions come from rooms already used in the project";
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
    modeField.append(el("span", "field-label", "Image mode"));
    const modeSelect = el("select", "select");
    modeSelect.append(
      option("background", "Background (below markups)", imageModeOf(item) === "background"),
      option("annotation", "Annotation (in layer order)", imageModeOf(item) === "annotation"),
    );
    modeSelect.disabled = locked;
    modeSelect.title = locked
      ? "Unlock the image to change its mode."
      : "Background images sit above the PDF and below every markup.";
    modeSelect.addEventListener("change", () =>
      actions.setSelectionImageMode(modeSelect.value as ImageMode),
    );
    modeField.append(modeSelect);
    section.append(modeField);

    const opacityField = el("label", "field");
    const opacityHead = el("div", "section-head");
    opacityHead.style.marginBottom = "4px";
    opacityHead.append(el("span", "field-label", "Opacity"));
    const opacityValue = el("span", "range-value", `${Math.round(imageOpacity(item) * 100)}%`);
    opacityHead.append(opacityValue);
    const opacityRange = el("input");
    opacityRange.type = "range";
    opacityRange.min = "0";
    opacityRange.max = "100";
    opacityRange.step = "1";
    opacityRange.value = String(Math.round(imageOpacity(item) * 100));
    opacityRange.disabled = locked;
    opacityRange.setAttribute("aria-label", "Image opacity");
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
      section.append(el("div", "empty-note small", "The embedded image data is missing."));
    }
  }

  const labelField = el("label", "field");
  labelField.append(
    el(
      "span",
      "field-label",
      item.kind === "delta"
        ? "Date (optional)"
        : metrics
          ? "Label (optional)"
          : "List label (optional)",
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
        : (metrics?.primary ?? (item.kind === "text" ? "Text note" : "Label"));
  labelInput.disabled = locked;
  labelInput.title = locked
    ? "Unlock the layer to edit this markup."
    : metrics
      ? "Shown with the measurement on the page."
      : "Used in the Markups list and exports. Press F2 to focus it.";
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
          ? "The date is drawn below the revision triangle."
          : item.kind === "symbol"
            ? "The symbol name is used in the Markups list and exports; it is not drawn on the page."
            : "List labels are export and Markups metadata; they are not drawn on the page.",
      ),
    );
  }

  if (item.kind === "symbol") {
    const statusField = el("label", "field");
    statusField.append(el("span", "field-label", "Status"));
    const statusSelect = el("select", "select");
    statusSelect.append(option("", "Not assessed", !item.status));
    for (const status of INSPECTION_STATUSES) {
      statusSelect.append(option(status, INSPECTION_STATUS_LABELS[status], item.status === status));
    }
    statusSelect.value = item.status ?? "";
    statusSelect.disabled = locked;
    statusSelect.title = locked
      ? "Unlock the layer to edit this status."
      : "Inspection status shown in the Markups list";
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
    section.append(
      el(
        "div",
        "empty-note small",
        "Symbol colour follows its category. Rotate with the handle or the field below.",
      ),
    );
  }

  if (
    item.kind === "text" ||
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
        item.kind === "stamp" ? "Stamp text" : item.kind === "delta" ? "Revision" : "Text",
      ),
    );
    const edit = el("button", "btn btn-small", "Edit text…");
    edit.type = "button";
    edit.disabled = locked;
    edit.addEventListener("click", actions.editSelectedText);
    textField.append(edit);
    section.append(textField);
  }

  if (item.kind === "callout" || item.kind === "cloud") {
    const boxRow = el("div", "field-row");
    const widthField = el("label", "field");
    widthField.append(el("span", "field-label", "Text box width"));
    const widthInput = el("input", "input");
    widthInput.type = "number";
    widthInput.min = "20";
    widthInput.max = "2000";
    widthInput.step = "5";
    widthInput.placeholder = "Auto";
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
    heightField.append(el("span", "field-label", "Text box height"));
    const heightInput = el("input", "input");
    heightInput.type = "number";
    heightInput.min = "15";
    heightInput.max = "2000";
    heightInput.step = "5";
    heightInput.placeholder = "Auto";
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
    section.append(
      el(
        "div",
        "empty-note small",
        "Leave a size empty for automatic sizing based on the text. Font size is set below.",
      ),
    );
  }

  if (item.kind === "cloud") {
    const radiusField = el("label", "field");
    radiusField.append(el("span", "field-label", "Scallop size"));
    const radius = el("input", "input");
    radius.type = "number";
    radius.min = "2";
    radius.max = "40";
    radius.step = "0.5";
    radius.placeholder = "Auto";
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
    section.append(el("div", "empty-note small", "Auto scales the scallops with the cloud size."));
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
    fillRow.append(fillToggle, el("span", "", "Fill"));
    section.append(fillRow);

    const fillColorField = el("label", "field");
    fillColorField.append(el("span", "field-label", "Fill colour"));
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
    opacityHead.append(el("span", "field-label", "Fill opacity"));
    const opacityValue = el("span", "range-value", `${Math.round((item.opacity ?? 0.22) * 100)}%`);
    opacityHead.append(opacityValue);
    const opacityRange = el("input");
    opacityRange.type = "range";
    opacityRange.min = "0";
    opacityRange.max = "100";
    opacityRange.step = "1";
    opacityRange.value = String(Math.round((item.opacity ?? 0.22) * 100));
    opacityRange.disabled = !item.fillColor || locked;
    opacityRange.setAttribute("aria-label", "Cloud fill opacity");
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
    section.append(
      el(
        "div",
        "empty-note small",
        "A 20–30% fill keeps the drawing and text underneath readable. Hatch patterns are not available yet.",
      ),
    );
  }

  if (item.kind === "highlight") {
    const modeField = el("label", "field");
    modeField.append(el("span", "field-label", "Highlight mode"));
    const mode = el("select", "select");
    mode.append(
      option("stroke", "Pen", (item.highlightShape ?? "stroke") === "stroke"),
      option("rectangle", "Rectangle", item.highlightShape === "rectangle"),
      option("polygon", "Polygon", item.highlightShape === "polygon"),
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
    colorField.append(el("span", "field-label", item.kind === "text" ? "Text colour" : "Colour"));
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
      item.kind === "cloud" ||
      item.kind === "callout" ||
      item.kind === "stamp" ||
      item.kind === "delta"
    ) {
      sizeField.append(el("span", "field-label", "Text size"));
      const sizeWrap = el("div", "input-row");
      const size = el("input", "input");
      size.type = "number";
      size.min = "0.5";
      size.max = "300";
      size.step = "0.5";
      size.value = String(item.fontSize ?? 12);
      size.disabled = locked;
      size.setAttribute("aria-label", "Text size in points");
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
      sizeField.append(el("span", "field-label", "Stroke width"));
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
      depthField.append(el("span", "field-label", "Depth"));
      const depthWrap = el("div", "input-row");
      const depth = el("input", "input");
      depth.type = "number";
      depth.min = "0.001";
      depth.step = "0.1";
      depth.value = String(item.depth ?? 1);
      depth.disabled = locked;
      depth.setAttribute("aria-label", "Volume depth");
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
      lineField.append(el("span", "field-label", "Line style"));
      const lineStyle = el("select", "select");
      lineStyle.append(
        option("solid", "Solid", item.lineStyle !== "dashed"),
        option("dashed", "Dashed", item.lineStyle === "dashed"),
      );
      lineStyle.disabled = locked;
      lineStyle.setAttribute("aria-label", "Measurement line style");
      lineStyle.title = locked
        ? "Unlock the layer to change the line style."
        : "Solid or dashed measurement line";
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
    item.kind === "rect" ||
    item.kind === "ellipse" ||
    item.kind === "image" ||
    item.kind === "symbol"
  ) {
    const rotationField = el("label", "field");
    rotationField.append(el("span", "field-label", "Rotation"));
    const rotationWrap = el("div", "input-row");
    const rotation = el("input", "input");
    rotation.type = "number";
    rotation.min = "-360";
    rotation.max = "360";
    rotation.step = "1";
    rotation.value = String(Math.round(item.rotation ?? 0));
    rotation.disabled = locked;
    rotation.setAttribute("aria-label", "Rotation in degrees");
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
  layerField.append(el("span", "field-label", "Move to layer"));
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
  visibleToggle.title = layerShown ? "Show or hide this markup" : "Show the layer first";
  visibleToggle.innerHTML = `${icon(hidden ? "eyeOff" : "eye", 13)}<span>${hidden ? "Hidden" : "Visible"}</span>`;
  visibleToggle.addEventListener("click", () => actions.setSelectionVisible(hidden));
  const lockToggle = el("button", `toggle${locked ? " is-on" : ""}`);
  lockToggle.type = "button";
  lockToggle.disabled = layerLockedOnPage(layer, item.page);
  lockToggle.title = layerLockedOnPage(layer, item.page)
    ? "Unlock the layer first"
    : "Lock or unlock this markup";
  lockToggle.innerHTML = `${icon(locked ? "lock" : "unlock", 13)}<span>${locked ? "Locked" : "Unlocked"}</span>`;
  lockToggle.addEventListener("click", () => actions.setSelectionLocked(!item.locked));
  visibilityRow.append(visibleToggle, lockToggle);
  section.append(visibilityRow);

  const actionsWrap = el("div", "selection-actions");
  const duplicate = el("button", "btn btn-small", "Duplicate");
  duplicate.type = "button";
  duplicate.disabled = locked;
  duplicate.innerHTML = `${icon("copy", 13)}<span>Duplicate</span>`;
  duplicate.addEventListener("click", actions.duplicateSelection);
  const remove = el("button", "btn btn-small btn-danger", "Delete");
  remove.type = "button";
  remove.disabled = locked;
  remove.innerHTML = `${icon("trash", 13)}<span>Delete</span>`;
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
  head.append(el("h3", "", "Selection"));
  head.append(el("span", "status-chip", `${refs.length} items`));
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
        ? `${kind === "measure" ? "Measurement" : "Drawing"} marks`
        : "Mixed measurements and drawings",
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
    section.append(
      el(
        "div",
        "empty-note small",
        "Mixed selections can be styled or hidden together, but moving to a layer requires either only measurements or only drawings.",
      ),
    );
  }

  if (kind) {
    const layerField = el("label", "field");
    layerField.append(el("span", "field-label", "Move to layer"));
    const layerSelect = el("select", "select");
    layerSelect.append(option("", "Choose layer…", true));
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
      categoryField.append(el("span", "field-label", "Category"));
      const categorySelect = el("select", "select");
      categorySelect.append(option("", "Multiple values", !commonCategory));
      for (const category of project.categories) {
        categorySelect.append(option(category.id, category.name, category.id === commonCategory));
      }
      categorySelect.disabled = allLocked;
      categorySelect.setAttribute("aria-label", "Category for selected measurements");
      categorySelect.title = allLocked
        ? "Unlock the selected measurements to edit them."
        : "Apply one category to the selected measurements";
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
      roomField.append(el("span", "field-label", "Room"));
      const roomRow = el("div", "input-row");
      const roomInput = el("input", "input");
      roomInput.type = "text";
      roomInput.value = commonRoom;
      roomInput.placeholder = roomsMatch ? "Set room…" : "Multiple values";
      roomInput.disabled = allLocked;
      roomInput.title = allLocked
        ? "Unlock the selected measurements to edit them."
        : "Set one room for the selected measurements. Leave empty to clear their rooms.";
      roomInput.setAttribute("aria-label", "Room for selected measurements");
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
      const roomButton = el("button", "btn btn-small", "Apply");
      roomButton.type = "button";
      roomButton.disabled = allLocked;
      roomButton.addEventListener("click", applyRoom);
      roomRow.append(roomInput, roomButton);
      roomField.append(roomRow, roomList);
      section.append(roomField);

      const sizeField = el("div", "field");
      sizeField.append(el("span", "field-label", "Label size"));
      const sizeRow = el("div", "input-row");
      const sizeInput = el("input", "input");
      sizeInput.type = "number";
      sizeInput.min = String(LABEL_MIN_SIZE);
      sizeInput.max = String(LABEL_MAX_SIZE);
      sizeInput.step = "0.5";
      sizeInput.placeholder = `Project default (${formatNumber(
        clampLabelSize(project.settings.labelSize),
        1,
      )} pt)`;
      sizeInput.disabled = allLocked;
      sizeInput.title = allLocked
        ? "Unlock the selected measurements to edit them."
        : "Set one paper-space label size for the selected measurements";
      sizeInput.setAttribute("aria-label", "Label size for selected measurements");
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
      const sizeButton = el("button", "btn btn-small", "Apply");
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
        modeField.append(el("span", "field-label", "Area mode"));
        const modeSelect = el("select", "select");
        modeSelect.append(option("", "Multiple values", !commonMode));
        modeSelect.append(
          option("add", "Add to area", commonMode === "add"),
          option("subtract", "Deduct from area", commonMode === "subtract"),
        );
        modeSelect.disabled = allLocked;
        modeSelect.setAttribute("aria-label", "Area mode for selected measurements");
        modeSelect.title = allLocked
          ? "Unlock the selected measurements to edit them."
          : "Apply one area mode to the selected areas";
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
        countField.append(el("span", "field-label", "Object type"));
        const countSelect = el("select", "select");
        countSelect.append(option("", "Multiple values", !commonType));
        for (const type of COUNT_TYPES) {
          countSelect.append(option(type, COUNT_TYPE_LABELS[type], type === commonType));
        }
        countSelect.disabled = allLocked;
        countSelect.setAttribute("aria-label", "Object type for selected counts");
        countSelect.title = allLocked
          ? "Unlock the selected measurements to edit them."
          : "Apply one object type to the selected counts";
        countSelect.addEventListener("change", () => {
          if (countSelect.value) {
            actions.setSelectionCountType(countSelect.value as CountType);
          }
        });
        countField.append(countSelect);
        section.append(countField);
      }

      if (allLocked) {
        section.append(
          el(
            "div",
            "empty-note small",
            "All selected measurements are locked. Unlock them to use bulk edits.",
          ),
        );
      } else if (lockedCount > 0) {
        section.append(
          el("div", "empty-note small", "Locked measurements are skipped by bulk edits."),
        );
      }
    }
  }

  if (allSymbols) {
    const statuses = resolved.map((entry) => entry.item.status ?? "");
    const firstStatus = statuses[0] ?? "";
    const statusesMatch = statuses.every((status) => status === firstStatus);
    const commonStatus = statusesMatch ? firstStatus : "";
    const statusField = el("label", "field");
    statusField.append(el("span", "field-label", "Status"));
    const statusSelect = el("select", "select");
    statusSelect.append(option("", statusesMatch ? "Set status…" : "Multiple values", true));
    for (const status of INSPECTION_STATUSES) {
      statusSelect.append(
        option(status, INSPECTION_STATUS_LABELS[status], status === commonStatus),
      );
    }
    statusSelect.disabled = lockedCount === resolved.length;
    statusSelect.setAttribute("aria-label", "Status for selected symbols");
    statusSelect.title =
      lockedCount === resolved.length
        ? "Unlock the selected symbols to edit them."
        : "Apply one inspection status to the selected symbols";
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
    section.append(
      el(
        "div",
        "empty-note small",
        "Symbol colour follows its category. Use a single symbol selection to change rotation.",
      ),
    );
  }

  if (!containsSymbols) {
    const colorField = el("label", "field");
    colorField.append(el("span", "field-label", "Colour"));
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
    weightField.append(el("span", "field-label", "Line weight"));
    const weightSelect = el("select", "select");
    weightSelect.append(
      option("", commonWeight === null ? "Set line weight…" : `${commonWeight} pt (current)`, true),
    );
    for (const value of STROKE_WIDTH_OPTIONS) {
      weightSelect.append(option(String(value), `${value} pt`, false));
    }
    weightSelect.disabled = lockedCount === resolved.length;
    weightSelect.setAttribute("aria-label", "Line weight for selected items");
    weightSelect.title =
      lockedCount === resolved.length
        ? "Unlock the selected items to change their line weight."
        : "Apply one line weight to the selected items";
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
  visible.title = visible.disabled ? "The layers are hidden" : "";
  visible.innerHTML = `${icon(anyVisible ? "eye" : "eyeOff", 13)}<span>${anyVisible ? "Hide" : "Show"}</span>`;
  visible.addEventListener("click", () => actions.setSelectionVisible(!anyVisible));
  const anyUnlocked = resolved.some((entry) => !entry.locked);
  const canUnlock = resolved.some((entry) => !layerLockedOnPage(entry.layer, entry.item.page));
  const lock = el("button", `toggle${!anyUnlocked ? " is-on" : ""}`);
  lock.type = "button";
  lock.disabled = !anyUnlocked && !canUnlock;
  lock.title = lock.disabled ? "The layers are locked" : "";
  lock.innerHTML = `${icon(anyUnlocked ? "unlock" : "lock", 13)}<span>${anyUnlocked ? "Lock" : "Unlock"}</span>`;
  lock.addEventListener("click", () => actions.setSelectionLocked(anyUnlocked));
  toggles.append(visible, lock);
  section.append(toggles);

  const actionsWrap = el("div", "selection-actions");
  const allLocked = lockedCount === resolved.length;
  const duplicate = el("button", "btn btn-small", "Duplicate");
  duplicate.type = "button";
  duplicate.disabled = allLocked;
  duplicate.innerHTML = `${icon("copy", 13)}<span>Duplicate</span>`;
  duplicate.addEventListener("click", actions.duplicateSelection);
  const remove = el("button", "btn btn-small btn-danger", "Delete");
  remove.type = "button";
  remove.disabled = allLocked;
  remove.innerHTML = `${icon("trash", 13)}<span>Delete</span>`;
  remove.addEventListener("click", actions.deleteSelection);
  actionsWrap.append(duplicate, remove);
  section.append(actionsWrap);

  return section;
}
