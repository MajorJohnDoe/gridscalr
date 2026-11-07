import { t } from "../../i18n";
import { formatBytes } from "../../io/platform";
import {
  formatImageDimensions,
  imageAssetForItem,
  imageModeOf,
  imageOpacity,
} from "../../model/images";
import type { ImageMode } from "../../model/types";
import { el, option } from "../dom";
import type { InspectorContext } from "./context";

export function appendImage(section: HTMLElement, context: InspectorContext): void {
  const { project, item, actions, locked } = context;
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
}
