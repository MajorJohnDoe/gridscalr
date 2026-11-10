import { t } from "../i18n";
import { applyMeasurementBulkEdit } from "../model/bulkEdit";
import type { MeasurementBulkPatch, MeasurementBulkResult } from "../model/bulkEdit";
import { copyItems, duplicateItems, hasClipboard, pasteItems } from "../model/clipboard";
import { pageIdAt } from "../model/pages";
import {
  deleteItems,
  emptyItemCommandResult,
  setItemsColor,
  setItemsImageMode,
  setItemsLocked,
  setItemsOpacity,
  setItemsStrokeWidth,
  setItemsVisible,
} from "../model/commands";
import {
  findItem,
  isMeasurementKind,
  itemIsLocked,
  layerLockedOnPage,
  layerVisibleOnPage,
  moveItemsToLayer,
} from "../model/layers";
import { resolveSelection } from "../model/selection";
import type { AreaMode, CountType, ImageMode, SelectionRef } from "../model/types";
import { store } from "../state/store";
import { toast } from "../ui/toast";

export function copySelection(): void {
  const project = store.project;
  if (!project || !store.ui.selection.length) return;
  const count = copyItems(project, store.ui.selection);
  if (count) toast(t("app.itemsCopied", { count }), "info");
}
export function cutSelection(): void {
  const project = store.project;
  if (!project || !store.ui.selection.length) return;
  const resolved = resolveSelection(project, store.ui.selection);
  const removable = resolved.filter((entry) => !entry.locked);
  if (!removable.length) {
    toast(t("app.selectedItemLocked"), "warning");
    return;
  }
  const refs = removable.map((entry) => entry.ref);
  const count = copyItems(project, refs);
  if (!count) return;
  let deleted = 0;
  store.mutate((project) => {
    deleted = deleteItems(project, refs).changed;
  }, "change");
  store.clearSelection();
  toast(t("app.itemsCut", { count: deleted }), "success");
}
export function pasteSelection(): void {
  const project = store.project;
  if (!project) return;
  if (!hasClipboard(project)) {
    toast(t("app.clipboardEmpty"), "info");
    return;
  }
  let refs: SelectionRef[] = [];
  store.mutate((project) => {
    const pageId = pageIdAt(project, store.ui.page);
    refs = pageId ? pasteItems(project, pageId) : [];
  }, "change");
  if (!refs.length) {
    toast(t("app.pasteFailed"), "warning");
    return;
  }
  store.setSelectionMany(refs);
  toast(t("app.itemsPasted", { count: refs.length }), "success");
}
export function setSelectionImageMode(mode: ImageMode): void {
  const project = store.project;
  if (!project || !store.ui.selection.length) return;
  const images = resolveSelection(project, store.ui.selection).filter(
    (entry) => entry.item.kind === "image" && entry.item.image,
  );
  if (!images.length) return;
  const editable = images.filter((entry) => !entry.locked);
  if (!editable.length) {
    toast(t("app.selectedImageLocked"), "warning");
    return;
  }
  store.mutate((project) => {
    setItemsImageMode(project, store.ui.selection, mode);
  }, "change");
}
export function setSelectionOpacity(opacity: number): void {
  const project = store.project;
  if (!project || !store.ui.selection.length) return;
  const images = resolveSelection(project, store.ui.selection).filter(
    (entry) => entry.item.kind === "image",
  );
  if (!images.length) return;
  const editable = images.filter((entry) => !entry.locked);
  if (!editable.length) {
    toast(t("app.selectedImageLocked"), "warning");
    return;
  }
  store.mutate((project) => {
    setItemsOpacity(project, store.ui.selection, opacity);
  }, "change");
}
export function duplicateSelection(): void {
  const project = store.project;
  if (!project || !store.ui.selection.length) return;
  const locked = resolveSelection(project, store.ui.selection).every((entry) => entry.locked);
  if (locked) {
    toast(t("app.selectedItemLocked"), "warning");
    return;
  }
  let refs: SelectionRef[] = [];
  store.mutate((project) => {
    refs = duplicateItems(project, store.ui.selection, 12);
  }, "change");
  if (refs.length) store.setSelectionMany(refs);
}
export function moveSelectionToLayer(layerId: string): void {
  const project = store.project;
  if (!project || !store.ui.selection.length) return;
  let result = { moved: 0, skipped: 0, mixedKinds: false };
  store.mutate((project) => {
    result = moveItemsToLayer(project, store.ui.selection, layerId);
  }, "change");
  if (result.mixedKinds) {
    toast(t("app.selectSameKind"), "warning");
    return;
  }
  const refs: SelectionRef[] = [];
  for (const ref of store.ui.selection) {
    const found = findItem(store.project!, ref.itemId);
    if (found) refs.push({ layerId: found.layer.id, itemId: found.item.id });
  }
  store.setSelectionMany(refs);
  if (result.moved) {
    const layer = store.project?.layers.find((candidate) => candidate.id === layerId);
    const moved = t("app.itemsMoved", {
      count: result.moved,
      layer: layer?.name ?? t("app.layerFallback"),
    });
    const skipped = result.skipped ? t("app.lockedSkippedSuffix", { count: result.skipped }) : "";
    toast(`${moved}${skipped}`, result.skipped ? "warning" : "success");
  } else if (result.skipped) {
    toast(t("app.noItemsMoved"), "warning");
  }
}
export function setSelectionVisible(visible: boolean): void {
  const project = store.project;
  if (!project || !store.ui.selection.length) return;
  const resolved = resolveSelection(project, store.ui.selection);
  const targetable = visible
    ? resolved.filter((entry) => layerVisibleOnPage(entry.layer, entry.item.pageId))
    : resolved;
  if (!targetable.length) {
    toast(t("app.layerHiddenShow"), "warning");
    return;
  }
  const result = emptyItemCommandResult();
  store.mutate((project) => {
    Object.assign(result, setItemsVisible(project, store.ui.selection, visible));
  }, "change");
  if (!visible) {
    store.clearSelection();
    toast(t("app.itemsHidden", { count: result.changed }), "info");
  } else {
    const shown = t("app.itemsShown", { count: result.changed });
    const hidden = result.skippedLayerHidden
      ? t("app.layerHiddenSuffix", { count: result.skippedLayerHidden })
      : "";
    toast(`${shown}${hidden}`, result.skippedLayerHidden ? "warning" : "success");
  }
}
export function setSelectionLocked(locked: boolean): void {
  const project = store.project;
  if (!project || !store.ui.selection.length) return;
  const resolved = resolveSelection(project, store.ui.selection);
  const targetable = locked
    ? resolved
    : resolved.filter((entry) => !layerLockedOnPage(entry.layer, entry.item.pageId));
  if (!targetable.length) {
    toast(t("app.layerLockedUnlock"), "warning");
    return;
  }
  const result = emptyItemCommandResult();
  store.mutate((project) => {
    Object.assign(result, setItemsLocked(project, store.ui.selection, locked));
  }, "change");
  if (locked) {
    toast(t("app.itemsLocked", { count: result.changed }), "success");
  } else {
    const unlocked = t("app.itemsUnlocked", { count: result.changed });
    const stillLocked = result.skippedLayerLocked
      ? t("app.layerLockedSuffix", { count: result.skippedLayerLocked })
      : "";
    toast(`${unlocked}${stillLocked}`, result.skippedLayerLocked ? "warning" : "success");
  }
}
export function setSelectionStrokeWidth(width: number): void {
  const project = store.project;
  if (!project || !store.ui.selection.length) return;
  if (!Number.isFinite(width) || width <= 0) return;
  const resolved = resolveSelection(project, store.ui.selection);
  const editable = resolved.filter((entry) => !entry.locked);
  if (!editable.length) {
    toast(t("app.selectedItemsLocked"), "warning");
    return;
  }
  store.mutate((project) => {
    setItemsStrokeWidth(project, store.ui.selection, width);
  }, "change");
}
export function setSelectionColor(color: string): void {
  const project = store.project;
  if (!project || !store.ui.selection.length) return;
  const resolved = resolveSelection(project, store.ui.selection);
  const editable = resolved.filter((entry) => !entry.locked);
  if (!editable.length) {
    toast(t("app.selectedItemLocked"), "warning");
    return;
  }
  store.mutate((project) => {
    setItemsColor(project, store.ui.selection, color);
  }, "change");
}
export function bulkEditMeasurementSelection(patch: MeasurementBulkPatch): void {
  const project = store.project;
  if (!project || !store.ui.selection.length) return;
  const editable = resolveSelection(project, store.ui.selection).filter(
    (entry) => isMeasurementKind(entry.item.kind) && !itemIsLocked(entry.item, entry.layer),
  );
  if (!editable.length) {
    toast(t("app.selectedMeasurementsLocked"), "warning");
    return;
  }
  let result: MeasurementBulkResult = {
    updated: 0,
    skippedLocked: 0,
    skippedNonMeasurement: 0,
  };
  store.mutate((project) => {
    result = applyMeasurementBulkEdit(project, store.ui.selection, patch);
  }, "change");
  if (result.updated && result.skippedLocked) {
    toast(
      t("app.measurementsUpdated", {
        count: result.updated,
        locked: result.skippedLocked,
      }),
      "warning",
    );
  }
}
export function setSelectionCategory(categoryId: string): void {
  const project = store.project;
  if (!project?.categories.some((category) => category.id === categoryId)) return;
  bulkEditMeasurementSelection({ categoryId });
}
export function setSelectionRoom(room: string): void {
  bulkEditMeasurementSelection({ room });
}
export function setSelectionAreaMode(mode: AreaMode): void {
  bulkEditMeasurementSelection({ areaMode: mode });
}
export function setSelectionCountType(type: CountType): void {
  bulkEditMeasurementSelection({ countType: type });
}
export function setSelectionCountQuantity(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity < 1) return;
  bulkEditMeasurementSelection({ countQuantity: quantity });
}
export function setSelectionLabelSize(size: number): void {
  if (!Number.isFinite(size)) return;
  bulkEditMeasurementSelection({ labelSize: size });
}
