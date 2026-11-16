import { formatNumber } from "../../i18n/format";
import { t } from "../../i18n";
import { areaShapeOf, areaValue } from "../../model/area";
import { itemScale } from "../../model/calibration";
import { defaultCategory } from "../../model/categories";
import { countQuantityOf } from "../../model/countTypes";
import { itemIsVisible, isMeasurementKind } from "../../model/layers";
import { buildLayerHierarchy } from "../../model/layerHierarchy";
import { measurementValue, polylineLength } from "../../model/geometry";
import { SUMMARY_CARD_IDS } from "../../model/summary";
import { areaInUnit, lengthInUnit, lengthUnitLabel, unitLabel } from "../../model/units";
import type {
  AreaUnit,
  LengthUnit,
  Project,
  ScheduleFilter,
  SummaryCardId,
} from "../../model/types";
import { spaceAreas } from "../spaces";
import { createKeyCache } from "./model/cache";
import { filterSignature, itemMatchesFilters, scheduleFilterContext } from "./model/filters";

/**
 * The four summary KPI cards and the built-in quantity table. A role is read
 * from `summaryRole`, never matched by name: a missing role reports zero with a
 * Configure affordance instead of a plausible wrong number. Derived areas come
 * from the spaces feature and are never recomputed here.
 */

export interface SummaryCardValue {
  id: SummaryCardId;
  visible: boolean;
  value: number | null;
  text: string;
  unit: string;
  /** True when no category or count type carries the role the card reads. */
  roleMissing: boolean;
  /** Rooms without a usable area, for the area card. */
  missingCount: number;
  /** Visible wall measurements without a page scale. */
  uncalibratedCount: number;
  /** True when the card has no source data at all (for example no rooms). */
  empty: boolean;
}

export interface SummaryTableRow {
  key: string;
  label: string;
  count: number;
  pieces: number;
  length: number | null;
  area: number | null;
  lengthText: string;
  areaText: string;
  unit: string;
}

export interface SummaryTable {
  rows: SummaryTableRow[];
  totals: SummaryTableRow;
  lengthUnit: LengthUnit;
  areaUnit: AreaUnit;
  uncalibratedCount: number;
}

export interface SummaryModel {
  cards: SummaryCardValue[];
  table: SummaryTable;
  roomCount: number;
}

interface Accumulator {
  key: string;
  label: string;
  order: number;
  count: number;
  pieces: number;
  length: number;
  area: number;
  hasLength: boolean;
  hasArea: boolean;
  hasPieces: boolean;
}

const LENGTH_KINDS = new Set(["length", "radius", "diameter", "arc"]);

function tableUnit(accumulator: Accumulator, lengthUnit: string, areaUnit: string): string {
  const parts: string[] = [];
  if (accumulator.hasLength) parts.push(lengthUnit);
  if (accumulator.hasArea) parts.push(areaUnit);
  if (accumulator.hasPieces) parts.push(t("unit.pcs"));
  return parts.join(" / ");
}

function toRow(
  accumulator: Accumulator,
  lengthUnit: LengthUnit,
  areaUnit: AreaUnit,
): SummaryTableRow {
  return {
    key: accumulator.key,
    label: accumulator.label,
    count: accumulator.count,
    pieces: accumulator.pieces,
    length: accumulator.hasLength ? accumulator.length : null,
    area: accumulator.hasArea ? accumulator.area : null,
    lengthText: accumulator.hasLength ? formatNumber(accumulator.length, 2) : "",
    areaText: accumulator.hasArea ? formatNumber(accumulator.area, 2) : "",
    unit: tableUnit(accumulator, lengthUnitLabel(lengthUnit), unitLabel(areaUnit)),
  };
}

function emptyAccumulator(key: string, label: string, order: number): Accumulator {
  return {
    key,
    label,
    order,
    count: 0,
    pieces: 0,
    length: 0,
    area: 0,
    hasLength: false,
    hasArea: false,
    hasPieces: false,
  };
}

function cardVisible(project: Project, id: SummaryCardId): boolean {
  const card = project.settings.summary?.cards?.find((entry) => entry.id === id);
  return card?.visible !== false;
}

function card(id: SummaryCardId, value: number, text: string, unit: string): SummaryCardValue {
  return {
    id,
    visible: true,
    value,
    text,
    unit,
    roleMissing: false,
    missingCount: 0,
    uncalibratedCount: 0,
    empty: value === 0,
  };
}

