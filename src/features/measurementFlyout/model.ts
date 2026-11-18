import { measurementCategory } from "../../model/categories";
import { countTypeLabel, findCountPreset } from "../../model/countTypes";
import { buildLayerHierarchy } from "../../model/layerHierarchy";
import {
  layerAppliesToPage,
  layerLockedOnPage,
  layerVisibleOnPage,
  layersForKind,
} from "../../model/layers";
import type { AreaMode, AreaShape, CountType, Layer, PageId, Project } from "../../model/types";
import { t } from "../../i18n";

/**
 * The measurement settings are session state. The flyout reads these fields
 * directly so it can stay a pure function of the current snapshot.
 */
export interface MeasurementUiState {
  activeTool: string;
  measureCategoryId: string | null;
  measureRoom: string;
  measureCountType: CountType;
  measureCountQuantity: number;
  measureAreaMode: AreaMode;
  measureAreaShape: AreaShape;
}

export interface MeasurementCapabilities {
  /** The Area tool owns a shape and an add/deduct mode. */
  area: boolean;
  /** The Count tool owns a count type, pieces and saved presets. */
  count: boolean;
}

export function measurementCapabilities(tool: string): MeasurementCapabilities {
  return { area: tool === "area", count: tool === "count" };
}

/**
 * Layers that can receive a new measurement on the page: same page scope as
 * the Layers panel, and never a hidden or locked layer. A view-only session
 * has no editable target because `store.readOnly` blocks the panel earlier.
 */
export function measurementTargetLayers(project: Project, pageId: PageId | null): Layer[] {
  if (!pageId) return [];
  const hierarchy = buildLayerHierarchy(project.layers);
  return layersForKind(project, "measure").filter(
    (layer) =>
      layerAppliesToPage(layer, pageId) &&
      layerVisibleOnPage(layer, pageId, hierarchy) &&
      !layerLockedOnPage(layer, pageId, hierarchy),
  );
}

/** The category a new count would use, including the project fallback. */
export function measurementCategoryId(project: Project, ui: MeasurementUiState): string {
  return (
    measurementCategory(project, ui.measureCategoryId)?.id ??
    project.settings.quantity.defaultCategoryId
  );
}

/** The saved count preset that exactly matches the current settings, if any. */
export function matchingCountPreset(
  project: Project,
  ui: MeasurementUiState,
): ReturnType<typeof findCountPreset> {
  return findCountPreset(
    project,
    ui.measureCountType,
    measurementCategoryId(project, ui),
    ui.measureRoom,
    ui.measureCountQuantity,
  );
}

/** Compact current-setting summary shown in the context bar. */
export function measurementSummary(project: Project, ui: MeasurementUiState): string {
  const parts: string[] = [];
  if (ui.activeTool === "area") {
    parts.push(
      ui.measureAreaShape === "rectangle"
        ? t("tool.rect")
        : ui.measureAreaShape === "ellipse"
          ? t("tool.ellipse")
          : t("context.polygon"),
    );
    parts.push(ui.measureAreaMode === "subtract" ? t("context.deduct") : t("context.add"));
  } else if (ui.activeTool === "count") {
    parts.push(countTypeLabel(project, ui.measureCountType));
  }
  const category = measurementCategory(project, ui.measureCategoryId);
  parts.push(category?.name ?? t("context.categoryFallback"));
  const room = ui.measureRoom.trim();
  if (room) parts.push(room);
  const layer = project.layers.find(
    (entry) => entry.id === project.activeLayerId && entry.kind === "measure",
  );
  if (layer) parts.push(layer.name);
  return parts.join(" · ");
}
