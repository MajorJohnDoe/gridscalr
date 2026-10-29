import { itemIsVisible } from "../model/layers";
import { itemKindLabel, itemMetrics } from "../model/measure";
import {
  inspectionStatusLabel,
  symbolCategoryLabel,
  symbolCategoryOf,
  symbolName,
} from "../model/symbols";
import type { MarkupItem, Project } from "../model/types";
import type { QuantityReport } from "./reportModel";
import type { QuantityRow } from "../model/quantity";

export const QUANTITY_COLUMNS = [
  "category",
  "room",
  "quantity_type",
  "unit",
  "gross",
  "deduction",
  "net",
  "waste_percent",
  "waste_quantity",
  "rounding_step",
  "order_quantity",
  "item_count",
] as const;

export const MARKUP_COLUMNS = [
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

/** A table cell keeps both the display string and the underlying numeric value. */
export interface ReportCell {
  text: string;
  value: string | number;
}

export type ReportTable = ReportCell[][];

function textCell(value: string): ReportCell {
  return { text: value, value };
}

function numberCell(text: string, value: number): ReportCell {
  return { text, value };
}

function fixed3(value: number): string {
  if (!Number.isFinite(value)) return "0.000";
  const fixed = Math.abs(value) < 0.0005 ? 0 : value;
  return fixed.toFixed(3);
}

function round3(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((Math.abs(value) < 0.0005 ? 0 : value) * 1000) / 1000;
}

function measuredText(value: number, row: QuantityRow): string {
  return row.type === "count" ? String(Math.round(value)) : fixed3(value);
}

function measuredNumber(value: number, row: QuantityRow): number {
  return row.type === "count" ? Math.round(value) : round3(value);
}

function header(columns: readonly string[]): ReportCell[] {
  return columns.map(textCell);
}

function quantityRow(row: QuantityRow): ReportCell[] {
  return [
    textCell(row.categoryName),
    textCell(row.room),
    textCell(row.type),
    textCell(row.unit),
    numberCell(measuredText(row.gross, row), measuredNumber(row.gross, row)),
    numberCell(measuredText(row.deduction, row), measuredNumber(row.deduction, row)),
    numberCell(measuredText(row.net, row), measuredNumber(row.net, row)),
    numberCell(fixed3(row.wastePercent), round3(row.wastePercent)),
    numberCell(fixed3(row.wasteQuantity), round3(row.wasteQuantity)),
    numberCell(fixed3(row.roundingStep), round3(row.roundingStep)),
    numberCell(measuredText(row.orderQuantity, row), measuredNumber(row.orderQuantity, row)),
    numberCell(String(row.items), row.items),
  ];
}

/** Quantity rows shared by the CSV, PDF and XLSX exports. */
export function quantityTable(report: QuantityReport): ReportTable {
  return [header(QUANTITY_COLUMNS), ...report.summary.rows.map(quantityRow)];
}

function markupRow(project: Project, item: MarkupItem, layerName: string): ReportCell[] {
  const metrics = itemMetrics(item, project);
  const isSymbol = item.kind === "symbol";
  return [
    textCell(String(item.page)),
    textCell(itemKindLabel(item.kind)),
    textCell(layerName),
    textCell(item.label ?? ""),
    textCell(metrics?.primary ?? item.text ?? ""),
    textCell(metrics?.unit ?? ""),
    textCell(metrics?.secondary ?? ""),
    textCell(item.points.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join("; ")),
    textCell(isSymbol ? symbolName(item.symbolId) : ""),
    textCell(isSymbol ? symbolCategoryLabel(symbolCategoryOf(item.symbolId)) : ""),
    textCell(isSymbol ? inspectionStatusLabel(item.status) : ""),
    textCell(item.createdAt ?? ""),
    textCell(item.updatedAt ?? ""),
  ];
}

/** Visible markups on visible layers, shared by the markup CSV and XLSX exports. */
export function markupTable(project: Project): ReportTable {
  const rows: ReportTable = [header(MARKUP_COLUMNS)];
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (!itemIsVisible(item, layer)) continue;
      rows.push(markupRow(project, item, layer.name));
    }
  }
  return rows;
}
