import { selectionKind } from "../model/selection";
import { duplicateLayer, layersForKind, moveLayer, removeLayer, swapLayers } from "../model/layers";
import { itemKindLabel, itemLabel, itemMetrics } from "../model/measure";
import type { Layer, LayerKind, Project } from "../model/types";
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

function layerMenuItems(layerId: string, actions: PanelActions): PopoverItem[] {
  const project = store.project;
  const layer = project?.layers.find((l) => l.id === layerId);
  if (!project || !layer) return [];
  const group = project.layers.filter((l) => l.kind === layer.kind);
  const index = group.findIndex((l) => l.id === layerId);
  const expanded = expandedLayers.has(layerId);
  return [
    {
      label: layer.items.length
        ? `${expanded ? "Collapse" : "Show"} ${layer.items.length} item${layer.items.length === 1 ? "" : "s"}`
        : "No items in this layer",
      icon: expanded ? "chevronDown" : "chevronRight",
      disabled: layer.items.length === 0,
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
        layer.locked,
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
      label: "Clear layer",
      icon: "trash",
      danger: true,
      disabled: layer.items.length === 0,
      action: () => {
        void confirmDialog(
          "Clear layer",
          `Remove all ${layer.items.length} items from “${layer.name}”? This can be undone.`,
          "Clear",
          { danger: true },
        ).then((confirmed) => {
          if (!confirmed) return;
          store.mutate((project) => {
            const target = project.layers.find((l) => l.id === layerId);
            if (target) target.items = [];
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

function buildLayerItems(project: Project, layer: Layer, actions: PanelActions): HTMLElement {
  const list = el("div", "layer-items");
  list.id = `layer-items-${layer.id}`;
  list.dataset.layerId = layer.id;
  // Later items paint above earlier ones, so list the topmost item first.
  for (const item of [...layer.items].reverse()) {
    const ref = { layerId: layer.id, itemId: item.id };
    const metrics = itemMetrics(item, project);
    const selected = store.isSelected(ref);
    const itemHidden = item.visible === false;
    const itemLocked = item.locked === true;
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
  const addRow = el("div", "layer-add-row");
  const addMeasure = el("button", "btn btn-small", "+ Measure layer");
  addMeasure.type = "button";
  addMeasure.addEventListener("click", () => {
    store.createLayer("measure");
    toast("Measurement layer created.", "success");
  });
  const addDraw = el("button", "btn btn-small", "+ Drawing layer");
  addDraw.type = "button";
  addDraw.addEventListener("click", () => {
    store.createLayer("draw");
    toast("Drawing layer created.", "success");
  });
  addRow.append(addMeasure, addDraw);
  refs.dockBody.append(addRow);
}

export function renderLayers(refs: ShellRefs, actions: PanelActions): void {
  const project = store.project!;
  const groups: Array<{ kind: LayerKind; title: string; note: string }> = [
    { kind: "draw", title: "Drawing layers", note: "Below measurements" },
    { kind: "measure", title: "Measurement layers", note: "Top of stack" },
  ];

  let draggedId: string | null = null;

  for (const group of groups) {
    const layers = [...layersForKind(project, group.kind)].reverse();
    const header = el("div", "layer-group-title");
    const label = el("span", "", group.title);
    label.title = group.note;
    header.append(label, el("span", "count", String(layers.length)));
    refs.dockBody.append(header);

    for (const layer of layers) {
      const row = el("div", "layer-row");
      row.dataset.layerId = layer.id;
      row.classList.toggle("is-active", layer.id === project.activeLayerId);
      row.classList.toggle("is-hidden", !layer.visible);
      row.draggable = true;

      const expanded = expandedLayers.has(layer.id);
      const panelId = `layer-items-${layer.id}`;
      let itemList = expanded ? buildLayerItems(project, layer, actions) : null;

      const disclosure = el("button", "layer-disclosure");
      disclosure.type = "button";
      disclosure.disabled = layer.items.length === 0;
      disclosure.setAttribute("aria-expanded", String(expanded));
      disclosure.setAttribute("aria-controls", panelId);
      disclosure.setAttribute(
        "aria-label",
        `${expanded ? "Collapse" : "Expand"} ${layer.name}${
          layer.items.length ? ` (${layer.items.length} items)` : ""
        }`,
      );
      disclosure.title = layer.items.length
        ? `${expanded ? "Hide" : "Show"} ${layer.items.length} item${layer.items.length === 1 ? "" : "s"}`
        : "No items in this layer";
      disclosure.innerHTML = icon(expanded ? "chevronDown" : "chevronRight", 12);
      const setExpanded = (open: boolean) => {
        if (open) expandedLayers.add(layer.id);
        else expandedLayers.delete(layer.id);
        disclosure.setAttribute("aria-expanded", String(open));
        disclosure.setAttribute(
          "aria-label",
          `${open ? "Collapse" : "Expand"} ${layer.name} (${layer.items.length} items)`,
        );
        disclosure.title = `${open ? "Hide" : "Show"} ${layer.items.length} item${
          layer.items.length === 1 ? "" : "s"
        }`;
        disclosure.innerHTML = icon(open ? "chevronDown" : "chevronRight", 12);
        if (open) {
          if (!itemList) itemList = buildLayerItems(project, layer, actions);
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

      const count = el("span", "layer-count", String(layer.items.length));
      count.title = `${layer.items.length} items`;

      const actionsWrap = el("div", "layer-actions");
      const eye = layerAction(
        layer.visible ? "eye" : "eyeOff",
        layer.visible ? "Hide layer" : "Show layer",
      );
      eye.classList.toggle("is-on", layer.visible);
      eye.addEventListener("click", (event) => {
        event.stopPropagation();
        store.mutate((project) => {
          const target = project.layers.find((l) => l.id === layer.id);
          if (target) target.visible = !target.visible;
        }, "layers");
      });
      const lock = layerAction(
        layer.locked ? "lock" : "unlock",
        layer.locked ? "Unlock layer" : "Lock layer",
      );
      lock.classList.toggle("is-locked", layer.locked);
      lock.addEventListener("click", (event) => {
        event.stopPropagation();
        store.mutate((project) => {
          const target = project.layers.find((l) => l.id === layer.id);
          if (target) target.locked = !target.locked;
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
        if (!layer.visible) toast("This layer is hidden. Show it to edit its contents.", "warning");
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

  addLayerRow(refs);

  const active = project.layers.find((l) => l.id === project.activeLayerId);
  if (active) {
    const note = el("div", "empty-note small");
    note.style.paddingTop = "4px";
    note.innerHTML = `${icon("info", 14)} Items are created in <strong>${escapeHtml(active.name)}</strong> (${active.kind === "measure" ? "measurement" : "drawing"} layer).`;
    refs.dockBody.append(note);
  }
}
