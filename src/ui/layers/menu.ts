import { t } from "../../i18n";
import { selectionKind } from "../../model/selection";
import { duplicateLayer, layerLockedOnPage, moveLayer } from "../../model/layers";
import { buildLayerHierarchy } from "../../model/layerHierarchy";
import { pageIdAt } from "../../model/pages";
import { store } from "../../state/store";
import { confirmDialog, textDialog } from "../dialogs";
import type { PanelActions } from "../panels";
import type { PopoverItem } from "../popover";
import { showPopover, showPopoverAt } from "../popover";
import {
  deleteLayerSubtree,
  duplicateLayerSubtree,
  layerSubtreeSize,
  moveLayerOutOfGroup,
  type LayerTreeRow,
} from "../../features/layerTree";
import {
  deleteSelectedLayers,
  selectedLayers,
  selectedLayersLocked,
  selectedLayersVisible,
  setSelectedLayersLocked,
  setSelectedLayersVisible,
} from "./bulk";
import { visibleLayerRows, scopeItemsFor } from "./filter";
import { layerTreeController } from "./reorder";
import { layerView, toggleLayerExpanded } from "./state";

/**
 * Layer row menu. Items are rebuilt from project data on every open, so the
 * counts and the disabled states describe the current page, search and
 * hierarchy. While several rows are selected, the menu acts on the whole
 * selection instead of the row that was right-clicked.
 */
export function layerMenuItems(layerId: string, actions: PanelActions): PopoverItem[] {
  const project = store.project;
  const layer = project?.layers.find((entry) => entry.id === layerId);
  if (!project || !layer) return [];
  const page = store.ui.page;
  const pageId = pageIdAt(project, page) ?? "";
  const scopeItems = scopeItemsFor(layer, "page", pageId);
  const hierarchy = buildLayerHierarchy(project.layers);
  const lockedHere = layerLockedOnPage(layer, pageId, hierarchy);
  const group = project.layers.filter((entry) => entry.kind === layer.kind);
  const index = group.findIndex((entry) => entry.id === layerId);
  const expanded = layerView.expanded.has(layerId);
  const row: LayerTreeRow | undefined = visibleLayerRows(project, pageId).find(
    (entry) => entry.id === layerId,
  );
  const parentId = hierarchy.parentOfId.get(layerId) ?? null;
  const canExpand = Boolean(row?.hasChildren) || scopeItems.length > 0;
  const items: PopoverItem[] = [
    {
      label: canExpand
        ? t(expanded ? "layer.collapseRow" : "layer.expandRow", {
            name: layer.name,
            children: row?.descendantCount ?? 0,
            items: scopeItems.length,
          })
        : t("layer.noItemsOnPage", { page }),
      icon: expanded ? "chevronDown" : "chevronRight",
      disabled: !canExpand,
      action: () => {
        toggleLayerExpanded(layerId);
        actions.refresh();
      },
    },
    { separator: true },
    {
      label: t("layer.renameAction"),
      icon: "text",
      action: () => {
        void textDialog(
          t("layer.rename"),
          t("layer.layerFallback"),
          layer.name,
          t("layer.name"),
        ).then((value) => {
          if (!value) return;
          store.mutate((current) => {
            const target = current.layers.find((entry) => entry.id === layerId);
            if (target) target.name = value;
          }, "layers");
        });
      },
    },
    {
      label:
        (row?.descendantCount ?? 0) > 0
          ? t("layer.duplicateSubtree", { count: row?.descendantCount ?? 0 })
          : t("layer.duplicate"),
      icon: "copy",
      action: () => {
        store.mutate((current) => {
          const size = layerSubtreeSize(current, layerId);
          if (size.layers > 1) duplicateLayerSubtree(current, layerId);
          else duplicateLayer(current, layerId);
        }, "layers");
      },
    },
    {
      label: t("layer.moveSelection", { count: store.ui.selection.length }),
      icon: "layers",
      disabled:
        store.ui.selection.length === 0 ||
        selectionKind(project, store.ui.selection) !== layer.kind ||
        lockedHere,
      action: () => actions.moveSelectionToLayer(layerId),
    },
    {
      label: t("layer.moveUp"),
      icon: "up",
      disabled: index <= 0,
      action: () => store.mutate((current) => moveLayer(current, layerId, 1), "layers"),
    },
    {
      label: t("layer.moveDown"),
      icon: "down",
      disabled: index < 0 || index >= group.length - 1,
      action: () => store.mutate((current) => moveLayer(current, layerId, -1), "layers"),
    },
    {
      label: t("layer.moveOutOfGroup"),
      icon: "chevronLeft",
      disabled: !parentId || lockedHere,
      action: () => {
        store.mutate((current) => moveLayerOutOfGroup(current, layerId), "layers");
        actions.refresh();
      },
    },
    { separator: true },
    {
      label: t("layer.clearItemsOnPage", { count: scopeItems.length, page }),
      icon: "trash",
      danger: true,
      disabled: scopeItems.length === 0 || lockedHere,
      action: () => {
        void confirmDialog(
          t("layer.clear"),
          t("layer.removeItemsOnPage", {
            count: scopeItems.length,
            page,
            name: layer.name,
          }),
          t("layer.clearAction"),
          { danger: true },
        ).then((confirmed) => {
          if (!confirmed) return;
          store.mutate((current) => {
            const target = current.layers.find((entry) => entry.id === layerId);
            if (target) target.items = target.items.filter((item) => item.pageId !== pageId);
          }, "layers");
        });
      },
    },
    {
      label: t("layer.delete"),
      icon: "trash",
      danger: true,
      action: () => {
        const plan = layerSubtreeSize(project, layerId);
        const children = plan.layers - 1;
        const message =
          children > 0
            ? t("layer.deleteSubtree", {
                name: layer.name,
                children,
                items: plan.items,
              })
            : plan.items
              ? t("layer.deleteWithItems", { name: layer.name, count: plan.items })
              : t("layer.deleteEmpty", { name: layer.name });
        void confirmDialog(t("layer.delete"), message, t("layer.deleteAction"), {
          danger: true,
        }).then((confirmed) => {
          if (!confirmed) return;
          store.mutate((current) => {
            deleteLayerSubtree(current, layerId);
          }, "layers");
          actions.refresh();
        });
      },
    },
  ];
  return store.readOnly ? items.slice(0, 1) : items;
}