function compute(project: Project, filter?: ScheduleFilter): SummaryModel {
  const hierarchy = buildLayerHierarchy(project.layers);
  const context = scheduleFilterContext(project);
  const lengthUnit = project.settings.lengthUnit;
  const areaUnit = project.settings.areaUnit;
  const rooms = project.spaces.filter((space) => space.kind === "room");
  const areas = spaceAreas(project);
  const wallCategories = new Set(
    project.categories.filter((category) => category.summaryRole === "wall").map((c) => c.id),
  );
  const doorTypes = new Set(
    project.countTypes.filter((type) => type.summaryRole === "door").map((type) => type.id),
  );
  const fallbackCategory = defaultCategory(project);
  const categoryOrder = new Map(project.categories.map((category, index) => [category.id, index]));
  const categoryById = new Map(project.categories.map((category) => [category.id, category]));
  const groups = new Map<string, Accumulator>();
  const categoryOf = (item: {
    categoryId?: string;
  }): (typeof project.categories)[number] | undefined =>
    (item.categoryId ? categoryById.get(item.categoryId) : undefined) ?? fallbackCategory;
  let wallLength = 0;
  let wallUncalibrated = 0;
  let doors = 0;
  let uncalibrated = 0;

  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (!itemIsVisible(item, layer, hierarchy)) continue;
      if (filter && !itemMatchesFilters(item, layer, hierarchy, context, [filter])) continue;
      if (!isMeasurementKind(item.kind)) continue;
      const category = categoryOf(item);
      const key = category?.id ?? "uncategorized";
      const order = category ? (categoryOrder.get(category.id) ?? 9998) : 9998;
      let accumulator = groups.get(key);
      if (!accumulator) {
        accumulator = emptyAccumulator(
          key,
          category?.name ?? t("schedules.value.uncategorized"),
          order,
        );
        groups.set(key, accumulator);
      }
      accumulator.count += 1;
      if (LENGTH_KINDS.has(item.kind)) {
        const scale = itemScale(item, project);
        const ppm = scale?.pointsPerMeter ?? 0;
        const points = measurementValue(item) ?? polylineLength(item.points);
        if (scale && ppm > 0) {
          accumulator.length += lengthInUnit(points, ppm, lengthUnit);
          accumulator.hasLength = true;
        } else {
          uncalibrated += 1;
        }
        if (category && wallCategories.has(category.id)) {
          if (scale && ppm > 0) wallLength += lengthInUnit(points, ppm, lengthUnit);
          else wallUncalibrated += 1;
        }
      } else if (item.kind === "area") {
        const scale = itemScale(item, project);
        const ppm = scale?.pointsPerMeter ?? 0;
        if (scale && ppm > 0) {
          const area = areaInUnit(areaValue(item.points, areaShapeOf(item)), ppm, areaUnit);
          accumulator.area += item.areaMode === "subtract" ? -area : area;
          accumulator.hasArea = true;
        } else {
          uncalibrated += 1;
        }
      } else if (item.kind === "count") {
        if (doorTypes.has(item.countType ?? "other")) doors += countQuantityOf(item);
        accumulator.pieces += countQuantityOf(item);
        accumulator.hasPieces = true;
      }
    }
  }

  const rows = [...groups.values()]
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    .map((accumulator) => toRow(accumulator, lengthUnit, areaUnit));
  const totals = emptyAccumulator("total", t("schedules.table.total"), 0);
  for (const row of rows) {
    totals.count += row.count;
    totals.pieces += row.pieces;
    if (row.length !== null) {
      totals.length += row.length;
      totals.hasLength = true;
    }
    if (row.area !== null) {
      totals.area += row.area;
      totals.hasArea = true;
    }
    if (row.pieces > 0) totals.hasPieces = true;
  }

  const roomAreas = rooms.map((room) => areas.get(room.id));
  let totalArea = 0;
  let missingCount = 0;
  for (const area of roomAreas) {
    if (!area || area.areaM2 === null) missingCount += 1;
    else totalArea += area.areaM2;
  }

  const cards: SummaryCardValue[] = [
    {
      ...card("rooms", rooms.length, formatNumber(rooms.length, 0), t("schedules.card.roomsUnit")),
      visible: cardVisible(project, "rooms"),
    },
    {
      ...card("area", totalArea, formatNumber(totalArea, 2), "m²"),
      visible: cardVisible(project, "area"),
      missingCount,
      empty: rooms.length === 0,
    },
    {
      ...card("wallLength", wallLength, formatNumber(wallLength, 2), lengthUnitLabel(lengthUnit)),
      visible: cardVisible(project, "wallLength"),
      roleMissing: wallCategories.size === 0,
      uncalibratedCount: wallUncalibrated,
      empty: wallCategories.size === 0,
    },
    {
      ...card("doors", doors, formatNumber(doors, 0), t("unit.pcs")),
      visible: cardVisible(project, "doors"),
      roleMissing: doorTypes.size === 0,
      empty: doorTypes.size === 0,
    },
  ];
  // Keep catalogue order even if a future project stores cards out of order.
  cards.sort((a, b) => SUMMARY_CARD_IDS.indexOf(a.id) - SUMMARY_CARD_IDS.indexOf(b.id));

  return {
    cards,
    table: {
      rows,
      totals: toRow(totals, lengthUnit, areaUnit),
      lengthUnit,
      areaUnit,
      uncalibratedCount: uncalibrated,
    },
    roomCount: rooms.length,
  };
}

const summaryCache = createKeyCache<SummaryModel>(8);

export function summaryCacheKey(revision: number, filter?: ScheduleFilter): string {
  return `${revision}:${filterSignature(filter)}`;
}

export function cachedSummary(
  revision: number,
  project: Project,
  filter?: ScheduleFilter,
): SummaryModel {
  const key = summaryCacheKey(revision, filter);
  const hit = summaryCache.get(key);
  if (hit) return hit;
  return summaryCache.set(key, compute(project, filter));
}

export function computeSummary(project: Project, filter?: ScheduleFilter): SummaryModel {
  return compute(project, filter);
}

/** Clears the summary cache; tests use it, the app relies on revision keys. */
export function clearSummaryCache(): void {
  summaryCache.clear();
}
