import {
  defaultColorForLayer,
  layerAppliesToPage,
  layerLockedOnPage,
  layerVisibleOnPage,
  layersForKind,
  setLayerLockedGlobally,
  setLayerLockedOnPage,
  setLayerVisibleGlobally,
  setLayerVisibleOnPage,
} from "../model/layers";
import { pageIdAt } from "../model/pages";
import type { Layer, LayerKind, Project } from "../model/types";
import { store } from "../state/store";
import { colorInputValue, setColorInput } from "./colorInput";
import { el, escapeHtml } from "./dom";
import { icon } from "./icons";
import { RowNavigator, dragHandle } from "../features/listInteraction";
import { layerAction } from "./layerAction";
import { layerMatchesQuery, scopeItemsFor } from "./layers/filter";
import { showLayerMenu, showLayerMenuAt } from "./layers/menu";
import { detachLayerOrder, layerOrderController } from "./layers/reorder";
import { buildLayerItems } from "./layers/rows";
import {
  collapseAllLayers,
  expandAllLayers,
  layerView,
  setLayerQuery,
  setLayerScope,
  takeLayerFocus,
  toggleLayerExpanded,
} from "./layers/state";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";
import { toast } from "./toast";
import { t } from "../i18n";

/**
 * Layers panel. The list keeps its kind groups and page scope; drag, keyboard
 * movement and selection come from the shared list interaction model, while
 * this file renders the scope switch, the search field, the expansion controls
 * and the rows.
 */

export { layerAction };

export const LAYER_ORDER_HINT_ID = "layer-order-hint";
export const LAYER_MENU_HINT_ID = "layer-menu-hint";
const LAYER_KEYSHORTCUTS = [
  "Alt+ArrowUp",
  "Alt+ArrowDown",
  "Alt+Home",
  "Alt+End",
  "Shift+F10",
].join(" ");

const navigator = new RowNavigator(".layer-row");

