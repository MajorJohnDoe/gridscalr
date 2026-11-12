import { layerAppliesToPage } from "../model/layers";
import { pageIdAt } from "../model/pages";
import type { LayerKind, Project } from "../model/types";
import { store } from "../state/store";
import { el, escapeHtml } from "./dom";
import { icon } from "./icons";
import { RowNavigator } from "../features/listInteraction";
import { layerAction } from "./layerAction";
import { renderLayerBulkBar } from "./layers/bulk";
import { scopeItemsFor, visibleLayerRows } from "./layers/filter";
import { LAYER_MENU_HINT_ID, LAYER_ORDER_HINT_ID, renderLayerRow } from "./layers/layerRow";
import { bindLayerTree, layerTreeController } from "./layers/reorder";
import {
  collapseAllLayers,
  expandAllLayers,
  layerView,
  setLayerQuery,
  setLayerScope,
  takeLayerFocus,
} from "./layers/state";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";
import { t } from "../i18n";

/**
 * Layers panel wiring. The scope switch, the search field, the expansion
 * controls, the bulk bar and the rows are rendered here; the tree rows, the
 * inherited-state rules, the drag and keyboard nesting and the bulk actions
 * live in `src/features/layerTree/` and `./layers/`.
 */

export { layerAction };

export { LAYER_MENU_HINT_ID, LAYER_ORDER_HINT_ID };

const navigator = new RowNavigator(".layer-row");

function layerHints(): HTMLElement[] {
  const order = el("p", "layer-reorder-hint", t("layer.reorderHint"));
  order.id = LAYER_ORDER_HINT_ID;
  const menu = el("p", "layer-reorder-hint", t("layer.menuHint"));
  menu.id = LAYER_MENU_HINT_ID;
  const tree = el("p", "layer-reorder-hint", t("layer.treeHint"));
  return [order, menu, tree];
}

function scopeButton(label: string, active: boolean, title: string): HTMLButtonElement {
  const button = el("button", "layer-scope-btn", label);
  button.type = "button";
  button.setAttribute("aria-pressed", String(active));
  button.classList.toggle("is-active", active);
  button.title = title;
  return button;
}

function layerToolbar(refs: ShellRefs, actions: PanelActions, expandable: string[]): void {
  const page = store.ui.page;
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
  });
  const addDraw = el("button", "btn btn-small", t("layer.addDrawing"));
  addDraw.type = "button";
  addDraw.title = t("layer.createOnPage", { page });
  addDraw.disabled = store.readOnly;
  addDraw.addEventListener("click", () => {
    store.createLayer("draw");
  });
  addRow.append(addMeasure, addDraw);
  refs.dockBody.append(addRow);
}

function activeLayerNote(project: Project, pageId: string, refs: ShellRefs): void {
  const active = project.layers.find((layer) => layer.id === project.activeLayerId);
  if (!active) return;
  const note = el("div", "empty-note small");
  note.style.paddingTop = "4px";
  const applies = layerView.scope === "all" || layerAppliesToPage(active, pageId);
  note.innerHTML = `${icon("info", 14)} ${t("layer.itemsCreatedIn", {
    name: "<strong>" + escapeHtml(active.name) + "</strong>",
    kind: t(active.kind === "measure" ? "layer.measurementLayer" : "layer.drawingLayer"),
  })}${applies ? "" : t("layer.noItemsOnPageSuffix", { page: store.ui.page })}`;
  refs.dockBody.append(note);
}

export function renderLayers(refs: ShellRefs, actions: PanelActions): void {
  const project = store.project!;
  const pageId = pageIdAt(project, store.ui.page) ?? "";
  const groups: Array<{ kind: LayerKind; title: string; note: string }> = [
    { kind: "draw", title: t("layer.drawingLayers"), note: t("layer.belowMeasurements") },
    { kind: "measure", title: t("layer.measurementLayers"), note: t("layer.topOfStack") },
  ];

  const rows = visibleLayerRows(project, pageId);
  const expandable = rows
    .filter(
      (row) => row.hasChildren || scopeItemsFor(row.layer, layerView.scope, pageId).length > 0,
    )
    .map((row) => row.id);
  layerToolbar(refs, actions, expandable);
  renderLayerBulkBar(refs, actions);

  let visibleLayerCount = 0;
  const tree = el("div", "layer-tree");
  for (const group of groups) {
    const kindRows = rows.filter((row) => row.layer.kind === group.kind);
    visibleLayerCount += kindRows.length;
    const groupNode = el("div", "layer-group");
    groupNode.dataset.layerKind = group.kind;
    const header = el("div", "layer-group-title");
    const label = el("span", "", group.title);
    label.title = group.note;
    header.append(label, el("span", "count", String(kindRows.length)));
    groupNode.append(header);
    for (const row of kindRows) renderLayerRow(project, row, pageId, groupNode, actions);
    tree.append(groupNode);
  }
  refs.dockBody.append(tree);
  bindLayerTree(tree, refs.dockBody, actions.refresh);

  const query = layerView.query.trim();
  if (query && visibleLayerCount === 0) {
    refs.dockBody.append(el("p", "empty-note small layer-empty", t("layer.noMatches")));
  } else if (!query && layerView.scope === "page" && visibleLayerCount === 0) {
    const empty = el("div", "empty-note small layer-empty");
    empty.innerHTML = icon("layers", 22);
    empty.append(el("div", "", t("layer.noLayersOnPage", { page: store.ui.page })));
    refs.dockBody.append(empty);
  }
  addLayerRow(refs);
  activeLayerNote(project, pageId, refs);

  navigator.bind(refs.dockBody);
  layerTreeController.afterRender();
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
  if (focus.layerId) {
    refs.dockBody
      .querySelector<HTMLElement>(`.layer-row[data-layer-id="${CSS.escape(focus.layerId)}"]`)
      ?.focus({ preventScroll: true });
  }
}
