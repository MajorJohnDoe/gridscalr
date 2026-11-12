import {
  LayerTreeController,
  layerAncestorRowIds,
  moveLayersInTree,
} from "../../features/layerTree";
import { store } from "../../state/store";
import { expandLayerIds, focusLayer, layerView, toggleLayerExpanded } from "./state";

/**
 * Host wiring for the Layers panel tree move controller.
 *
 * The panel shares drag, drop-line, keyboard and selection conventions with
 * Pages and Markups, but a tree drop carries a parent and a position instead of
 * one flat insertion index, so the layer controller plans a tree move. Every
 * applied move is one `store.mutate`, which makes a drag or a keyboard move one
 * undo step.
 */

let requestRender: (() => void) | null = null;

export const layerTreeController = new LayerTreeController({
  project: () => store.project,
  canMove: () => !store.readOnly,
  apply: (ids, plan) => {
    // Open the new parent before the mutation renders, so a dragged or keyboard
    // nested layer is visible immediately instead of disappearing into a closed
    // group.
    if (plan.mode === "inside" && store.project) {
      const ancestors = new Set<string>([plan.targetId]);
      for (const id of ids) {
        for (const ancestor of layerAncestorRowIds(store.project, id)) ancestors.add(ancestor);
      }
      expandLayerIds(ancestors);
    }
    let changed = false;
    store.mutate((project) => {
      changed = moveLayersInTree(project, ids, plan);
    }, "layers");
    return changed;
  },
  isExpanded: (layerId) => layerView.expanded.has(layerId),
  setExpanded: (layerId, open) => {
    if (layerView.expanded.has(layerId) === open) return;
    toggleLayerExpanded(layerId);
    focusLayer(layerId);
  },
  requestRender: () => requestRender?.(),
  mime: "application/x-gridscalr-layer-order",
  rowSelector: ".layer-row",
});

export function bindLayerTree(list: HTMLElement, scroll: HTMLElement, refresh: () => void): void {
  requestRender = refresh;
  layerTreeController.bindList(list, scroll);
}

export function detachLayerTree(): void {
  layerTreeController.detach();
  requestRender = null;
}
