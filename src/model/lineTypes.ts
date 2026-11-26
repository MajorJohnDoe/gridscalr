import { t } from "../i18n";
import { makeId } from "./calibration";
import type { LineType, Project } from "./types";

export const DEFAULT_LINE_TYPE_ID = "supply";
const DEFAULT_LINE_COLOR = "#4cc9f0";
const MIN_WIDTH_PT = 0.3;
const MAX_WIDTH_PT = 20;
const DEFAULT_WIDTH_PT = 2;
const MAX_NAME_LENGTH = 80;

/**
 * Default media classes for schematic pipes, ducts and cables. Users edit the
 * colours later; items keep the resolved colour at creation.
 */
export function defaultLineTypes(): LineType[] {
  return [
    {
      id: "supply",
      name: t("lineType.supply"),
      color: "#e30613",
      widthPt: 2,
      style: "solid",
    },
    {
      id: "extract",
      name: t("lineType.extract"),
      color: "#f2c300",
      widthPt: 2,
      style: "solid",
    },
    {
      id: "exhaust",
      name: t("lineType.exhaust"),
      color: "#7a3b12",
      widthPt: 2,
      style: "solid",
    },
    {
      id: "outdoor",
      name: t("lineType.outdoor"),
      color: "#1f4fd8",
      widthPt: 2,
      style: "solid",
    },
    {
      id: "heatingFlow",
      name: t("lineType.heatingFlow"),
      color: "#f28c00",
      widthPt: 2,
      style: "solid",
    },
    {
      id: "heatingReturn",
      name: t("lineType.heatingReturn"),
      color: "#c96b00",
      widthPt: 2,
      style: "solid",
    },
    {
      id: "districtFlow",
      name: t("lineType.districtFlow"),
      color: "#c000c0",
      widthPt: 2,
      style: "solid",
    },
    {
      id: "districtReturn",
      name: t("lineType.districtReturn"),
      color: "#8f008f",
      widthPt: 2,
      style: "solid",
    },
    {
      id: "domesticWater",
      name: t("lineType.domesticWater"),
      color: "#00a651",
      widthPt: 2,
      style: "solid",
    },
    {
      id: "cooling",
      name: t("lineType.cooling"),
      color: "#00b8d4",
      widthPt: 2,
      style: "solid",
    },
    {
      id: "control",
      name: t("lineType.control"),
      color: "#e30613",
      widthPt: 1.2,
      style: "dashed",
    },
    {
      id: "bus",
      name: t("lineType.bus"),
      color: "#555555",
      widthPt: 1.2,
      style: "dashed",
    },
  ];
}

/**
 * Cleans a handwritten media-class list: a blank name, invalid colour, width
 * outside the editor range, duplicate or missing id and unknown style all fall
 * back to a safe value. The result is a fresh list, never the input objects.
 */
export function normalizeLineTypes(lineTypes: readonly LineType[]): LineType[] {
  const seen = new Set<string>();
  const next: LineType[] = [];
  for (const entry of lineTypes) {
    let id = typeof entry.id === "string" && entry.id ? entry.id : "";
    if (!id || seen.has(id)) id = makeId("line");
    while (seen.has(id)) id = makeId("line");
    const name = String(entry.name ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_NAME_LENGTH);
    const width = Number(entry.widthPt);
    next.push({
      id,
      name,
      color: /^#[0-9a-f]{6}$/i.test(String(entry.color ?? "")) ? entry.color : DEFAULT_LINE_COLOR,
      widthPt: Number.isFinite(width)
        ? Math.max(MIN_WIDTH_PT, Math.min(MAX_WIDTH_PT, width || DEFAULT_WIDTH_PT))
        : DEFAULT_WIDTH_PT,
      style: entry.style === "dashed" ? "dashed" : "solid",
    });
    seen.add(id);
  }
  return next;
}

/**
 * Replaces the project media classes, keeping every id unique and every style
 * valid. An empty list is refused so a project never loses its last class.
 */
export function setLineTypes(
  project: Pick<Project, "lineTypes">,
  lineTypes: readonly LineType[],
): LineType[] | null {
  const next = normalizeLineTypes(lineTypes);
  if (!next.length) return null;
  project.lineTypes = next;
  return next;
}
