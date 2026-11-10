import {
  inspectionStatusLabel,
  symbolCategoryLabel,
  symbolCategoryOf,
} from "../../features/schematics/symbols/registry";
import { t } from "../../i18n";
import { formatBytes } from "../../io/platform";
import {
  IMAGE_MODE_LABELS,
  formatImageDimensions,
  imageAssetForItem,
  imageModeOf,
} from "../../model/images";
import { layerLockedOnPage } from "../../model/layers";
import { itemKindLabel, itemNeedsPageScale, itemScaleWarning } from "../../model/measure";
import { el } from "../dom";
import { icon } from "../icons";
import type { InspectorContext } from "./context";
import { pageNumber } from "../../model/pages";

export function appendSummary(section: HTMLElement, context: InspectorContext): void {
  const { project, item, layer, locked, hidden, metrics } = context;
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
        page: pageNumber(project, item.pageId),
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
        layerLockedOnPage(layer, item.pageId)
          ? t("inspector.lockedOnPageMessage", {
              name: layer.name,
              page: pageNumber(project, item.pageId),
            })
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
}
