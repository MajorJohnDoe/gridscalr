import { t } from "../../i18n";
import { selectionAfterClick } from "../../features/listInteraction";
import { itemIsLocked, itemIsVisible } from "../../model/layers";
import { itemKindLabel, itemLabel, itemMetrics } from "../../model/measure";
import { pageNumber } from "../../model/pages";
import { selectionKey } from "../../model/selection";
import type { Layer, MarkupItem, Project, SelectionRef } from "../../model/types";
import { store } from "../../state/store";
import { el } from "../dom";
import { icon } from "../icons";
import { markupIcon } from "../itemIcon";
import type { PanelActions } from "../panels";
import { showSelectionMenuAt } from "../selectionMenu";
import { layerView } from "./state";

/**
 * Expandable item rows inside a layer. Item rows share the selection model with
 * the Markups table: plain click navigates, Ctrl/Cmd toggles and Shift selects
 * the range between the anchor and the clicked row. Bulk edits consume that
 * selection, so the range is not a second kind of state.
 */

interface ItemEntry {
  id: string;
  ref: SelectionRef;
}

function keyToRef(key: string): SelectionRef {
  const [layerId, itemId] = key.split("\u0000");
  return { layerId, itemId };
}

function renderedItemEntries(): ItemEntry[] {
  return [...document.querySelectorAll<HTMLElement>(".layer-item-row")].flatMap((row) => {
    const layerId = row.dataset.layerId;
    const itemId = row.dataset.itemId;
    if (!layerId || !itemId) return [];
    return [{ id: selectionKey({ layerId, itemId }), ref: { layerId, itemId } }];
  });
}

export function buildLayerItems(
  project: Project,
  layer: Layer,
  actions: PanelActions,
  items: MarkupItem[],
): HTMLElement {
  const list = el("div", "layer-items");
  list.id = `layer-items-${layer.id}`;
  list.dataset.layerId = layer.id;
  // Later items paint above earlier ones, so list the topmost item first.
  for (const item of [...items].reverse()) {
    const ref = { layerId: layer.id, itemId: item.id };
    const key = selectionKey(ref);
    const metrics = itemMetrics(item, project);
    const selected = store.isSelected(ref);
    const itemHidden = !itemIsVisible(item, layer);
    const itemLocked = itemIsLocked(item, layer);
    const deduction = item.kind === "area" && item.areaMode === "subtract";
    const label = itemLabel(item, project);
    const itemPage = pageNumber(project, item.pageId);

    const row = el("button", "layer-item-row");
    row.type = "button";
    row.dataset.itemId = item.id;
    row.dataset.layerId = layer.id;
    row.classList.toggle("is-selected", selected);
    row.classList.toggle("is-hidden", itemHidden);
    row.classList.toggle("is-locked", itemLocked);
    row.classList.toggle("is-deduction", deduction);
    row.title = [
      label,
      itemKindLabel(item.kind),
      deduction ? t("layer.deduction") : "",
      t("layer.itemPageLabel", { page: itemPage }),
      itemHidden ? t("layer.hidden") : "",
      itemLocked ? t("layer.locked") : "",
    ]
      .filter(Boolean)
      .join(" · ");
    row.setAttribute(
      "aria-label",
      t("layer.itemAria", {
        kind: itemKindLabel(item.kind),
        label,
        page: itemPage,
        deduction: deduction ? t("layer.deductionSuffix") : "",
      }),
    );

    const iconWrap = el("span", "layer-item-icon");
    iconWrap.innerHTML = icon(markupIcon(item.kind), 12);
    iconWrap.style.color = item.color;
    const name = el("span", "layer-item-label", label);
    const value = el("span", "layer-item-value", metrics?.primary ?? "");
    const page = el("span", "layer-item-page", `p.${itemPage}`);
    row.append(iconWrap, name, value, page);

    if (itemLocked) {
      const flag = el("span", "layer-item-flag");
      flag.innerHTML = icon("lock", 10);
      flag.title = t("layer.locked");
      row.append(flag);
    } else if (itemHidden) {
      const flag = el("span", "layer-item-flag");
      flag.innerHTML = icon("eyeOff", 10);
      flag.title = t("layer.hidden");
      row.append(flag);
    }

    row.addEventListener("click", (event) => {
      if (event.shiftKey) {
        const entries = renderedItemEntries();
        const current = store.ui.selection.map((entry) => selectionKey(entry));
        const next = selectionAfterClick(entries, current, layerView.itemAnchor, key, "range");
        if (itemPage !== store.ui.page) actions.goToPage(itemPage, false);
        store.setSelectionMany(next.ids.map(keyToRef));
        layerView.itemAnchor = key;
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        if (itemPage !== store.ui.page) actions.goToPage(itemPage, false);
        store.toggleSelection(ref);
        layerView.itemAnchor = key;
        return;
      }
      layerView.itemAnchor = key;
      actions.navigateToItem(item.pageId, layer.id, item.id);
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!store.isSelected(ref)) store.setSelection(ref);
      layerView.itemAnchor = key;
      showSelectionMenuAt(event.clientX, event.clientY, actions);
    });

    list.append(row);
  }
  return list;
}