/** Menu for a multi-selection: visibility, locking and deletion act on all rows. */
function bulkMenuItems(actions: PanelActions): PopoverItem[] {
  const count = selectedLayers().length;
  const allVisible = selectedLayersVisible();
  const allLocked = selectedLayersLocked();
  return [
    { label: t("layer.selectedCount", { count }), disabled: true },
    { separator: true },
    {
      label: allVisible ? t("layer.bulkHide") : t("layer.bulkShow"),
      icon: allVisible ? "eyeOff" : "eye",
      action: () => setSelectedLayersVisible(!allVisible),
    },
    {
      label: allLocked ? t("layer.bulkUnlock") : t("layer.bulkLock"),
      icon: allLocked ? "unlock" : "lock",
      action: () => setSelectedLayersLocked(!allLocked),
    },
    { separator: true },
    {
      label: t("layer.bulkDelete"),
      icon: "trash",
      danger: true,
      action: () => deleteSelectedLayers(actions),
    },
  ];
}

function menuItemsFor(layerId: string, actions: PanelActions): PopoverItem[] {
  const selected = layerTreeController.selectionIds();
  if (selected.length > 1 && selected.includes(layerId)) return bulkMenuItems(actions);
  return layerMenuItems(layerId, actions);
}

export function showLayerMenu(anchor: HTMLElement, layerId: string, actions: PanelActions): void {
  showPopover(anchor, menuItemsFor(layerId, actions));
}

export function showLayerMenuAt(
  x: number,
  y: number,
  layerId: string,
  actions: PanelActions,
): void {
  showPopoverAt(x, y, menuItemsFor(layerId, actions));
}
