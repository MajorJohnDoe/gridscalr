import { normalizeProjectMetadata } from "../metadata";
import { normalizeProjectName } from "../projectName";
import { normalizeProjectSettings } from "../settings";
import type { ImageAsset, Project, ProjectMetadata, ProjectSettings } from "../types";

/**
 * The settings fields a plain settings edit may change. Quantity and summary
 * settings have their own commands because they are structured values rather
 * than single leaves.
 */
export type ProjectSettingsPatch = Partial<
  Pick<
    ProjectSettings,
    | "lengthUnit"
    | "areaUnit"
    | "smartLengthUnits"
    | "labelSize"
    | "compactAreaLabels"
    | "showGrid"
    | "showCalibration"
    | "snapToGeometry"
    | "snapTolerancePx"
    | "stampPresets"
  >
>;

/** Copies only the patch fields that were actually supplied. */
function mergeSettings(current: ProjectSettings, patch: ProjectSettingsPatch): ProjectSettings {
  const merged = { ...current };
  for (const key of Object.keys(patch) as Array<keyof ProjectSettingsPatch>) {
    const value = patch[key];
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

/**
 * Applies one normalized settings patch. Unit, label, snap, stamp and display
 * values go through the same rules as project loading, so a bad stored value
 * falls back to its default instead of reaching the canvas.
 */
export function updateProjectSettings(
  project: Project,
  patch: ProjectSettingsPatch,
): ProjectSettings {
  const next = normalizeProjectSettings(mergeSettings(project.settings, patch), project.categories);
  Object.assign(project.settings, next);
  return project.settings;
}

/** Replaces the project stamp presets with their normalized form. */
export function updateStampPresets(project: Project, presets: readonly string[]): ProjectSettings {
  return updateProjectSettings(project, { stampPresets: [...presets] });
}

/**
 * Applies a partial metadata patch. Unspecified fields are preserved and every
 * supplied field is cleaned with the same limits used when a project is loaded.
 */
export function updateProjectMetadata(
  project: Project,
  patch: Partial<ProjectMetadata>,
): ProjectMetadata {
  const merged = { ...project.metadata };
  for (const key of Object.keys(patch) as Array<keyof ProjectMetadata>) {
    const value = patch[key];
    if (value !== undefined) merged[key] = value;
  }
  project.metadata = normalizeProjectMetadata(merged);
  return project.metadata;
}

/** True when an embedded image item still references the asset. */
function assetInUse(project: Project, assetId: string): boolean {
  return project.layers.some((layer) =>
    layer.items.some((item) => item.image?.assetId === assetId),
  );
}

/** Drops a replaced logo asset only when no image item still needs it. */
function pruneReportLogoAsset(project: Project, assetId: string | null): void {
  if (assetId && !assetInUse(project, assetId)) delete project.assets[assetId];
}

/**
 * Sets or clears the report logo. A new asset is registered in the project and
 * the previous logo asset is removed when no image item references it.
 */
export function updateReportLogo(project: Project, asset: ImageAsset | null): string | null {
  const previous = project.reportLogoAssetId;
  if (asset) {
    project.assets[asset.id] = asset;
    project.reportLogoAssetId = asset.id;
  } else {
    project.reportLogoAssetId = null;
  }
  if (previous !== project.reportLogoAssetId) pruneReportLogoAsset(project, previous);
  return project.reportLogoAssetId;
}

/**
 * Renames the project with the shared name cleanup. An empty result keeps the
 * previous name, and the return value says whether the name changed.
 */
export function updateProjectName(project: Project, value: string): boolean {
  const next = normalizeProjectName(typeof value === "string" ? value : "", project.name);
  if (next === project.name) return false;
  project.name = next;
  return true;
}

/** The project-wide quantity defaults a plain settings edit may change. */
export type QuantityDefaultsPatch = {
  wastePercent?: number;
  roundingStep?: number;
};

/** The per-category quantity overrides a category edit may change. */
export type CategoryQuantityField = "wastePercent" | "roundingStep";

/**
 * Applies normalized quantity defaults. A non-finite value is refused; waste
 * clamps to 0–100 and rounding to non-negative. The return value says whether a
 * value changed, so a no-op edit adds no undo step.
 */
export function setQuantityDefaults(
  project: Pick<Project, "settings">,
  patch: QuantityDefaultsPatch,
): boolean {
  if (
    (patch.wastePercent !== undefined && !Number.isFinite(patch.wastePercent)) ||
    (patch.roundingStep !== undefined && !Number.isFinite(patch.roundingStep))
  ) {
    return false;
  }
  const quantity = project.settings.quantity;
  const wastePercent =
    patch.wastePercent === undefined
      ? quantity.wastePercent
      : Math.max(0, Math.min(100, patch.wastePercent));
  const roundingStep =
    patch.roundingStep === undefined ? quantity.roundingStep : Math.max(0, patch.roundingStep);
  if (wastePercent === quantity.wastePercent && roundingStep === quantity.roundingStep) {
    return false;
  }
  quantity.wastePercent = wastePercent;
  quantity.roundingStep = roundingStep;
  return true;
}

/**
 * Sets or clears one category's quantity override. `null` removes the override
 * so the project default applies again. A missing category or a non-finite
 * value is refused, and the return value says whether a value changed.
 */
export function setCategoryQuantityOverride(
  project: Pick<Project, "categories">,
  id: string,
  field: CategoryQuantityField,
  value: number | null,
): boolean {
  if (value !== null && !Number.isFinite(value)) return false;
  const category = project.categories.find((entry) => entry.id === id);
  if (!category) return false;
  const normalized =
    value === null
      ? undefined
      : field === "wastePercent"
        ? Math.max(0, Math.min(100, value))
        : Math.max(0, value);
  if (category[field] === normalized) return false;
  if (normalized === undefined) delete category[field];
  else category[field] = normalized;
  return true;
}
