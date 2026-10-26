import { selectionKind } from "../model/selection";
import {
  duplicateLayer,
  itemIsLocked,
  itemIsVisible,
  layerAppliesToPage,
  layerLockedOnPage,
  layerVisibleOnPage,
  layersForKind,
  moveLayer,
  removeLayer,
  setLayerLockedGlobally,
  setLayerLockedOnPage,
  setLayerVisibleGlobally,
  setLayerVisibleOnPage,
  swapLayers,
} from "../model/layers";
import { itemKindLabel, itemLabel, itemMetrics } from "../model/measure";
import type { Layer, LayerKind, MarkupItem, Project } from "../model/types";
import { store } from "../state/store";
import { confirmDialog, textDialog } from "./dialogs";
import { el, escapeHtml } from "./dom";
import { icon } from "./icons";
import { markupIcon } from "./itemIcon";
import type { PanelActions } from "./panels";
import type { PopoverItem } from "./popover";
import { showPopover, showPopoverAt } from "./popover";
import { showSelectionMenuAt } from "./selectionMenu";
import type { ShellRefs } from "./shell";
import { toast } from "./toast";

/**
 * Layers keep their expanded state while the panel re-renders. It is view-only
 * state, so it deliberately stays out of the project file and undo history.
 */
const expandedLayers = new Set<string>();
let lastLayerClick: { id: string; time: number } | null = null;
type LayerScope = "page" | "all";
let layerScope: LayerScope = "page";

export function layerAction(iconName: string, label: string, extraClass = ""): HTMLButtonElement {
  const btn = el("button", `layer-action ${extraClass}`.trim());
  btn.type = "button";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.innerHTML = icon(iconName, 13);
  return btn;
}

