import { t } from "../../i18n";
import { planLayerDeletion } from "../../features/layerTree";
import {
  deleteLayer,
  setLayersLockedOnPage,
  setLayersVisibleOnPage,
} from "../../model/commands/layers";
import { pageIdAt } from "../../model/pages";
import type { Layer } from "../../model/types";
import { store } from "../../state/store";
import { confirmDialog, targetIdentity } from "../dialogs";
import type { PanelActions } from "../panels";
import { layerTreeController } from "./reorder";

/**
 * Bulk actions for the selected layer rows. Visibility, locking and deletion
 * each run inside one `store.mutate`, so a multi-layer action is one undo step.
 * A delete counts every subtree once and asks for confirmation with the real
 * layer and item totals. The Layers panel exposes these through the section
 * trash button and the row context menu.
 */

/** Layers currently selected in the panel, in project order. */
export function selectedLayers(): Layer[] {
  const project = store.project;
  if (!project) return [];
  const ids = new Set(layerTreeController.selectionIds());
  return project.layers.filter((layer) => ids.has(layer.id));
}

export function selectedLayersVisible(): boolean {
  return selectedLayers().every((layer) => layer.visible !== false);
}

export function selectedLayersLocked(): boolean {
  return selectedLayers().every((layer) => layer.locked === true);
}

export function setSelectedLayersVisible(visible: boolean): void {
  const pageId = pageIdAt(store.project!, store.ui.page) ?? "";
  const ids = selectedLayers().map((layer) => layer.id);
  store.mutate((current) => {
    setLayersVisibleOnPage(current, ids, pageId, visible);
  }, "layers");
}

export function setSelectedLayersLocked(locked: boolean): void {
  const pageId = pageIdAt(store.project!, store.ui.page) ?? "";
  const ids = selectedLayers().map((layer) => layer.id);
  store.mutate((current) => {
    setLayersLockedOnPage(current, ids, pageId, locked);
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

export function deleteSelectedLayers(actions: PanelActions): void {
  const totals = selectionDeleteTotals();
  if (!totals.layers) return;
  const identity = targetIdentity(totals.roots);
  void confirmDialog(
    t("layer.bulkDelete"),
    t("layer.bulkDeleteConfirm", { count: totals.layers, items: totals.items }),
    t("layer.deleteAction"),
    {
      danger: true,
      target: {
        kind: "layer",
        id: identity,
        name: t("layer.selectedCount", { count: totals.layers }),
        resolve: () => {
          const current = store.project;
          if (!current) return null;
          const present = new Set(current.layers.map((layer) => layer.id));
          if (!totals.roots.every((id) => present.has(id))) return null;
          return targetIdentity(totals.roots);
        },
      },
    },
  ).then((confirmed) => {
    if (!confirmed) return;
    store.mutate((current) => {
      for (const id of totals.roots) deleteLayer(current, id);
    }, "layers");
    layerTreeController.reset();
    actions.refresh();
  });
}
