import { itemIsVisible } from "../model/layers";
import { itemKindLabel, itemMetrics } from "../model/measure";
import {
  inspectionStatusLabel,
  symbolCategoryLabel,
  symbolCategoryOf,
  symbolName,
} from "../model/symbols";
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
  "Symbol",
  "Symbol category",
  "Status",
  "Created",
  "Modified",
] as const;

/** Serializes every visible markup on every visible layer. */
export function serializeMarkupCsv(project: Project): string {
  const rows: string[][] = [MARKUP_CSV_COLUMNS.slice()];
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (!itemIsVisible(item, layer)) continue;
      const metrics = itemMetrics(item, project);
      const isSymbol = item.kind === "symbol";
      rows.push([
        String(item.page),
        itemKindLabel(item.kind),
        layer.name,
        item.label ?? "",
        metrics?.primary ?? item.text ?? "",
        metrics?.unit ?? "",
        metrics?.secondary ?? "",
        item.points.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join("; "),
        isSymbol ? symbolName(item.symbolId) : "",
        isSymbol ? symbolCategoryLabel(symbolCategoryOf(item.symbolId)) : "",
        isSymbol ? inspectionStatusLabel(item.status) : "",
        item.createdAt ?? "",
        item.updatedAt ?? "",
      ]);
    }
  }
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}
