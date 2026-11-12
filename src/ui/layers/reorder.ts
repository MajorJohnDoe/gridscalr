import { t } from "../../i18n";
import {
  ListReorderController,
  moveEntries,
  type MoveOutcome,
} from "../../features/listInteraction";
import { layerAppliesToPage, layersForKind, reorderLayerGroup } from "../../model/layers";
import { pageIdAt } from "../../model/pages";
import type { LayerKind } from "../../model/types";
import { store } from "../../state/store";
import { layerMatchesQuery } from "./filter";
import { layerView } from "./state";

/**
 * Drag and keyboard reorder for one layer kind. The shared list controller owns
 * the drop line, autoscroll and the live announcement; the move itself becomes
 * one `reorderLayerGroup` mutation, so a drag is one undo step and hidden
 * page-scoped layers keep their slots.
 */

const LAYER_ORDER_MIME = "application/x-gridscalr-layer-order";

function renderedLayerIds(kind: LayerKind): string[] {
  const project = store.project;
  if (!project) return [];
  const pageId = pageIdAt(project, store.ui.page) ?? "";
  return [...layersForKind(project, kind)]
    .filter((layer) => layerView.scope === "all" || layerAppliesToPage(layer, pageId))
    .filter((layer) => layerMatchesQuery(layer, layerView.scope, pageId, layerView.query))
    .reverse()
    .map((layer) => layer.id);
}

function announce(outcome: MoveOutcome): string {
  return outcome.count > 1
    ? t("layer.reorderedMany", {
        count: outcome.count,
        position: outcome.startIndex + 1,
        last: outcome.startIndex + outcome.count,
        total: outcome.total,
      })
    : t("layer.reorderedOne", { position: outcome.startIndex + 1, total: outcome.total });
}

function createController(kind: LayerKind): ListReorderController<{ id: string }> {
  return new ListReorderController<{ id: string }>({
    rowSelector: ".layer-row",
    rowId: (row) => row.dataset.layerId ?? null,
    entries: () => renderedLayerIds(kind).map((id) => ({ id })),
    canReorder: () => !store.readOnly,
    selectable: false,
    dragMime: LAYER_ORDER_MIME,
    onMove: (ids, insertionIndex, changesOrder) => {
      if (!changesOrder) return;
      const entries = renderedLayerIds(kind).map((id) => ({ id }));
      const next = moveEntries(entries, new Set(ids), insertionIndex).map((entry) => entry.id);
      store.mutate((project) => {
        reorderLayerGroup(project, kind, next);
      }, "layers");
    },
    announce: (_ids, outcome) => announce(outcome),
    dropLineClass: "layer-drop-line",
    dropLabelClass: "layer-drop-label",
    announcerClass: "layer-reorder-announcer",
  });
}

const controllers: Record<LayerKind, ListReorderController<{ id: string }>> = {
  draw: createController("draw"),
  measure: createController("measure"),
};

export function layerOrderController(kind: LayerKind): ListReorderController<{ id: string }> {
  return controllers[kind];
}

/** Detaches a kind whose group is not rendered this pass, for example a search. */
export function detachLayerOrder(kind: LayerKind): void {
  controllers[kind].detach();
}