function beginInlineRename(row: HTMLElement, name: HTMLElement, layerId: string): void {
  if (store.readOnly) return;
  const input = el("input", "layer-name-input");
  input.value = name.textContent ?? "";
  row.replaceChild(input, name);
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

function layerHints(): HTMLElement[] {
  const order = el("p", "layer-reorder-hint", t("layer.reorderHint"));
  order.id = LAYER_ORDER_HINT_ID;
  const menu = el("p", "layer-reorder-hint", t("layer.menuHint"));
  menu.id = LAYER_MENU_HINT_ID;
  return [order, menu];
}

function scopeButton(label: string, active: boolean, title: string): HTMLButtonElement {
  const button = el("button", "layer-scope-btn", label);
  button.type = "button";
  button.setAttribute("aria-pressed", String(active));
  button.classList.toggle("is-active", active);
  button.title = title;
  return button;
}

function layerToolbar(
  refs: ShellRefs,
  actions: PanelActions,
): {
  expandable: string[];
} {
  const page = store.ui.page;
  const expandable: string[] = [];
  const toolbar = el("div", "layer-toolbar");

  const scope = el("div", "layer-scope");
  scope.setAttribute("role", "group");
  scope.setAttribute("aria-label", t("layer.scope"));
  const pageButton = scopeButton(
    t("layer.thisPage"),
    layerView.scope === "page",
    t("layer.showOnPageTitle", { page }),
  );
  pageButton.dataset.scope = "page";
  pageButton.addEventListener("click", () => {
    setLayerScope("page");
    actions.refresh();
  });
  const allButton = scopeButton(
    t("layer.allPages"),
    layerView.scope === "all",
    t("layer.allPagesHelp"),
  );
  allButton.dataset.scope = "all";
  allButton.addEventListener("click", () => {
    setLayerScope("all");
    actions.refresh();
  });
  scope.append(pageButton, allButton);

  const search = el("input", "input layer-search");
  search.type = "search";
  search.placeholder = t("layer.searchPlaceholder");
  search.value = layerView.query;
  search.setAttribute("aria-label", t("layer.search"));
  search.addEventListener("input", () => {
    setLayerQuery(search.value);
    actions.refresh();
  });

  const collapse = layerAction("chevronsUp", t("list.collapseAll"), "layer-expand-btn");
  collapse.addEventListener("click", () => {
    collapseAllLayers();
    actions.refresh();
  });
  const expand = layerAction("chevronsDown", t("list.expandAll"), "layer-expand-btn");
  expand.addEventListener("click", () => {
    expandAllLayers(expandable);
    actions.refresh();
  });

  const controls = el("div", "layer-toolbar-controls");
  controls.append(collapse, expand);

  toolbar.append(scope, search, controls);
  refs.dockBody.append(toolbar);
  refs.dockBody.append(...layerHints());
  return { expandable };
}

function addLayerRow(refs: ShellRefs): void {
  const page = store.ui.page;
  const addRow = el("div", "layer-add-row");
  const addMeasure = el("button", "btn btn-small", t("layer.addMeasure"));
  addMeasure.type = "button";
  addMeasure.title = t("layer.createOnPage", { page });
  addMeasure.disabled = store.readOnly;
  addMeasure.addEventListener("click", () => {
    store.createLayer("measure");
    toast(t("layer.measurementCreated", { page }), "success");
  });
  const addDraw = el("button", "btn btn-small", t("layer.addDrawing"));
  addDraw.type = "button";
  addDraw.title = t("layer.createOnPage", { page });
  addDraw.disabled = store.readOnly;
  addDraw.addEventListener("click", () => {
    store.createLayer("draw");
    toast(t("layer.drawingCreated", { page }), "success");
  });
  addRow.append(addMeasure, addDraw);
  refs.dockBody.append(addRow);
}

function layerRow(
  project: Project,
  layer: Layer,
  pageId: string,
  group: HTMLElement,
  actions: PanelActions,
  expandable: string[],
): HTMLElement {
  const page = store.ui.page;
  const scopeItems = scopeItemsFor(layer, layerView.scope, pageId);
  const effectiveVisible =
    layerView.scope === "page" ? layerVisibleOnPage(layer, pageId) : layer.visible;
  const effectiveLocked =
    layerView.scope === "page" ? layerLockedOnPage(layer, pageId) : layer.locked;
  if (scopeItems.length) expandable.push(layer.id);
  const row = el("div", "layer-row");
  row.dataset.layerId = layer.id;
  row.dataset.layerKind = layer.kind;
  row.tabIndex = 0;
  row.classList.toggle("is-active", layer.id === project.activeLayerId);
  row.classList.toggle("is-hidden", !effectiveVisible);
  row.classList.toggle("is-page-scoped", layerView.scope === "page");
  row.draggable = !store.readOnly;
  row.setAttribute("aria-keyshortcuts", LAYER_KEYSHORTCUTS);
  row.setAttribute("aria-describedby", `${LAYER_ORDER_HINT_ID} ${LAYER_MENU_HINT_ID}`);

  const expanded = layerView.expanded.has(layer.id);
  const panelId = `layer-items-${layer.id}`;
  let itemList = expanded ? buildLayerItems(project, layer, actions, scopeItems) : null;

  const disclosure = el("button", "layer-disclosure");
  disclosure.type = "button";
  disclosure.disabled = scopeItems.length === 0;
  disclosure.setAttribute("aria-expanded", String(expanded));
  disclosure.setAttribute("aria-controls", panelId);
  disclosure.setAttribute(
    "aria-label",
    scopeItems.length
      ? t(expanded ? "layer.collapseLayer" : "layer.expandLayer", {
          name: layer.name,
          count: scopeItems.length,
        })
      : layerView.scope === "page"
        ? t("layer.noItemsOnPage", { page })
        : t("layer.noItems"),
  );
  disclosure.title = scopeItems.length
    ? layerView.scope === "page"
      ? t("layer.itemsOnPage", { count: scopeItems.length, page })
      : t("layer.itemsTotal", { count: scopeItems.length })
    : layerView.scope === "page"
      ? t("layer.noItemsOnPage", { page })
      : t("layer.noItems");
  disclosure.innerHTML = icon(expanded ? "chevronDown" : "chevronRight", 12);
  const setExpanded = (open: boolean) => {
    if (open && !layerView.expanded.has(layer.id)) toggleLayerExpanded(layer.id);
    if (!open && layerView.expanded.has(layer.id)) toggleLayerExpanded(layer.id);
    disclosure.setAttribute("aria-expanded", String(open));
    disclosure.setAttribute(
      "aria-label",
      t(open ? "layer.collapseLayer" : "layer.expandLayer", {
        name: layer.name,
        count: scopeItems.length,
      }),
    );
    disclosure.title = t(open ? "layer.collapseLayer" : "layer.expandLayer", {
      name: layer.name,
      count: scopeItems.length,
    });
    disclosure.innerHTML = icon(open ? "chevronDown" : "chevronRight", 12);
    if (open) {
      if (!itemList) itemList = buildLayerItems(project, layer, actions, scopeItems);
      if (!itemList.isConnected) row.after(itemList);
    } else {
      itemList?.remove();
    }
  };
  disclosure.addEventListener("click", (event) => {
    event.stopPropagation();
    setExpanded(!layerView.expanded.has(layer.id));
  });

  const grip = dragHandle(t("layer.dragReorder"));

  const color = el("input", "layer-color");
  color.type = "color";
  color.disabled = store.readOnly;
  const fallbackColor = defaultColorForLayer(layer.kind);
  setColorInput(color, layer.color, fallbackColor);
  color.title = t("layer.colour");
  color.addEventListener("click", (event) => event.stopPropagation());
  color.addEventListener("change", () => {
    const next = colorInputValue(color, fallbackColor);
    store.mutate((current) => {
      const target = current.layers.find((l) => l.id === layer.id);
      if (!target) return;
      target.color = next;
      for (const item of target.items) item.color = next;
    }, "layers");
  });

  const name = el("span", "layer-name", layer.name);
  name.title = t("layer.renameTitle", { name: layer.name });

  const count = el("span", "layer-count", String(scopeItems.length));
  count.title =
    layerView.scope === "page"
      ? t("layer.itemsOnPage", { count: scopeItems.length, page })
      : t("layer.itemsTotal", { count: scopeItems.length });

  const actionsWrap = el("div", "layer-actions");
  const eye = layerAction(
    effectiveVisible ? "eye" : "eyeOff",
    effectiveVisible ? t("layer.hide") : t("layer.show"),
  );
  eye.title =
    layerView.scope === "page"
      ? t(effectiveVisible ? "layer.hideOnPage" : "layer.showOnPage", { page })
      : t(effectiveVisible ? "layer.hideAll" : "layer.showAll");
  eye.classList.toggle("is-on", effectiveVisible);
  eye.disabled = store.readOnly;
  eye.addEventListener("click", (event) => {
    event.stopPropagation();
    store.mutate((current) => {
      const target = current.layers.find((l) => l.id === layer.id);
      if (!target) return;
      if (layerView.scope === "page") {
        setLayerVisibleOnPage(target, pageId, !layerVisibleOnPage(target, pageId));
      } else {
        setLayerVisibleGlobally(target, !target.visible);
      }
    }, "layers");
  });
  const lock = layerAction(
    effectiveLocked ? "lock" : "unlock",
    effectiveLocked ? t("layer.unlock") : t("layer.lock"),
  );
  lock.title =
    layerView.scope === "page"
      ? t(effectiveLocked ? "layer.unlockOnPage" : "layer.lockOnPage", { page })
      : t(effectiveLocked ? "layer.unlockAll" : "layer.lockAll");
  lock.classList.toggle("is-locked", effectiveLocked);
  lock.disabled = store.readOnly;
  lock.addEventListener("click", (event) => {
    event.stopPropagation();
    store.mutate((current) => {
      const target = current.layers.find((l) => l.id === layer.id);
      if (!target) return;
      if (layerView.scope === "page") {
        setLayerLockedOnPage(target, pageId, !layerLockedOnPage(target, pageId));
      } else {
        setLayerLockedGlobally(target, !target.locked);
      }
    }, "layers");
  });
  const menu = layerAction("markups", t("layer.actions"), "layer-menu-btn");
  menu.disabled = store.readOnly;
  menu.addEventListener("click", (event) => {
    event.stopPropagation();
    showLayerMenu(menu, layer.id, actions);
  });
  actionsWrap.append(eye, lock, menu);

  row.append(disclosure, grip, color, name, count, actionsWrap);

  const activate = () => {
    if (store.readOnly) return;
    store.setActiveLayer(layer.id);
    if (!effectiveVisible) {
      toast(
        layerView.scope === "page" ? t("layer.hiddenOnPage", { page }) : t("layer.hiddenEdit"),
        "warning",
      );
    }
  };
  row.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const now = Date.now();
    const doubleClick =
      layerView.lastClick?.id === layer.id &&
      now - layerView.lastClick.time < 400 &&
      !target?.closest("button, input, select");
    layerView.lastClick = doubleClick ? null : { id: layer.id, time: now };
    if (doubleClick) {
      event.stopPropagation();
      beginInlineRename(row, name, layer.id);
      return;
    }
    activate();
  });
  row.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showLayerMenuAt(event.clientX, event.clientY, layer.id, actions);
  });
  const controller = layerOrderController(layer.kind);
  row.addEventListener("dragstart", (event) => controller.handleDragStart(event, layer.id, row));
  row.addEventListener("dragend", () => controller.handleDragEnd());
  row.addEventListener("keydown", (event) => {
    if (event.target !== row) return;
    if (event.altKey) {
      controller.handleKeyDown(event, layer.id);
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
      beginInlineRename(row, name, layer.id);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  });
  group.append(row);
  if (itemList) group.append(itemList);
  return row;
}

