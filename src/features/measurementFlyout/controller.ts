import { addCountPreset, removeCountPreset } from "../../model/countTypes";
import { store } from "../../state/store";
import { toast } from "../../ui/toast";
import { t } from "../../i18n";
import { measurementCategoryId } from "./model";

/** Restores the count type, category, room and pieces from a saved preset. */
export function applyCountPreset(presetId: string): void {
  const project = store.project;
  if (!project) return;
  const preset = project.countPresets.find((entry) => entry.id === presetId);
  if (!preset) return;
  store.setMeasureCategory(preset.categoryId);
  store.setMeasureRoom(preset.room);
  store.setMeasureCountType(preset.countType);
  store.setMeasureCountQuantity(preset.quantity);
}

/**
 * Saves the current count settings as a project preset. The store mutation is
 * one undo step and deduplicates an existing preset.
 */
export function saveCurrentCountPreset(): boolean {
  const project = store.project;
  if (!project) return false;
  let saved = false;
  store.mutate((next) => {
    const created = addCountPreset(
      next,
      store.ui.measureCountType,
      measurementCategoryId(next, store.ui),
      store.ui.measureRoom,
      store.ui.measureCountQuantity,
    );
    saved = created !== null;
  }, "change");
  toast(
    saved ? t("measureOptions.presetSaved") : t("measureOptions.presetSaveFailed"),
    saved ? "success" : "warning",
  );
  return saved;
}

/** Deletes a saved preset. The store mutation is one undo step. */
export function deleteCountPreset(presetId: string): void {
  store.mutate((next) => {
    removeCountPreset(next, presetId);
  }, "change");
  toast(t("measureOptions.presetDeleted"));
}