function beginInlineRename(row: HTMLElement, name: HTMLElement, layerId: string): void {
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

function scopeItemsFor(layer: Layer, page: number): MarkupItem[] {
  return layerScope === "page" ? layer.items.filter((item) => item.page === page) : layer.items;
}

function layerMenuItems(layerId: string, actions: PanelActions): PopoverItem[] {
  const project = store.project;
  const layer = project?.layers.find((l) => l.id === layerId);
  if (!project || !layer) return [];
  const page = store.ui.page;
  const scopeItems = scopeItemsFor(layer, page);
  const lockedHere = layerLockedOnPage(layer, page);
  const group = project.layers.filter((l) => l.kind === layer.kind);
  const index = group.findIndex((l) => l.id === layerId);
  const expanded = expandedLayers.has(layerId);
  return [
    {
      label: scopeItems.length
        ? `${expanded ? "Collapse" : "Show"} ${scopeItems.length} item${scopeItems.length === 1 ? "" : "s"}${
            layerScope === "page" ? ` on Page ${page}` : ""
          }`
        : layerScope === "page"
          ? `No items on Page ${page}`
          : "No items in this layer",
      icon: expanded ? "chevronDown" : "chevronRight",
      disabled: scopeItems.length === 0,
      action: () => {
        if (expanded) expandedLayers.delete(layerId);
        else expandedLayers.add(layerId);
        actions.refresh();
      },
    },
    { separator: true },
    {
      label: "Rename…",
      icon: "text",
      action: () => {
        void textDialog("Rename layer", "Layer", layer.name, "Layer name").then((value) => {
          if (!value) return;
          store.mutate((project) => {
            const target = project.layers.find((l) => l.id === layerId);
            if (target) target.name = value;
          }, "layers");
        });
      },
    },
    {
      label: "Duplicate",
      icon: "copy",
      action: () => store.mutate((project) => duplicateLayer(project, layerId), "layers"),
    },
    {
      label: `Move selection here (${store.ui.selection.length})`,
      icon: "layers",
      disabled:
        store.ui.selection.length === 0 ||
        selectionKind(project, store.ui.selection) !== layer.kind ||
        lockedHere,
      action: () => actions.moveSelectionToLayer(layerId),
    },
    {
      label: "Move up",
      icon: "up",
      disabled: index <= 0,
      action: () => store.mutate((project) => moveLayer(project, layerId, 1), "layers"),
    },
    {
      label: "Move down",
      icon: "down",
      disabled: index < 0 || index >= group.length - 1,
      action: () => store.mutate((project) => moveLayer(project, layerId, -1), "layers"),
    },
    { separator: true },
    {
      label:
        layerScope === "page"
          ? `Clear ${scopeItems.length} item${scopeItems.length === 1 ? "" : "s"} on Page ${page}`
          : `Clear layer (${layer.items.length} items)`,
      icon: "trash",
      danger: true,
      disabled: scopeItems.length === 0 || lockedHere,
      action: () => {
        void confirmDialog(
          "Clear layer",
          layerScope === "page"
            ? `Remove all ${scopeItems.length} items on Page ${page} from “${layer.name}”? This can be undone.`
            : `Remove all ${layer.items.length} items from “${layer.name}”? This can be undone.`,
          "Clear",
          { danger: true },
        ).then((confirmed) => {
          if (!confirmed) return;
          store.mutate((project) => {
            const target = project.layers.find((l) => l.id === layerId);
            if (!target) return;
            if (layerScope === "page") {
              target.items = target.items.filter((item) => item.page !== page);
            } else {
              target.items = [];
            }
          }, "layers");
        });
      },
    },
    {
      label: "Delete layer",
      icon: "trash",
      danger: true,
      action: () => {
        void confirmDialog(
          "Delete layer",
          `Delete “${layer.name}”${layer.items.length ? ` and its ${layer.items.length} items` : ""}? This can be undone.`,
          "Delete",
          { danger: true },
        ).then((confirmed) => {
          if (!confirmed) return;
          store.mutate((project) => removeLayer(project, layerId), "layers");
          actions.refresh();
        });
      },
    },
  ];
}

function showLayerMenu(anchor: HTMLElement, layerId: string, actions: PanelActions): void {
  showPopover(anchor, layerMenuItems(layerId, actions));
}

function showLayerMenuAt(x: number, y: number, layerId: string, actions: PanelActions): void {
  showPopoverAt(x, y, layerMenuItems(layerId, actions));
}

function buildLayerItems(
  project: Project,
  layer: Layer,
  actions: PanelActions,
  items: MarkupItem[],
): HTMLElement {
  const list = el("div", "layer-items");
  list.id = `layer-items-${layer.id}`;
  list.dataset.layerId = layer.id;
  // Later items paint above earlier ones, so list the topmost item first.
  for (const item of [...items].reverse()) {
    const ref = { layerId: layer.id, itemId: item.id };
    const metrics = itemMetrics(item, project);
    const selected = store.isSelected(ref);
    const itemHidden = !itemIsVisible(item, layer);
    const itemLocked = itemIsLocked(item, layer);
    const deduction = item.kind === "area" && item.areaMode === "subtract";
    const label = itemLabel(item, project);

    const row = el("button", "layer-item-row");
    row.type = "button";
    row.dataset.itemId = item.id;
    row.classList.toggle("is-selected", selected);
    row.classList.toggle("is-hidden", itemHidden);
    row.classList.toggle("is-locked", itemLocked);
    row.classList.toggle("is-deduction", deduction);
    row.title = [
      label,
      itemKindLabel(item.kind),
      deduction ? "Deduction" : "",
      `Page ${item.page}`,
      itemHidden ? "Hidden" : "",
      itemLocked ? "Locked" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    row.setAttribute(
      "aria-label",
      `${itemKindLabel(item.kind)}: ${label}, page ${item.page}${deduction ? ", deduction" : ""}`,
    );

    const iconWrap = el("span", "layer-item-icon");
    iconWrap.innerHTML = icon(markupIcon(item.kind), 12);
    iconWrap.style.color = item.color;
    const name = el("span", "layer-item-label", label);
    const value = el("span", "layer-item-value", metrics?.primary ?? "");
    const page = el("span", "layer-item-page", `p.${item.page}`);
    row.append(iconWrap, name, value, page);

    if (itemLocked) {
      const flag = el("span", "layer-item-flag");
      flag.innerHTML = icon("lock", 10);
      flag.title = "Locked";
      row.append(flag);
    } else if (itemHidden) {
      const flag = el("span", "layer-item-flag");
      flag.innerHTML = icon("eyeOff", 10);
      flag.title = "Hidden";
      row.append(flag);
    }

    row.addEventListener("click", (event) => {
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        if (item.page !== store.ui.page) actions.goToPage(item.page, false);
        store.toggleSelection(ref);
        return;
      }
      actions.navigateToItem(item.page, layer.id, item.id);
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!store.isSelected(ref)) store.setSelection(ref);
      showSelectionMenuAt(event.clientX, event.clientY, actions);
    });

    list.append(row);
  }
  return list;
}

