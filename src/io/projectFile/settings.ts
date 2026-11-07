import { createDefaultQuantitySettings } from "../../model/categories";
import { clampLabelSize } from "../../model/label";
import { DEFAULT_SETTINGS } from "../../model/layers";
import { normalizeStampPresets } from "../../model/stamps";
import type {
  AreaUnit,
  Category,
  LengthUnit,
  ProjectSettings,
  QuantitySettings,
} from "../../model/types";
import { LENGTH_UNITS, AREA_UNITS } from "./shared";

export function normalizeSettings(
  value: Partial<ProjectSettings> | undefined,
  categories: Category[],
): ProjectSettings {
  const rawQuantity = (value?.quantity ?? {}) as Partial<QuantitySettings>;
  const ids = new Set(categories.map((category) => category.id));
  const fallbackQuantity = createDefaultQuantitySettings(categories);
  return {
    lengthUnit: LENGTH_UNITS.has(value?.lengthUnit as LengthUnit)
      ? (value!.lengthUnit as LengthUnit)
      : DEFAULT_SETTINGS.lengthUnit,
    areaUnit: AREA_UNITS.has(value?.areaUnit as AreaUnit)
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
  };
}
