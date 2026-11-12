import { t } from "../../i18n";
import type { LayerTreeRow } from "../../features/layerTree";
import {
  defaultColorForLayer,
  setLayerLockedOnPage,
  setLayerVisibleOnPage,
} from "../../model/layers";
import type { Layer, Project } from "../../model/types";
import { store } from "../../state/store";
import { colorInputValue, setColorInput } from "../colorInput";
import { el } from "../dom";
import { icon } from "../icons";
import { layerAction } from "../layerAction";
import type { PanelActions } from "../panels";
import { toast } from "../toast";
import { matchingItems, scopeItemsFor } from "./filter";
import { showLayerMenu, showLayerMenuAt } from "./menu";
import { layerTreeController } from "./reorder";
import { buildLayerItems } from "./rows";
import { layerView, toggleLayerExpanded } from "./state";

/**
 * One row of the Layers panel tree: indent, expand/collapse control, inherited
 * hidden and locked indicators, and the per-layer actions. Rendering only; the
 * rules live in the layer tree feature and the model. The whole row is the drag
 * surface, including the colour swatch, so a layer can be grabbed anywhere.
 */

export const LAYER_ORDER_HINT_ID = "layer-order-hint";
export const LAYER_MENU_HINT_ID = "layer-menu-hint";

const LAYER_KEYSHORTCUTS = [
  "Alt+ArrowUp",
  "Alt+ArrowDown",
  "Alt+ArrowLeft",
  "Alt+ArrowRight",
  "Alt+Home",
  "Alt+End",
  "Shift+F10",
].join(" ");

function layerOwnVisible(layer: Layer, pageId: string): boolean {
  return layer.pageState?.[pageId]?.visible ?? layer.visible;
}

function layerOwnLocked(layer: Layer, pageId: string): boolean {
  return layer.pageState?.[pageId]?.locked ?? layer.locked;
}

export function layerNameOf(project: Project, layerId: string): string {
  return project.layers.find((layer) => layer.id === layerId)?.name ?? "";
}

function beginInlineRename(name: HTMLElement, layerId: string): void {
  if (store.readOnly) return;
  const input = el("input", "layer-name-input");
  input.value = name.textContent ?? "";
  name.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = (save: boolean) => {
    if (done) return;
    done = true;
    if (save && input.value.trim()) {
      store.mutate((project) => {
        const layer = project.layers.find((l) => l.id === layerId);
        if (layer) layer.name = input.value.trim();
      }, "layers");
    } else {
      store.emit("layers");
    }
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") commit(true);
    if (event.key === "Escape") commit(false);
    event.stopPropagation();
  });
  input.addEventListener("blur", () => commit(true));
  input.addEventListener("click", (event) => event.stopPropagation());
}

/** Visible text plus a named reason for an inherited hidden or locked state. */
function inheritedChips(project: Project, row: LayerTreeRow): HTMLElement[] {
  const chips: HTMLElement[] = [];
  if (row.inheritedHiddenBy) {
    const group = layerNameOf(project, row.inheritedHiddenBy);
    const chip = el("span", "layer-state-chip is-inherited-hidden");
    chip.innerHTML = icon("eyeOff", 10);
    chip.append(el("span", "", t("layer.inheritedHidden", { name: group })));
    chip.title = t("layer.inheritedHiddenTitle", { name: row.layer.name, group });
    chips.push(chip);
  }
  if (row.inheritedLockedBy) {
    const group = layerNameOf(project, row.inheritedLockedBy);
    const chip = el("span", "layer-state-chip is-inherited-locked");
    chip.innerHTML = icon("lock", 10);
    chip.append(el("span", "", t("layer.inheritedLocked", { name: group })));
    chip.title = t("layer.inheritedLockedTitle", { name: row.layer.name, group });
    chips.push(chip);
  }
  return chips;
}

function disclosureLabel(row: LayerTreeRow, expanded: boolean, itemCount: number): string {
  if (!row.hasChildren && itemCount === 0) return t("layer.noItemsOnPage", { page: store.ui.page });
  return t(expanded ? "layer.collapseRow" : "layer.expandRow", {
    name: row.layer.name,
    children: row.descendantCount,
    items: itemCount,
  });
}