export function renderLayers(refs: ShellRefs, actions: PanelActions): void {
  const project = store.project!;
  const pageId = pageIdAt(project, store.ui.page) ?? "";
  const groups: Array<{ kind: LayerKind; title: string; note: string }> = [
    { kind: "draw", title: t("layer.drawingLayers"), note: t("layer.belowMeasurements") },
    { kind: "measure", title: t("layer.measurementLayers"), note: t("layer.topOfStack") },
  ];

  const controls = layerToolbar(refs, actions);
  let visibleLayerCount = 0;
  const boundKinds = new Set<LayerKind>();
  for (const group of groups) {
    const layers = [...layersForKind(project, group.kind)]
      .filter((layer) => layerView.scope === "all" || layerAppliesToPage(layer, pageId))
      .filter((layer) => layerMatchesQuery(layer, layerView.scope, pageId, layerView.query))
      .reverse();
    visibleLayerCount += layers.length;
    const groupNode = el("div", "layer-group");
    groupNode.dataset.layerKind = group.kind;
    const header = el("div", "layer-group-title");
    const label = el("span", "", group.title);
    label.title = group.note;
    header.append(label, el("span", "count", String(layers.length)));
    groupNode.append(header);
    for (const layer of layers) {
      layerRow(project, layer, pageId, groupNode, actions, controls.expandable);
    }
    refs.dockBody.append(groupNode);
    if (layers.length) {
      layerOrderController(group.kind).bindList(groupNode, refs.dockBody);
      boundKinds.add(group.kind);
    }
  }
  for (const group of groups) {
    if (!boundKinds.has(group.kind)) detachLayerOrder(group.kind);
  }
  for (const kind of boundKinds) layerOrderController(kind).afterRender();

  const query = layerView.query.trim();
  if (!query && layerView.scope === "page" && visibleLayerCount === 0) {
    const empty = el("div", "empty-note small layer-empty");
    empty.innerHTML = icon("layers", 22);
    empty.append(el("div", "", t("layer.noLayersOnPage", { page: store.ui.page })));
    refs.dockBody.append(empty);
  } else if (query && visibleLayerCount === 0) {
    refs.dockBody.append(el("p", "empty-note small layer-empty", t("layer.noMatches")));
  }
  addLayerRow(refs);

  const active = project.layers.find((layer) => layer.id === project.activeLayerId);
  if (active) {
    const note = el("div", "empty-note small");
    note.style.paddingTop = "4px";
    const applies = layerView.scope === "all" || layerAppliesToPage(active, pageId);
    note.innerHTML = `${icon("info", 14)} ${t("layer.itemsCreatedIn", {
      name: "<strong>" + escapeHtml(active.name) + "</strong>",
      kind: t(active.kind === "measure" ? "layer.measurementLayer" : "layer.drawingLayer"),
    })}${applies ? "" : t("layer.noItemsOnPageSuffix", { page: store.ui.page })}`;
    refs.dockBody.append(note);
  }

  navigator.bind(refs.dockBody);
  const focus = takeLayerFocus();
  if (focus.search) {
    const search = refs.dockBody.querySelector<HTMLInputElement>(".layer-search");
    if (search) {
      search.focus({ preventScroll: true });
      search.setSelectionRange(search.value.length, search.value.length);
    }
  }
  if (focus.scope) {
    refs.dockBody
      .querySelector<HTMLButtonElement>(`.layer-scope-btn[data-scope="${focus.scope}"]`)
      ?.focus({ preventScroll: true });
  }
}
