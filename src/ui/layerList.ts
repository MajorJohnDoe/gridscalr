import { layerAppliesToPage } from "../model/layers";
import { pageIdAt } from "../model/pages";
import type { LayerKind, Project } from "../model/types";
import { store } from "../state/store";
import { el, escapeHtml } from "./dom";
import { icon } from "./icons";
import { RowNavigator } from "../features/listInteraction";
import { layerAction } from "./layerAction";
import { deleteSelectedLayers, selectedLayers } from "./layers/bulk";
import { scopeItemsFor, visibleLayerRows } from "./layers/filter";
import { LAYER_MENU_HINT_ID, LAYER_ORDER_HINT_ID, renderLayerRow } from "./layers/layerRow";
import { bindLayerTree, layerTreeController } from "./layers/reorder";
import {
  collapseAllLayers,
  expandAllLayers,
  layerView,
  setLayerQuery,
  takeLayerFocus,
} from "./layers/state";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";
import { t } from "../i18n";

/**
 * Layers panel wiring. The search field, the expansion controls, the per-kind
 * sections and the rows are rendered here; the tree rows, the inherited-state
 * rules, the drag and keyboard nesting and the bulk actions live in
 * `src/features/layerTree/` and `./layers/`.
 *
 * The panel always shows the layers of the open page. A layer that only exists
 * on another page stays in the project and appears when that page is opened.
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

function layerToolbar(refs: ShellRefs, actions: PanelActions, expandable: string[]): void {
  const toolbar = el("div", "layer-toolbar");

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

  toolbar.append(search, controls);
  refs.dockBody.append(toolbar);
  refs.dockBody.append(...layerHints());
}

function sectionFoot(kind: LayerKind, actions: PanelActions): HTMLElement {
  const foot = el("div", "layer-section-foot");

  const add = layerAction(
    "plus",
    t(kind === "draw" ? "layer.addDrawingTitle" : "layer.addMeasureTitle"),
    "layer-section-add",
  );
  add.disabled = store.readOnly;
  add.addEventListener("click", () => {
    store.createLayer(kind);
  });

  const remove = layerAction("trash", t("layer.bulkDelete"), "layer-section-delete");
  remove.disabled = store.readOnly || selectedLayers().length === 0;
  remove.addEventListener("click", () => deleteSelectedLayers(actions));

  foot.append(add, remove);
  return foot;
}

function activeLayerNote(project: Project, pageId: string, refs: ShellRefs): void {
  const active = project.layers.find((layer) => layer.id === project.activeLayerId);
  if (!active) return;
  const note = el("div", "empty-note small");
  note.style.paddingTop = "4px";
  const applies = layerAppliesToPage(active, pageId);
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
    .filter((row) => row.hasChildren || scopeItemsFor(row.layer, "page", pageId).length > 0)
    .map((row) => row.id);
  layerToolbar(refs, actions, expandable);

  let visibleLayerCount = 0;
  const tree = el("div", "layer-tree");
  const searching = Boolean(layerView.query.trim());
  for (const group of groups) {
    const kindRows = rows.filter((row) => row.layer.kind === group.kind);
    visibleLayerCount += kindRows.length;
    // While a search is active, an empty section is only noise.
    if (searching && kindRows.length === 0) continue;
    const section = el("section", "layer-section");
    section.dataset.layerKind = group.kind;
    const header = el("div", "layer-section-head");
    const label = el("span", "layer-section-title", group.title);
    label.title = group.note;
    header.append(label, el("span", "count", String(kindRows.length)));
    section.append(header);
    const body = el("div", "layer-section-rows");
    for (const row of kindRows) renderLayerRow(project, row, pageId, body, actions);
    section.append(body, sectionFoot(group.kind, actions));
    tree.append(section);
  }
  refs.dockBody.append(tree);
  bindLayerTree(tree, refs.dockBody, actions.refresh);

  if (searching && visibleLayerCount === 0) {
    refs.dockBody.append(el("p", "empty-note small layer-empty", t("layer.noMatches")));
  } else if (!searching && visibleLayerCount === 0) {
    const empty = el("div", "empty-note small layer-empty");
    empty.innerHTML = icon("layers", 22);
    empty.append(el("div", "", t("layer.noLayersOnPage", { page: store.ui.page })));
    refs.dockBody.append(empty);
  }
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
  if (focus.layerId) {
    refs.dockBody
      .querySelector<HTMLElement>(`.layer-row[data-layer-id="${CSS.escape(focus.layerId)}"]`)
      ?.focus({ preventScroll: true });
  }
}
