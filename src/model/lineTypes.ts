import { t } from "../i18n";
import type { LineType } from "./types";

export const DEFAULT_LINE_TYPE_ID = "supply";

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
