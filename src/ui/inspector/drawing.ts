import { t } from "../../i18n";
import { findItem, resolveItemColor } from "../../model/layers";
import { store } from "../../state/store";
import { colorInputValue, setColorInput } from "../colorInput";
import { colorWithEyedropper } from "../colorPicker";
import { el, option } from "../dom";
import type { InspectorContext } from "./context";

export function appendDrawing(section: HTMLElement, context: InspectorContext): void {
  const { item, actions, locked } = context;
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
    const itemColor = resolveItemColor(item);
    setColorInput(fillColor, item.fillColor ?? itemColor, itemColor);
    fillColor.disabled = !item.fillColor || locked;
    fillColor.addEventListener("change", () => {
      const next = colorInputValue(fillColor, itemColor);
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (!target) return;
        target.fillColor = next;
        target.opacity = target.opacity ?? 0.22;
      }, "change");
    });
    fillColorField.append(colorWithEyedropper(fillColor, t("inspector.fillColour")));
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
}