function addLayerRow(refs: ShellRefs): void {
  const page = store.ui.page;
  const addRow = el("div", "layer-add-row");
  const addMeasure = el("button", "btn btn-small", "+ Measure layer");
  addMeasure.type = "button";
  addMeasure.title = `Create on Page ${page}`;
  addMeasure.addEventListener("click", () => {
    store.createLayer("measure");
    toast(`Measurement layer created on Page ${page}.`, "success");
  });
  const addDraw = el("button", "btn btn-small", "+ Drawing layer");
  addDraw.type = "button";
  addDraw.title = `Create on Page ${page}`;
  addDraw.addEventListener("click", () => {
    store.createLayer("draw");
    toast(`Drawing layer created on Page ${page}.`, "success");
  });
  addRow.append(addMeasure, addDraw);
  refs.dockBody.append(addRow);
}

export function renderLayers(refs: ShellRefs, actions: PanelActions): void {
  const project = store.project!;
  const page = store.ui.page;
  const groups: Array<{ kind: LayerKind; title: string; note: string }> = [
    { kind: "draw", title: "Drawing layers", note: "Below measurements" },
    { kind: "measure", title: "Measurement layers", note: "Top of stack" },
  ];

  const scope = el("div", "layer-scope");
  scope.setAttribute("role", "group");
  scope.setAttribute("aria-label", "Layer scope");
  const pageButton = el("button", "layer-scope-btn", "This page");
  pageButton.type = "button";
  pageButton.setAttribute("aria-pressed", String(layerScope === "page"));
  pageButton.classList.toggle("is-active", layerScope === "page");
  pageButton.title = `Show layers used on Page ${page}`;
  pageButton.addEventListener("click", () => {
    layerScope = "page";
    actions.refresh();
  });
  const allButton = el("button", "layer-scope-btn", "All pages");
  allButton.type = "button";
  allButton.setAttribute("aria-pressed", String(layerScope === "all"));
  allButton.classList.toggle("is-active", layerScope === "all");
  allButton.title = "Show every layer and edit global visibility and lock defaults";
  allButton.addEventListener("click", () => {
    layerScope = "all";
    actions.refresh();
  });
  scope.append(pageButton, allButton);
  refs.dockBody.append(scope);

  let draggedId: string | null = null;
  let visibleLayerCount = 0;

  for (const group of groups) {
    const layers = [...layersForKind(project, group.kind)]
      .filter((layer) => layerScope === "all" || layerAppliesToPage(layer, page))
      .reverse();
    visibleLayerCount += layers.length;
    const header = el("div", "layer-group-title");
    const label = el("span", "", group.title);
    label.title = group.note;
    header.append(label, el("span", "count", String(layers.length)));
    refs.dockBody.append(header);

    for (const layer of layers) {
      const scopeItems = scopeItemsFor(layer, page);
      const effectiveVisible =
        layerScope === "page" ? layerVisibleOnPage(layer, page) : layer.visible;
      const effectiveLocked = layerScope === "page" ? layerLockedOnPage(layer, page) : layer.locked;
      const row = el("div", "layer-row");
      row.dataset.layerId = layer.id;
      row.classList.toggle("is-active", layer.id === project.activeLayerId);
      row.classList.toggle("is-hidden", !effectiveVisible);
      row.classList.toggle("is-page-scoped", layerScope === "page");
      row.draggable = true;

      const expanded = expandedLayers.has(layer.id);
      const panelId = `layer-items-${layer.id}`;
      let itemList = expanded ? buildLayerItems(project, layer, actions, scopeItems) : null;

      const disclosure = el("button", "layer-disclosure");
      disclosure.type = "button";
      disclosure.disabled = scopeItems.length === 0;
      disclosure.setAttribute("aria-expanded", String(expanded));
      disclosure.setAttribute("aria-controls", panelId);
      disclosure.setAttribute(
        "aria-label",
        `${expanded ? "Collapse" : "Expand"} ${layer.name}${
          scopeItems.length ? ` (${scopeItems.length} items)` : ""
        }`,
      );
      disclosure.title = scopeItems.length
        ? `${expanded ? "Hide" : "Show"} ${scopeItems.length} item${scopeItems.length === 1 ? "" : "s"}${
            layerScope === "page" ? ` on Page ${page}` : ""
          }`
        : layerScope === "page"
          ? `No items on Page ${page}`
          : "No items in this layer";
      disclosure.innerHTML = icon(expanded ? "chevronDown" : "chevronRight", 12);
      const setExpanded = (open: boolean) => {
        if (open) expandedLayers.add(layer.id);
        else expandedLayers.delete(layer.id);
        disclosure.setAttribute("aria-expanded", String(open));
        disclosure.setAttribute(
          "aria-label",
          `${open ? "Collapse" : "Expand"} ${layer.name} (${scopeItems.length} items)`,
        );
        disclosure.title = `${open ? "Hide" : "Show"} ${scopeItems.length} item${
          scopeItems.length === 1 ? "" : "s"
        }`;
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
        setExpanded(!expandedLayers.has(layer.id));
      });

      const grip = el("span", "layer-grip");
      grip.innerHTML = icon("up", 11);
      grip.title = "Drag to reorder within this group";

      const color = el("input", "layer-color");
      color.type = "color";
      color.value = layer.color;
      color.title = "Layer colour";
      color.addEventListener("click", (event) => event.stopPropagation());
      color.addEventListener("change", () => {
        store.mutate((project) => {
          const target = project.layers.find((l) => l.id === layer.id);
          if (!target) return;
          target.color = color.value;
          for (const item of target.items) item.color = color.value;
        }, "layers");
      });

      const name = el("span", "layer-name", layer.name);
      name.title = `${layer.name} — double-click to rename`;

      const count = el("span", "layer-count", String(scopeItems.length));
      count.title =
        layerScope === "page"
          ? `${scopeItems.length} items on Page ${page}`
          : `${scopeItems.length} items in total`;

      const actionsWrap = el("div", "layer-actions");
      const eye = layerAction(
        effectiveVisible ? "eye" : "eyeOff",
        effectiveVisible ? "Hide layer" : "Show layer",
      );
      eye.title =
        layerScope === "page"
          ? `${effectiveVisible ? "Hide" : "Show"} on Page ${page}`
          : `${effectiveVisible ? "Hide" : "Show"} on all pages`;
      eye.classList.toggle("is-on", effectiveVisible);
      eye.addEventListener("click", (event) => {
        event.stopPropagation();
        store.mutate((project) => {
          const target = project.layers.find((l) => l.id === layer.id);
          if (!target) return;
          if (layerScope === "page") {
            setLayerVisibleOnPage(target, page, !layerVisibleOnPage(target, page));
          } else {
            setLayerVisibleGlobally(target, !target.visible);
          }
        }, "layers");
      });
      const lock = layerAction(
        effectiveLocked ? "lock" : "unlock",
        effectiveLocked ? "Unlock layer" : "Lock layer",
      );
      lock.title =
        layerScope === "page"
          ? `${effectiveLocked ? "Unlock" : "Lock"} on Page ${page}`
          : `${effectiveLocked ? "Unlock" : "Lock"} on all pages`;
      lock.classList.toggle("is-locked", effectiveLocked);
      lock.addEventListener("click", (event) => {
        event.stopPropagation();
        store.mutate((project) => {
          const target = project.layers.find((l) => l.id === layer.id);
          if (!target) return;
          if (layerScope === "page") {
            setLayerLockedOnPage(target, page, !layerLockedOnPage(target, page));
          } else {
            setLayerLockedGlobally(target, !target.locked);
          }
        }, "layers");
      });
      const menu = layerAction("markups", "Layer actions", "layer-menu-btn");
      menu.addEventListener("click", (event) => {
        event.stopPropagation();
        showLayerMenu(menu, layer.id, actions);
      });
      actionsWrap.append(eye, lock, menu);

      row.append(disclosure, grip, color, name, count, actionsWrap);
      row.addEventListener("click", (event) => {
        const target = event.target as HTMLElement | null;
        const now = Date.now();
        const doubleClick =
          lastLayerClick?.id === layer.id &&
          now - lastLayerClick.time < 400 &&
          !target?.closest("button, input, select");
        lastLayerClick = doubleClick ? null : { id: layer.id, time: now };
        if (doubleClick) {
          event.stopPropagation();
          beginInlineRename(row, name, layer.id);
          return;
        }
        store.setActiveLayer(layer.id);
        if (!effectiveVisible) {
          toast(
            layerScope === "page"
              ? `This layer is hidden on Page ${page}. Show it to edit its contents.`
              : "This layer is hidden. Show it to edit its contents.",
            "warning",
          );
        }
      });
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showLayerMenuAt(event.clientX, event.clientY, layer.id, actions);
      });
      row.addEventListener("dragstart", (event) => {
        draggedId = layer.id;
        event.dataTransfer?.setData("text/plain", layer.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        row.classList.add("is-dragging");
      });
      row.addEventListener("dragend", () => {
        draggedId = null;
        row.classList.remove("is-dragging");
      });
      row.addEventListener("dragover", (event) => {
        if (!draggedId || draggedId === layer.id) return;
        const other = project.layers.find((l) => l.id === draggedId);
        if (!other || other.kind !== layer.kind) return;
        event.preventDefault();
        row.classList.add("is-drop-target");
      });
      row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"));
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        row.classList.remove("is-drop-target");
        const sourceId = draggedId ?? event.dataTransfer?.getData("text/plain");
        if (!sourceId || sourceId === layer.id) return;
        store.mutate((project) => {
          swapLayers(project, sourceId, layer.id);
        }, "layers");
      });

      refs.dockBody.append(row);
      if (itemList) refs.dockBody.append(itemList);
    }
  }

  if (layerScope === "page" && visibleLayerCount === 0) {
    const empty = el("div", "empty-note small layer-empty");
    empty.innerHTML = `${icon("layers", 22)}<div>No layers on Page ${page} yet. Create a measurement or drawing layer below.</div>`;
    refs.dockBody.append(empty);
  }

  addLayerRow(refs);

  const active = project.layers.find((l) => l.id === project.activeLayerId);
  if (active) {
    const note = el("div", "empty-note small");
    note.style.paddingTop = "4px";
    const applies = layerScope === "all" || layerAppliesToPage(active, page);
    note.innerHTML = `${icon("info", 14)} Items are created in <strong>${escapeHtml(active.name)}</strong> (${active.kind === "measure" ? "measurement" : "drawing"} layer).${
      applies ? "" : ` It has no items on Page ${page} yet.`
    }`;
    refs.dockBody.append(note);
  }
}