export function renderLayerRow(
  project: Project,
  treeRow: LayerTreeRow,
  pageId: string,
  group: HTMLElement,
  actions: PanelActions,
): void {
  const page = store.ui.page;
  const layer = treeRow.layer;
  const pageItems = scopeItemsFor(layer, "page", pageId);
  const searchHits = matchingItems(layer, pageId, layerView.query);
  const searching = Boolean(layerView.query.trim());
  const items = searching && searchHits.length ? searchHits : pageItems;
  const expanded = layerView.expanded.has(layer.id) || (searching && searchHits.length > 0);
  const row = el("div", "layer-row");
  row.dataset.layerId = layer.id;
  row.dataset.layerKind = layer.kind;
  row.dataset.layerDepth = String(treeRow.depth);
  row.style.setProperty("--layer-depth", String(treeRow.depth));
  row.tabIndex = 0;
  row.classList.toggle("is-active", layer.id === project.activeLayerId);
  row.classList.toggle("is-hidden", !treeRow.visible);
  row.classList.toggle("is-inherited-hidden", Boolean(treeRow.inheritedHiddenBy));
  row.classList.toggle("is-inherited-locked", Boolean(treeRow.inheritedLockedBy));
  row.classList.toggle("is-group", treeRow.hasChildren);
  row.draggable = !store.readOnly;
  row.setAttribute("aria-keyshortcuts", LAYER_KEYSHORTCUTS);
  row.setAttribute("aria-describedby", `${LAYER_ORDER_HINT_ID} ${LAYER_MENU_HINT_ID}`);
  if (treeRow.hasChildren) row.setAttribute("aria-expanded", String(expanded));

  const panelId = `layer-items-${layer.id}`;
  const label = disclosureLabel(treeRow, expanded, items.length);
  const disclosure = el("button", "layer-disclosure");
  disclosure.type = "button";
  disclosure.disabled = !treeRow.hasChildren && items.length === 0;
  disclosure.setAttribute("aria-expanded", String(expanded));
  if (items.length) disclosure.setAttribute("aria-controls", panelId);
  disclosure.setAttribute("aria-label", label);
  disclosure.title = label;
  disclosure.innerHTML = icon(expanded ? "chevronDown" : "chevronRight", 12);
  disclosure.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleLayerExpanded(layer.id);
    layerView.focusLayerId = layer.id;
    actions.refresh();
  });

  const fallbackColor = defaultColorForLayer(layer.kind);
  const colorInput = el("input", "layer-color-input");
  colorInput.type = "color";
  colorInput.tabIndex = -1;
  colorInput.setAttribute("aria-hidden", "true");
  const colorValue = setColorInput(colorInput, layer.color, fallbackColor);
  const color = el("span", "layer-color");
  color.setAttribute("role", "button");
  color.tabIndex = 0;
  color.style.background = colorValue;
  color.title = t("layer.colour");
  color.setAttribute("aria-label", t("layer.colour"));
  const colorDisabled = store.readOnly || treeRow.locked;
  color.classList.toggle("is-disabled", colorDisabled);
  color.tabIndex = colorDisabled ? -1 : 0;
  const openColor = (event: Event) => {
    event.stopPropagation();
    if (colorDisabled) return;
    colorInput.click();
  };
  color.addEventListener("click", openColor);
  color.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openColor(event);
  });
  colorInput.addEventListener("change", () => {
    const next = colorInputValue(colorInput, fallbackColor);
    color.style.background = next;
    store.mutate((current) => {
      const target = current.layers.find((l) => l.id === layer.id);
      if (!target) return;
      target.color = next;
      for (const item of target.items) item.color = next;
    }, "layers");
  });

  const name = el("span", "layer-name", layer.name);
  name.title = t("layer.renameTitle", { name: layer.name });

  const count = el("span", "layer-count", String(pageItems.length));
  count.title = t("layer.itemsOnPage", { count: pageItems.length, page });

  const actionsWrap = el("div", "layer-actions");
  const eye = layerAction(
    treeRow.visible ? "eye" : "eyeOff",
    treeRow.visible ? t("layer.show") : t("layer.hide"),
  );
  eye.title = t(treeRow.visible ? "layer.hideOnPage" : "layer.showOnPage", { page });
  if (treeRow.inheritedHiddenBy) {
    const reason = t("layer.inheritedHiddenTitle", {
      name: layer.name,
      group: layerNameOf(project, treeRow.inheritedHiddenBy),
    });
    eye.title = reason;
    eye.setAttribute("aria-label", reason);
  }
  eye.classList.toggle("is-on", treeRow.visible);
  eye.disabled = store.readOnly || Boolean(treeRow.inheritedHiddenBy);
  eye.addEventListener("click", (event) => {
    event.stopPropagation();
    store.mutate((current) => {
      const target = current.layers.find((l) => l.id === layer.id);
      if (target) setLayerVisibleOnPage(target, pageId, !layerOwnVisible(target, pageId));
    }, "layers");
  });
  const lock = layerAction(
    treeRow.locked ? "lock" : "unlock",
    treeRow.locked ? t("layer.unlock") : t("layer.lock"),
  );
  lock.title = t(treeRow.locked ? "layer.unlockOnPage" : "layer.lockOnPage", { page });
  if (treeRow.inheritedLockedBy) {
    const reason = t("layer.inheritedLockedTitle", {
      name: layer.name,
      group: layerNameOf(project, treeRow.inheritedLockedBy),
    });
    lock.title = reason;
    lock.setAttribute("aria-label", reason);
  }
  lock.classList.toggle("is-locked", treeRow.locked);
  lock.disabled = store.readOnly || Boolean(treeRow.inheritedLockedBy);
  lock.addEventListener("click", (event) => {
    event.stopPropagation();
    store.mutate((current) => {
      const target = current.layers.find((l) => l.id === layer.id);
      if (target) setLayerLockedOnPage(target, pageId, !layerOwnLocked(target, pageId));
    }, "layers");
  });
  const menu = layerAction("markups", t("layer.actions"), "layer-menu-btn");
  menu.disabled = store.readOnly;
  menu.addEventListener("click", (event) => {
    event.stopPropagation();
    showLayerMenu(menu, layer.id, actions);
  });
  actionsWrap.append(eye, lock, menu);

  const content = el("span", "layer-row-content");
  content.append(name);
  const chips = inheritedChips(project, treeRow);
  if (chips.length) content.append(...chips);
  if (treeRow.hasChildren) {
    const groupCount = el("span", "layer-group-count", String(treeRow.descendantCount));
    groupCount.title = t("layer.groupChildren", { count: treeRow.descendantCount });
    content.append(groupCount);
  }
  row.append(disclosure, color, colorInput);
  if (treeRow.hasChildren) {
    const folder = el("span", "layer-group-icon");
    folder.innerHTML = icon("folder", 12);
    folder.setAttribute("aria-hidden", "true");
    row.append(folder);
  }
  row.append(content, count, actionsWrap);
  layerTreeController.decorate(row, layer.id);

  const activate = () => {
    if (store.readOnly) return;
    store.setActiveLayer(layer.id);
    if (treeRow.visible) return;
    toast(
      treeRow.inheritedHiddenBy
        ? t("layer.inheritedHiddenTitle", {
            name: layer.name,
            group: layerNameOf(project, treeRow.inheritedHiddenBy),
          })
        : t("layer.hiddenOnPage", { page }),
      "warning",
    );
  };
  row.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, select, [role='button']")) return;
    const now = Date.now();
    const doubleClick =
      layerView.lastClick?.id === layer.id && now - layerView.lastClick.time < 400;
    layerView.lastClick = doubleClick ? null : { id: layer.id, time: now };
    if (doubleClick) {
      event.stopPropagation();
      // The first click re-rendered the panel, so the rename must use the row
      // that is in the document now, not the closure's detached nodes.
      const current = document.querySelector<HTMLElement>(
        `.layer-row[data-layer-id="${CSS.escape(layer.id)}"]`,
      );
      const currentName = current?.querySelector<HTMLElement>(".layer-name");
      if (currentName) beginInlineRename(currentName, layer.id);
      return;
    }
    if (layerTreeController.handleClick(event, layer.id)) {
      activate();
    } else {
      // A range or Ctrl click only changes the selection; repaint so the
      // selected rows and the context menu state follow the new range.
      layerView.focusLayerId = layer.id;
      actions.refresh();
    }
  });
  row.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showLayerMenuAt(event.clientX, event.clientY, layer.id, actions);
  });
  row.addEventListener("dragstart", (event) =>
    layerTreeController.handleDragStart(event, layer.id, row),
  );
  row.addEventListener("dragend", () => layerTreeController.handleDragEnd());
  row.addEventListener("keydown", (event) => {
    if (event.target !== row) return;
    if (event.altKey || event.key === "ArrowLeft" || event.key === "ArrowRight") {
      layerTreeController.handleKeyDown(event, layer.id);
      return;
    }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const rect = row.getBoundingClientRect();
      showLayerMenuAt(rect.left + 24, rect.top + Math.min(rect.height, 44), layer.id, actions);
      return;
    }
    if (event.key === "F2") {
      event.preventDefault();
      event.stopPropagation();
      beginInlineRename(name, layer.id);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  });
  group.append(row);
  if (expanded && items.length) {
    group.append(buildLayerItems(project, layer, actions, items));
  }
}
