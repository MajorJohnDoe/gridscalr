import { itemScale, pageScale, scaleRatio } from "./calibration";
import { areaPerimeter, areaShapeOf, areaValue } from "./area";
import { countTypeLabel } from "./countSymbols";
import { symbolName } from "./symbols";
import { measurementValue, polylineLength } from "./geometry";
import type { MarkupItem, Project, ScaleSnapshot } from "./types";
import {
  displayedLengthUnit,
  formatArea,
  formatLength,
  formatLengthCompact,
  formatScaleRatio,
} from "./units";

export interface ItemMetrics {
  primary: string;
  secondary?: string;
  rawPoints: number;
  scale: ScaleSnapshot | null;
  unit: string;
}

export function itemScaleForDisplay(item: MarkupItem, project: Project): ScaleSnapshot | null {
  return itemScale(item, project);
}

export function itemMetrics(item: MarkupItem, project: Project): ItemMetrics | null {
  const scale = itemScale(item, project);
  if (
    item.kind === "length" ||
    item.kind === "radius" ||
    item.kind === "diameter" ||
    item.kind === "arc"
  ) {
    const points =
      measurementValue(item) ?? (item.kind === "length" ? polylineLength(item.points) : 0);
    const smart = project.settings.smartLengthUnits;
    const prefix =
      item.kind === "radius"
        ? "R "
        : item.kind === "diameter"
          ? "Ø "
          : item.kind === "arc"
            ? "Arc "
            : "";
    return {
      primary: `${prefix}${formatLength(points, scale, project.settings.lengthUnit, smart)}`,
      rawPoints: points,
      scale,
      unit: scale ? displayedLengthUnit(points, scale, project.settings.lengthUnit, smart) : "pt",
    };
  }
  if (item.kind === "area") {
    const shape = areaShapeOf(item);
    const area = areaValue(item.points, shape);
    const perimeter = areaPerimeter(item.points, shape);
    const deduction = item.areaMode === "subtract" ? "Deduction · " : "";
    const smart = project.settings.smartLengthUnits;
    return {
      primary: formatArea(area, scale, project.settings.areaUnit),
      secondary: `${deduction}Perimeter ${formatLengthCompact(perimeter, scale, project.settings.lengthUnit, smart)}`,
      rawPoints: area,
      scale,
      unit: scale ? project.settings.areaUnit : "pt²",
    };
  }
  if (item.kind === "count") {
    return {
      primary: "1 pcs",
      secondary: countTypeLabel(item.countType),
      rawPoints: 1,
      scale: null,
      unit: "pcs",
    };
  }
  return null;
}

/**
 * Explains why a measurement may not match the page's current scale, so a stale
 * value never reaches a quantity report unnoticed.
 */
export function itemScaleWarning(item: MarkupItem, project: Project): string | null {
  if (
    item.kind !== "length" &&
    item.kind !== "area" &&
    item.kind !== "radius" &&
    item.kind !== "diameter" &&
    item.kind !== "arc"
  ) {
    return null;
  }
  // Items without a snapshot predate the field and follow the page.
  if (item.scale === undefined) return null;
  const page = pageScale(project, item.page);
  if (!item.scale) {
    return page
      ? "Measured before this page was calibrated, so this value is in PDF points. Redraw it to use the page scale."
      : null;
  }
  if (!page) {
    return "The page scale was cleared. This measurement keeps the scale it was drawn with.";
  }
  const relative = Math.abs(item.scale.pointsPerMeter - page.pointsPerMeter) / page.pointsPerMeter;
  if (relative <= 0.0005) return null;
  return `Measured at ${formatScaleRatio(scaleRatio(item.scale))}; the page is now ${formatScaleRatio(
    scaleRatio(page),
  )}. The value keeps its original scale.`;
}

export function itemLabel(item: MarkupItem, project: Project): string {
  if (item.label) return item.label;
  const metrics = itemMetrics(item, project);
  if (metrics) return metrics.primary;
  if (item.kind === "text") return item.text?.slice(0, 32) || "Text";
  if (item.kind === "callout") return item.text?.slice(0, 32) || "Callout";
  if (item.kind === "stamp") return item.text?.slice(0, 32) || "Stamp";
  if (item.kind === "delta") return item.text ? `Rev ${item.text}` : "Revision";
  if (item.kind === "cloud") return item.text?.slice(0, 32) || "Revision cloud";
  if (item.kind === "symbol") return symbolName(item.symbolId);
  return itemKindLabel(item.kind);
}

export function itemKindLabel(kind: MarkupItem["kind"]): string {
  switch (kind) {
    case "length":
      return "Length";
    case "area":
      return "Area";
    case "count":
      return "Count";
    case "radius":
      return "Radius";
    case "diameter":
      return "Diameter";
    case "arc":
      return "Arc";
    case "pen":
      return "Pen";
    case "line":
      return "Line";
    case "arrow":
      return "Arrow";
    case "rect":
      return "Rectangle";
    case "ellipse":
      return "Ellipse";
    case "highlight":
      return "Highlight";
    case "text":
      return "Text";
    case "image":
      return "Image";
    case "cloud":
      return "Revision cloud";
    case "callout":
      return "Callout";
    case "stamp":
      return "Stamp";
    case "delta":
      return "Revision delta";
    case "symbol":
      return "Symbol";
  }
}
