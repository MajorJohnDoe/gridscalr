import { areaShapeOf, areaValue } from "../../../model/area";
import { itemScale } from "../../../model/calibration";
import { buildLayerHierarchy } from "../../../model/layerHierarchy";
import { itemIsLocked, itemIsVisible } from "../../../model/layers";
import { areaInUnit } from "../../../model/units";
import type { MarkupItem, PageId, Project, Space } from "../../../model/types";

/**
 * Derived space area. The linked area measurements are the only source of
 * truth for a measured space; `space.areaM2` is a manual fallback and never a
 * second calculation. Nothing here is stored on the space, so a moved or
 * deleted measurement immediately changes the reported area.
 *
 * Hidden items and hidden layers are excluded and locked items are included,
 * which is the same rule the quantity report and the exports use.
 */

export type SpaceAreaSource = "measured" | "manual" | "missing";

/** Why a space has no usable area, or why a manual value is not used. */
export type SpaceAreaWarning = "noMeasurement" | "hiddenOnly" | "noScale" | "manualMissing";

/** One area measurement linked to a space, resolved for the register. */
export interface SpaceMeasurement {
  itemId: string;
  layerId: string;
  pageId: PageId;
  /** Square metres from the item's own scale, or null when it has none. */
  areaM2: number | null;
  /** True for a deduction area. */
  subtract: boolean;
  /** False for a hidden item or a hidden (or hidden ancestor) layer. */
  visible: boolean;
  locked: boolean;
}

export interface SpaceArea {
  /** Derived area in square metres, or null when it cannot be stated. */
  areaM2: number | null;
  source: SpaceAreaSource;
  /** Visible linked area measurements that feed the sum. */
  measurementCount: number;
  /** Linked measurements that are hidden and therefore excluded. */
  hiddenCount: number;
  /** Visible linked measurements whose page has no scale. */
  uncalibratedCount: number;
  /** True when deductions exceeded additions and the area was clamped to 0. */
  clamped: boolean;
  /** The manual input, even when a measurement wins. */
  manualM2: number | null;
  /** True when a manual value exists but the measured area wins. */
  manualUnused: boolean;
  warning: SpaceAreaWarning | null;
  /** Linked measurements in project order. */
  links: SpaceMeasurement[];
}

function squareMeters(item: MarkupItem, project: Project): number | null {
  const scale = itemScale(item, project);
  if (!scale || !Number.isFinite(scale.pointsPerMeter) || scale.pointsPerMeter <= 0) return null;
  return areaInUnit(areaValue(item.points, areaShapeOf(item)), scale.pointsPerMeter, "m2");
}

/**
 * Every linked area measurement grouped by space. A non-area item that carries
 * a `spaceId` is a validator error and never contributes to an area.
 */
export function spaceMeasurements(project: Project): Map<string, SpaceMeasurement[]> {
  const hierarchy = buildLayerHierarchy(project.layers);
  const bySpace = new Map<string, SpaceMeasurement[]>();
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (!item.spaceId || item.kind !== "area") continue;
      const links = bySpace.get(item.spaceId) ?? [];
      links.push({
        itemId: item.id,
        layerId: layer.id,
        pageId: item.pageId,
        areaM2: squareMeters(item, project),
        subtract: item.areaMode === "subtract",
        visible: itemIsVisible(item, layer, hierarchy),
        locked: itemIsLocked(item, layer, hierarchy),
      });
      bySpace.set(item.spaceId, links);
    }
  }
  return bySpace;
}

/**
 * Area rules: a measured space sums its visible links, add minus subtract. A
 * manual space uses `areaM2` only while no linked measurement exists, and a
 * linked measurement then flags the manual value as unused. A missing area is
 * reported, never guessed.
 */
export function spaceArea(space: Space, links: readonly SpaceMeasurement[]): SpaceArea {
  const visible = links.filter((link) => link.visible);
  const hiddenCount = links.length - visible.length;
  const calibrated = visible.filter((link) => link.areaM2 !== null);
  const manualM2 = typeof space.areaM2 === "number" ? space.areaM2 : null;
  const base = {
    measurementCount: visible.length,
    hiddenCount,
    uncalibratedCount: visible.length - calibrated.length,
    links: [...links],
  };

  if (visible.length === 0) {
    if (space.areaMode === "manual" && manualM2 !== null) {
      return {
        ...base,
        areaM2: manualM2,
        source: "manual",
        clamped: false,
        manualM2,
        manualUnused: false,
        warning: null,
      };
    }
    return {
      ...base,
      areaM2: null,
      source: "missing",
      clamped: false,
      manualM2,
      manualUnused: false,
      warning:
        space.areaMode === "manual"
          ? "manualMissing"
          : hiddenCount > 0
            ? "hiddenOnly"
            : "noMeasurement",
    };
  }

  // Linked measurements always win over a manual value.
  const manualUnused = space.areaMode === "manual" && manualM2 !== null;
  if (calibrated.length !== visible.length) {
    // A partial sum would understate the room, so no area is reported instead.
    return {
      ...base,
      areaM2: null,
      source: "missing",
      clamped: false,
      manualM2,
      manualUnused,
      warning: "noScale",
    };
  }

  const sum = calibrated.reduce(
    (total, link) => total + (link.subtract ? -(link.areaM2 ?? 0) : (link.areaM2 ?? 0)),
    0,
  );
  return {
    ...base,
    areaM2: Math.max(0, sum),
    source: "measured",
    clamped: sum < 0,
    manualM2,
    manualUnused,
    warning: null,
  };
}

/** Derived area for every space, built from one pass over the items. */
export function spaceAreas(project: Project): Map<string, SpaceArea> {
  const links = spaceMeasurements(project);
  const areas = new Map<string, SpaceArea>();
  for (const space of project.spaces) {
    areas.set(space.id, spaceArea(space, links.get(space.id) ?? []));
  }
  return areas;
}
