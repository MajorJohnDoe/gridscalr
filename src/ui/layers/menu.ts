import { t } from "../../i18n";
import { selectionKind } from "../../model/selection";
import { duplicateLayer, layerLockedOnPage, moveLayer, removeLayer } from "../../model/layers";
import { pageIdAt } from "../../model/pages";
import { store } from "../../state/store";
import { confirmDialog, textDialog } from "../dialogs";
import type { PanelActions } from "../panels";
import type { PopoverItem } from "../popover";
import { showPopover, showPopoverAt } from "../popover";
import { scopeItemsFor } from "./filter";
import { layerView, toggleLayerExpanded } from "./state";

/**
 * Layer row menu. Items are rebuilt from project data on every open, so the
 * counts and the disabled states describe the current page scope and search.
 */
export function layerMenuItems(layerId: string, actions: PanelActions): PopoverItem[] {
  const project = store.project;
  const layer = project?.layers.find((entry) => entry.id === layerId);
  if (!project || !layer) return [];
  const page = store.ui.page;
  const pageId = pageIdAt(project, page) ?? "";
  const scopeItems = scopeItemsFor(layer, layerView.scope, pageId);
  const lockedHere = layerLockedOnPage(layer, pageId);
  const group = project.layers.filter((entry) => entry.kind === layer.kind);
  const index = group.findIndex((entry) => entry.id === layerId);
  const expanded = layerView.expanded.has(layerId);
  const items: PopoverItem[] = [
    {
      label: scopeItems.length
        ? expanded
          ? t("layer.collapseLayer", { name: layer.name, count: scopeItems.length })
          : t("layer.expandLayer", { name: layer.name, count: scopeItems.length })
        : layerView.scope === "page"
          ? t("layer.noItemsOnPage", { page })
          : t("layer.noItems"),
      icon: expanded ? "chevronDown" : "chevronRight",
      disabled: scopeItems.length === 0,
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
      label: t("layer.duplicate"),
      icon: "copy",
      action: () => store.mutate((current) => duplicateLayer(current, layerId), "layers"),
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
    { separator: true },
    {
      label:
        layerView.scope === "page"
          ? t("layer.clearItemsOnPage", { count: scopeItems.length, page })
          : t("layer.clearLayerCount", { count: layer.items.length }),
      icon: "trash",
      danger: true,
      disabled: scopeItems.length === 0 || lockedHere,
      action: () => {
        void confirmDialog(
          t("layer.clear"),
          layerView.scope === "page"
            ? t("layer.removeItemsOnPage", {
                count: scopeItems.length,
                page,
                name: layer.name,
              })
            : t("layer.removeItems", { count: layer.items.length, name: layer.name }),
          t("layer.clearAction"),
          { danger: true },
        ).then((confirmed) => {
          if (!confirmed) return;
          store.mutate((current) => {
            const target = current.layers.find((entry) => entry.id === layerId);
            if (!target) return;
            if (layerView.scope === "page") {
              target.items = target.items.filter((item) => item.pageId !== pageId);
            } else {
              target.items = [];
            }
          }, "layers");
        });
      },
    },
    {
      label: t("layer.delete"),
      icon: "trash",
      danger: true,
      action: () => {
        void confirmDialog(
          t("layer.delete"),
          layer.items.length
            ? t("layer.deleteWithItems", { name: layer.name, count: layer.items.length })
            : t("layer.deleteEmpty", { name: layer.name }),
          t("layer.deleteAction"),
          { danger: true },
        ).then((confirmed) => {
          if (!confirmed) return;
          store.mutate((current) => removeLayer(current, layerId), "layers");
          actions.refresh();
        });
      },
    },
  ];
  return store.readOnly ? items.slice(0, 1) : items;
}

export function showLayerMenu(anchor: HTMLElement, layerId: string, actions: PanelActions): void {
  showPopover(anchor, layerMenuItems(layerId, actions));
}

export function showLayerMenuAt(
  x: number,
  y: number,
  layerId: string,
  actions: PanelActions,
): void {
  showPopoverAt(x, y, layerMenuItems(layerId, actions));
}
