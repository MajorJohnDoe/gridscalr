import { itemScale } from "./calibration";
import { areaPerimeter, areaShapeOf, areaValue } from "./area";
import { countTypeLabel } from "./countSymbols";
import { polylineLength } from "./geometry";
import type { MarkupItem, Project, ScaleSnapshot } from "./types";
import { formatArea, formatLength, formatLengthCompact } from "./units";

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
  if (item.kind === "length") {
    const points = polylineLength(item.points);
    return {
      primary: formatLength(points, scale, project.settings.lengthUnit),
      rawPoints: points,
      scale,
      unit: scale ? project.settings.lengthUnit : "pt",
    };
  }
  if (item.kind === "area") {
    const shape = areaShapeOf(item);
    const area = areaValue(item.points, shape);
    const perimeter = areaPerimeter(item.points, shape);
    const deduction = item.areaMode === "subtract" ? "Deduction · " : "";
    return {
      primary: formatArea(area, scale, project.settings.areaUnit),
      secondary: `${deduction}Perimeter ${formatLengthCompact(perimeter, scale, project.settings.lengthUnit)}`,
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

export function itemLabel(item: MarkupItem, project: Project): string {
  if (item.label) return item.label;
  const metrics = itemMetrics(item, project);
  if (metrics) return metrics.primary;
  if (item.kind === "text") return item.text?.slice(0, 32) || "Text";
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
  }
}
