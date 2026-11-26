import { createDefaultQuantitySettings } from "./categories";
import { clampLabelSize } from "./label";
import { DEFAULT_SETTINGS } from "./layers";
import { normalizeStampPresets } from "./stamps";
import { normalizeSummarySettings } from "./summary";
import { AREA_UNITS, LENGTH_UNITS } from "./units";
import type { AreaUnit, Category, LengthUnit, ProjectSettings, QuantitySettings } from "./types";

/**
 * Settings normalization shared by project loading and the settings command.
 * Keeping it in the model means a settings edit applies the same unit, label,
 * snap, stamp and summary rules as a file loaded from disk.
 */
export function normalizeProjectSettings(
  value: Partial<ProjectSettings> | undefined,
  categories: Category[],
  report?: (code: string) => void,
): ProjectSettings {
  const rawQuantity = (value?.quantity ?? {}) as Partial<QuantitySettings>;
  const ids = new Set(categories.map((category) => category.id));
  const fallbackQuantity = createDefaultQuantitySettings(categories);
  return {
    lengthUnit: LENGTH_UNITS.some((unit) => unit.id === value?.lengthUnit)
      ? (value!.lengthUnit as LengthUnit)
      : DEFAULT_SETTINGS.lengthUnit,
    areaUnit: AREA_UNITS.some((unit) => unit.id === value?.areaUnit)
      ? (value!.areaUnit as AreaUnit)
      : DEFAULT_SETTINGS.areaUnit,
    smartLengthUnits: value?.smartLengthUnits !== false,
    labelSize: clampLabelSize(value?.labelSize),
    compactAreaLabels: value?.compactAreaLabels === true,
    showGrid: value?.showGrid ?? DEFAULT_SETTINGS.showGrid,
    showCalibration: value?.showCalibration ?? DEFAULT_SETTINGS.showCalibration,
    snapToGeometry: value?.snapToGeometry ?? DEFAULT_SETTINGS.snapToGeometry,
    snapTolerancePx:
      typeof value?.snapTolerancePx === "number" && Number.isFinite(value.snapTolerancePx)
        ? Math.max(2, Math.min(24, value.snapTolerancePx))
        : DEFAULT_SETTINGS.snapTolerancePx,
    stampPresets: normalizeStampPresets(value?.stampPresets),
    quantity: {
      defaultCategoryId:
        typeof rawQuantity.defaultCategoryId === "string" && ids.has(rawQuantity.defaultCategoryId)
          ? rawQuantity.defaultCategoryId
          : fallbackQuantity.defaultCategoryId,
      wastePercent:
        typeof rawQuantity.wastePercent === "number" && Number.isFinite(rawQuantity.wastePercent)
          ? Math.max(0, Math.min(100, rawQuantity.wastePercent))
          : fallbackQuantity.wastePercent,
      roundingStep:
        typeof rawQuantity.roundingStep === "number" && Number.isFinite(rawQuantity.roundingStep)
          ? Math.max(0, rawQuantity.roundingStep)
          : fallbackQuantity.roundingStep,
    },
    summary: normalizeSummarySettings(value?.summary, report),
  };
}
