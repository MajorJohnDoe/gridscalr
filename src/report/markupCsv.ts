import { itemIsVisible } from "../model/layers";
import { itemKindLabel, itemMetrics } from "../model/measure";
import type { Project } from "../model/types";
import { escapeCsvField } from "./csv";

export const MARKUP_CSV_COLUMNS = [
  "Page",
  "Type",
  "Layer",
  "Label",
  "Value",
  "Unit",
  "Details",
  "Points",
] as const;

/** Serializes every visible markup on every visible layer. */
export function serializeMarkupCsv(project: Project): string {
  const rows: string[][] = [MARKUP_CSV_COLUMNS.slice()];
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (!itemIsVisible(item, layer)) continue;
      const metrics = itemMetrics(item, project);
      rows.push([
        String(item.page),
        itemKindLabel(item.kind),
        layer.name,
        item.label ?? "",
        metrics?.primary ?? item.text ?? "",
        metrics?.unit ?? "",
        metrics?.secondary ?? "",
        item.points.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join("; "),
      ]);
    }
  }
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}
