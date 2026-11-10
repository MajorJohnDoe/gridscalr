import { hasClipboard } from "../model/clipboard";
import { setItemsStatus } from "../model/commands";
import {
  isMeasurementKind,
  itemIsVisible,
  layerLockedOnPage,
  layerVisibleOnPage,
  moveTargetLayers,
} from "../model/layers";
import { resolveSelection, selectionKind } from "../model/selection";
import { INSPECTION_STATUSES, inspectionStatusLabel } from "../model/symbols";
import type { InspectionStatus } from "../model/types";
import { store } from "../state/store";
import { textDialog } from "./dialogs";
import type { PanelActions } from "./panels";
import type { PopoverItem } from "./popover";
import { showPopoverAt } from "./popover";
import { t } from "../i18n";

/** Context menu for the current selection, shared by the canvas and the panels. */
export function showSelectionMenuAt(x: number, y: number, actions: PanelActions): void {
  const project = store.project;
  if (!project) return;
  const refs = store.ui.selection;
  const resolved = resolveSelection(project, refs);
  const kind = selectionKind(project, refs);
  const anyVisible = resolved.some((entry) => itemIsVisible(entry.item, entry.layer));
  const canShow = resolved.some((entry) => layerVisibleOnPage(entry.layer, entry.item.pageId));
  const anyUnlocked = resolved.some((entry) => !entry.locked);
  const canUnlock = resolved.some((entry) => !layerLockedOnPage(entry.layer, entry.item.pageId));
  const items: PopoverItem[] = [];

  if (!resolved.length) {
    items.push({
      label: t("menu.edit.paste"),
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
    { label: t("menu.edit.copy"), icon: "copy", action: actions.copySelection },
    { label: t("menu.edit.cut"), icon: "trash", action: actions.cutSelection },
    { label: t("menu.edit.duplicate"), icon: "copy", action: actions.duplicateSelection },
  );
  if (editableText) {
    items.push({ label: t("selection.editText"), icon: "text", action: actions.editSelectedText });
  }
  if (resolved.length === 1 && resolved[0].item.kind === "rail" && !resolved[0].locked) {
    items.push({
      label: t("inspector.editRail"),
      icon: "settings",
      action: () => actions.editRail(resolved[0].item.id),
    });
  }
  items.push(
    { separator: true },
    {
      label: anyVisible ? t("markups.hideItem") : t("markups.showItem"),
      icon: anyVisible ? "eyeOff" : "eye",
      disabled: !anyVisible && !canShow,
      action: () => actions.setSelectionVisible(!anyVisible),
    },
    {
      label: anyUnlocked ? t("markups.lockItem") : t("markups.unlockItem"),
      icon: anyUnlocked ? "lock" : "unlock",
      disabled: !anyUnlocked && !canUnlock,
      action: () => actions.setSelectionLocked(anyUnlocked),
    },
  );

  const pages = resolved.map((entry) => entry.item.pageId);
  const targets = kind ? moveTargetLayers(project, kind, pages) : [];
  const layerChoices = targets.filter(
    (layer) => !resolved.every((entry) => entry.layer.id === layer.id),
  );
  if (layerChoices.length > 0) {
    items.push(
      { separator: true },
      {
        label: t("selection.moveToLayer"),
        icon: "layers",
        children: layerChoices.map((layer) => ({
          label: layer.name,
          disabled: resolved.some((entry) => layerLockedOnPage(layer, entry.item.pageId)),
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
      label: t("selection.setCategory"),
      icon: "folder",
      disabled: !measurementUnlocked,
      children: project.categories.map((category) => ({
        label: category.name,
        action: () => actions.setSelectionCategory(category.id),
      })),
    });
    items.push({
      label: t("selection.setRoomEllipsis"),
      icon: "text",
      disabled: !measurementUnlocked,
      action: () => {
        const first = (measurements[0].item.room ?? "").trim();
        const common = measurements.every((entry) => (entry.item.room ?? "").trim() === first)
          ? first
          : "";
        void textDialog(
          t("selection.setRoom"),
          t("selection.applyRoom", { count: measurements.length }),
          common,
          t("selection.roomName"),
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
      label: t("selection.setStatus"),
      icon: "check",
      disabled: !symbolUnlocked,
      children: [
        ...INSPECTION_STATUSES.map((status) => ({
          label: inspectionStatusLabel(status),
          action: () => setStatus(status),
        })),
        { separator: true },
        { label: t("selection.notAssessed"), action: () => setStatus(null) },
      ],
    });
  }

  items.push(
    { separator: true },
    {
      label: t("common.delete"),
      icon: "trash",
      danger: true,
      disabled: !anyUnlocked,
      action: actions.deleteSelection,
    },
  );
  showPopoverAt(x, y, items);
}
