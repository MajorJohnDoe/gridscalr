import { hasClipboard } from "../model/clipboard";
import { itemIsVisible, layersForKind } from "../model/layers";
import { resolveSelection, selectionKind } from "../model/selection";
import { store } from "../state/store";
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
  const canShow = resolved.some((entry) => entry.layer.visible);
  const anyUnlocked = resolved.some((entry) => !entry.locked);
  const canUnlock = resolved.some((entry) => !entry.layer.locked);
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
  if (targets.length > 1) {
    items.push({ separator: true });
    for (const layer of targets) {
      if (resolved.every((entry) => entry.layer.id === layer.id)) continue;
      items.push({
        label: `Move to ${layer.name}`,
        icon: "layers",
        disabled: layer.locked,
        action: () => actions.moveSelectionToLayer(layer.id),
      });
    }
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
