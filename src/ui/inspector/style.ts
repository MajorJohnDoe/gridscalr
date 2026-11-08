import { t } from "../../i18n";
import { defaultColorForItem, findItem, isMeasurementKind } from "../../model/layers";
import { STROKE_WIDTH_OPTIONS } from "../../model/style";
import { store } from "../../state/store";
import { colorInputValue, setColorInput } from "../colorInput";
import { colorWithEyedropper } from "../colorPicker";
import { el, option } from "../dom";
import type { InspectorContext } from "./context";

export function appendStyle(section: HTMLElement, context: InspectorContext): void {
  const { project, item, locked } = context;
  if (item.kind !== "image" && item.kind !== "symbol") {
    const styleRow = el("div", "field-row");
    const colorField = el("label", "field");
    const colorLabel =
      item.kind === "text" || item.kind === "textbox"
        ? t("inspector.textColour")
        : t("toolFlyout.colour");
    colorField.append(el("span", "field-label", colorLabel));
    const colorInput = el("input", "color-swatch");
    colorInput.type = "color";
    const fallbackColor = defaultColorForItem(item.kind);
    setColorInput(colorInput, item.color, fallbackColor);
    colorInput.disabled = locked;
    colorInput.addEventListener("change", () => {
      const next = colorInputValue(colorInput, fallbackColor);
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (target) target.color = next;
      }, "change");
    });
    colorField.append(colorWithEyedropper(colorInput, colorLabel));
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

    if (item.kind === "rect" || item.kind === "ellipse") {
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
            target.opacity = target.opacity ?? store.ui.style.fillOpacity;
          } else {
            delete target.fillColor;
          }
          target.updatedAt = new Date().toISOString();
        }, "change");
      });
      fillRow.append(fillToggle, el("span", "", t("context.fill")));
      section.append(fillRow);
    }

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

    if (
      isMeasurementKind(item.kind) ||
      item.kind === "polyline" ||
      item.kind === "line" ||
      item.kind === "rect" ||
      item.kind === "ellipse"
    ) {
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
}
