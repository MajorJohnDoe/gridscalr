import type { Point, Project } from "../../../model/types";
import { templateDocumentForPage } from "./sheetDocument";

/** 5 mm between schematic grid lines, in PDF points. */
export const SCHEMATIC_GRID_STEP = (5 * 72) / 25.4;

/** True when the page is an operation-card sheet drawn on the schematic grid. */
export function usesSchematicGrid(project: Project, page: number): boolean {
  return templateDocumentForPage(project, page) !== undefined;
}

/**
 * Rounds a page point to the schematic grid. Ordinary drawing pages return the
 * point unchanged so pipes and ducts can be drawn at any length.
 */
export function snapToSchematicGrid(project: Project, page: number, point: Point): Point {
  if (!usesSchematicGrid(project, page)) return point;
  return {
    x: Math.round(point.x / SCHEMATIC_GRID_STEP) * SCHEMATIC_GRID_STEP,
    y: Math.round(point.y / SCHEMATIC_GRID_STEP) * SCHEMATIC_GRID_STEP,
  };
}
