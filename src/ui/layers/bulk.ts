import { t } from "../../i18n";
import { planLayerDeletion } from "../../features/layerTree";
import {
  removeLayer,
  setLayerLockedGlobally,
  setLayerLockedOnPage,
  setLayerVisibleGlobally,
  setLayerVisibleOnPage,
} from "../../model/layers";
import { pageIdAt } from "../../model/pages";
import type { Layer } from "../../model/types";
import { store } from "../../state/store";
import { confirmDialog } from "../dialogs";
import { el } from "../dom";
import { layerAction } from "../layerAction";
import type { PanelActions } from "../panels";
import type { ShellRefs } from "../shell";
import { layerTreeController } from "./reorder";
import { layerView } from "./state";

/**
 * Bulk actions for the selected layer rows. Visibility, locking and deletion
 * each run inside one `store.mutate`, so a multi-layer action is one undo step.
 * A delete counts every subtree once and asks for confirmation with the real
 * layer and item totals.
 */

/** Layers currently selected in the panel, in project order. */
export function selectedLayers(): Layer[] {
  const project = store.project;
  if (!project) return [];
  const ids = new Set(layerTreeController.selectionIds());
  return project.layers.filter((layer) => ids.has(layer.id));
}

function bulkVisibility(visible: boolean): void {
  const pageId = pageIdAt(store.project!, store.ui.page) ?? "";
  const ids = selectedLayers().map((layer) => layer.id);
  store.mutate((current) => {
    for (const id of ids) {
      const target = current.layers.find((layer) => layer.id === id);
      if (!target) continue;
      if (layerView.scope === "page") setLayerVisibleOnPage(target, pageId, visible);
      else setLayerVisibleGlobally(target, visible);
    }
  }, "layers");
}

function bulkLock(locked: boolean): void {
  const pageId = pageIdAt(store.project!, store.ui.page) ?? "";
  const ids = selectedLayers().map((layer) => layer.id);
  store.mutate((current) => {
    for (const id of ids) {
      const target = current.layers.find((layer) => layer.id === id);
      if (!target) continue;
      if (layerView.scope === "page") setLayerLockedOnPage(target, pageId, locked);
      else setLayerLockedGlobally(target, locked);
    }
  }, "layers");
}

/** Subtree totals for the selection, counting a nested layer once. */
export function selectionDeleteTotals(): { layers: number; items: number; roots: string[] } {
  const project = store.project;
  if (!project) return { layers: 0, items: 0, roots: [] };
  const covered = new Set<string>();
  const roots: string[] = [];
  let items = 0;
  for (const layer of selectedLayers()) {
    if (covered.has(layer.id)) continue;
    const plan = planLayerDeletion(project, layer.id);
    if (!plan) continue;
    roots.push(plan.layerId);
    items += plan.itemCount;
    for (const id of plan.layerIds) covered.add(id);
  }
  return { layers: covered.size, items, roots };
}

function bulkDelete(actions: PanelActions): void {
  const totals = selectionDeleteTotals();
  if (!totals.layers) return;
  void confirmDialog(
    t("layer.bulkDelete"),
    t("layer.bulkDeleteConfirm", { count: totals.layers, items: totals.items }),
    t("layer.deleteAction"),
    { danger: true },
  ).then((confirmed) => {
    if (!confirmed) return;
    store.mutate((current) => {
      for (const id of totals.roots) removeLayer(current, id);
    }, "layers");
    layerTreeController.reset();
    actions.refresh();
  });
}

export function renderLayerBulkBar(refs: ShellRefs, actions: PanelActions): void {
  const selected = selectedLayers();
  if (selected.length < 2) return;
  const bar = el("div", "layer-bulk-bar");
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", t("layer.selectedCount", { count: selected.length }));
  bar.append(el("span", "layer-bulk-count", t("layer.selectedCount", { count: selected.length })));

  const allVisible = selected.every((layer) => layer.visible !== false);
  const visibility = layerAction(
    allVisible ? "eyeOff" : "eye",
    allVisible ? t("layer.bulkHide") : t("layer.bulkShow"),
    "layer-bulk-btn",
  );
  visibility.disabled = store.readOnly;
  visibility.addEventListener("click", () => bulkVisibility(!allVisible));

  const allLocked = selected.every((layer) => layer.locked === true);
  const lock = layerAction(
    allLocked ? "unlock" : "lock",
    allLocked ? t("layer.bulkUnlock") : t("layer.bulkLock"),
    "layer-bulk-btn",
  );
  lock.disabled = store.readOnly;
  lock.addEventListener("click", () => bulkLock(!allLocked));

  const remove = layerAction("trash", t("layer.bulkDelete"), "layer-bulk-btn is-danger");
  remove.disabled = store.readOnly;
  remove.addEventListener("click", () => bulkDelete(actions));

  const clear = el("button", "btn btn-small", t("layer.bulkClear"));
  clear.type = "button";
  clear.addEventListener("click", () => {
    layerTreeController.reset();
    actions.refresh();
  });

  bar.append(visibility, lock, remove, clear);
  refs.dockBody.append(bar);
}
