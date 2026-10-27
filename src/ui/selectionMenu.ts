import { hasClipboard } from "../model/clipboard";
import { setItemsStatus } from "../model/commands";
import {
  isMeasurementKind,
  itemIsVisible,
  layerLockedOnPage,
  layerVisibleOnPage,
  layersForKind,
} from "../model/layers";
import { resolveSelection, selectionKind } from "../model/selection";
import { INSPECTION_STATUSES, INSPECTION_STATUS_LABELS } from "../model/symbols";
import type { InspectionStatus } from "../model/types";
import { store } from "../state/store";
import { textDialog } from "./dialogs";
import type { PanelActions } from "./panels";
import type { PopoverItem } from "./popover";
import { showPopoverAt } from "./popover";

/** Context menu for the current selection, shared by the canvas and the panels. */
export function showSelectionMenuAt(x: number, y: number, actions: PanelActions): void {
  const project = store.project;
  if (!project) return;
  const refs = store.ui.selection;
  const resolved = resolveSelection(project, refs);
  const kind = selectionKind(project, refs);
  const anyVisible = resolved.some((entry) => itemIsVisible(entry.item, entry.layer));
  const canShow = resolved.some((entry) => layerVisibleOnPage(entry.layer, entry.item.page));
  const anyUnlocked = resolved.some((entry) => !entry.locked);
  const canUnlock = resolved.some((entry) => !layerLockedOnPage(entry.layer, entry.item.page));
  const items: PopoverItem[] = [];

  if (!resolved.length) {
    items.push({
      label: "Paste",
      icon: "copy",
      disabled: !hasClipboard(project),
      action: actions.pasteSelection,
    });
    showPopoverAt(x, y, items);
    return;
  }

  const editableText =
    resolved.length === 1 &&
    (resolved[0].item.kind === "text" ||
      resolved[0].item.kind === "cloud" ||
      resolved[0].item.kind === "callout" ||
      resolved[0].item.kind === "stamp" ||
      resolved[0].item.kind === "delta") &&
    !resolved[0].locked;

  items.push(
    { label: "Copy", icon: "copy", action: actions.copySelection },
    { label: "Cut", icon: "trash", action: actions.cutSelection },
    { label: "Duplicate", icon: "copy", action: actions.duplicateSelection },
  );
  if (editableText) {
    items.push({ label: "Edit text…", icon: "text", action: actions.editSelectedText });
  }
  items.push(
    { separator: true },
    {
      label: anyVisible ? "Hide" : "Show",
      icon: anyVisible ? "eyeOff" : "eye",
      disabled: !anyVisible && !canShow,
      action: () => actions.setSelectionVisible(!anyVisible),
    },
    {
      label: anyUnlocked ? "Lock" : "Unlock",
      icon: anyUnlocked ? "lock" : "unlock",
      disabled: !anyUnlocked && !canUnlock,
      action: () => actions.setSelectionLocked(anyUnlocked),
    },
  );

  const targets = kind ? layersForKind(project, kind) : [];
  const layerChoices = targets.filter(
    (layer) => !resolved.every((entry) => entry.layer.id === layer.id),
  );
  if (layerChoices.length > 1) {
    items.push(
      { separator: true },
      {
        label: "Move to layer",
        icon: "layers",
        children: layerChoices.map((layer) => ({
          label: layer.name,
          disabled: resolved.some((entry) => layerLockedOnPage(layer, entry.item.page)),
          action: () => actions.moveSelectionToLayer(layer.id),
        })),
      },
    );
  }

  const measurements = resolved.filter((entry) => isMeasurementKind(entry.item.kind));
  const symbols = resolved.filter((entry) => entry.item.kind === "symbol");
  const measurementUnlocked = measurements.some((entry) => !entry.locked);
  const symbolUnlocked = symbols.some((entry) => !entry.locked);
  if (measurements.length || symbols.length) items.push({ separator: true });

  if (measurements.length) {
    items.push({
      label: "Set category",
      icon: "folder",
      disabled: !measurementUnlocked,
      children: project.categories.map((category) => ({
        label: category.name,
        action: () => actions.setSelectionCategory(category.id),
      })),
    });
    items.push({
      label: "Set room…",
      icon: "text",
      disabled: !measurementUnlocked,
      action: () => {
        const first = (measurements[0].item.room ?? "").trim();
        const common = measurements.every((entry) => (entry.item.room ?? "").trim() === first)
          ? first
          : "";
        void textDialog(
          "Set room",
          `Apply one room to ${measurements.length} selected measurement${
            measurements.length === 1 ? "" : "s"
          }.`,
          common,
          "Room name",
        ).then((room) => {
          if (room !== null) actions.setSelectionRoom(room);
        });
      },
    });
  }

  if (symbols.length) {
    const setStatus = (status: InspectionStatus | null) => {
      store.mutate((project) => {
        setItemsStatus(project, store.ui.selection, status);
      }, "change");
    };
    items.push({
      label: "Set status",
      icon: "check",
      disabled: !symbolUnlocked,
      children: [
        ...INSPECTION_STATUSES.map((status) => ({
          label: INSPECTION_STATUS_LABELS[status],
          action: () => setStatus(status),
        })),
        { separator: true },
        { label: "Not assessed", action: () => setStatus(null) },
      ],
    });
  }

  items.push(
    { separator: true },
    {
      label: "Delete",
      icon: "trash",
      danger: true,
      disabled: !anyUnlocked,
      action: actions.deleteSelection,
    },
  );
  showPopoverAt(x, y, items);
}
