import { categoryForItem, normalizeRoom } from "./categories";
import { pageBuilding, pageDisplayName, pageFloor } from "./documents";
import { areaShapeOf, areaValue } from "./area";
import { itemIsVisible } from "./layers";
import { itemScaleForDisplay } from "./measure";
import { areaInUnit, lengthInUnit, unitLabel, volumeInUnit, volumeUnitLabel } from "./units";
import { angleValue, measurementValue, polylineLength, slopeValue } from "./geometry";
import type { MarkupItem, Project } from "./types";

export type QuantityType = "length" | "area" | "count" | "angle" | "slope" | "volume";

export interface QuantityFilters {
  /** A page number, or "all" for every page. */
  page: number | "all";
  /** null or undefined means every layer. An empty array selects no layers. */
  layerIds?: readonly string[] | null;
  /** null or undefined means every category. */
  categoryId?: string | null;
  /** Case-insensitive room substring. */
  room?: string;
  /** Hidden items and hidden layers are excluded unless this is true. */
  includeHidden?: boolean;
}

export interface QuantityRow {
  categoryId: string;
  categoryName: string;
  /** Empty string means no room. */
  room: string;
  type: QuantityType;
  unit: string;
  /** Area additions, length, or number of count objects. */
  gross: number;
  /** Area deductions. Always zero for length and count. */
  deduction: number;
  net: number;
  /** Effective waste percentage inherited from the category or project. */
  wastePercent: number;
  /** net * wastePercent / 100. */
  wasteQuantity: number;
  /** Effective rounding step inherited from the category or project. */
  roundingStep: number;
  /** Net plus waste, rounded up. Counts always use whole pieces. */
  orderQuantity: number;
  items: number;
  /** True when deduction exceeds gross for this category and room. */
  clamped: boolean;
}

export interface QuantityTypeTotal {
  type: QuantityType;
  unit: string;
  gross: number;
  deduction: number;
  net: number;
  wasteQuantity: number;
  orderQuantity: number;
  items: number;
  clamped: boolean;
}

export interface QuantityRoomSection {
  room: string;
  rows: QuantityRow[];
  totals: QuantityTypeTotal[];
}

export interface QuantityCategorySection {
  categoryId: string;
  categoryName: string;
  rooms: QuantityRoomSection[];
  totals: QuantityTypeTotal[];
}

export interface QuantitySummary {
  categories: QuantityCategorySection[];
  rows: QuantityRow[];
  totals: QuantityTypeTotal[];
  /** Measurements left out because they or their layer are hidden. */
  hiddenExcluded: number;
  /** Length or area measurements without a scale. */
  uncalibratedExcluded: number;
}

interface GroupAccumulator {
  categoryId: string;
  categoryName: string;
  room: string;
  type: QuantityType;
  gross: number;
  deduction: number;
  items: number;
  wastePercent: number;
  roundingStep: number;
  page?: number;
}

export interface QuantityByPageRow extends QuantityRow {
  page: number;
  /** Page title, or "Page N" when the page has no title. */
  pageName: string;
  building: string;
  floor: string;
}

export interface QuantityPageSection {
  page: number;
  pageName: string;
  building: string;
  floor: string;
  rows: QuantityByPageRow[];
  totals: QuantityTypeTotal[];
}

export interface QuantityByPageSummary {
  pages: QuantityPageSection[];
  rows: QuantityByPageRow[];
  hiddenExcluded: number;
  uncalibratedExcluded: number;
}

export type QuantityPageFilters = Omit<QuantityFilters, "page">;

interface MeasuredItem {
  item: MarkupItem;
  categoryId: string;
  categoryName: string;
  room: string;
  type: QuantityType;
  gross: number;
  deduction: number;
  wastePercent: number;
  roundingStep: number;
}

const TYPE_ORDER: Record<QuantityType, number> = {
  length: 0,
  area: 1,
  count: 2,
  angle: 3,
  slope: 4,
  volume: 5,
};

const ROUND_TOLERANCE = 1e-9;

/** Rounds up to a step, ignoring floating-point noise just above a multiple. */
function roundUpToStep(value: number, step: number): number {
  if (!(step > 0)) return value;
  const units = value / step;
  const nearest = Math.round(units);
  if (Math.abs(units - nearest) <= ROUND_TOLERANCE) return nearest * step;
  return Math.ceil(units) * step;
}

function quantityType(item: MarkupItem): QuantityType | null {
  if (item.kind === "length" || item.kind === "area" || item.kind === "count") return item.kind;
  if (item.kind === "radius" || item.kind === "diameter" || item.kind === "arc") return "length";
  if (item.kind === "angle") return "angle";
  if (item.kind === "slope") return "slope";
  if (item.kind === "volume") return "volume";
  return null;
}

function roomKey(room: string): string {
  return room.toLowerCase();
}

function compareRooms(a: string, b: string): number {
  if (!a && b) return 1;
  if (a && !b) return -1;
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function addTypeTotal(totals: Map<QuantityType, QuantityTypeTotal>, row: QuantityRow): void {
  let total = totals.get(row.type);
  if (!total) {
    total = {
      type: row.type,
      unit: row.unit,
      gross: 0,
      deduction: 0,
      net: 0,
      wasteQuantity: 0,
      orderQuantity: 0,
      items: 0,
      clamped: false,
    };
    totals.set(row.type, total);
  }
  total.gross += row.gross;
  total.deduction += row.deduction;
  total.net += row.net;
  total.wasteQuantity += row.wasteQuantity;
  total.orderQuantity += row.orderQuantity;
  total.items += row.items;
  total.clamped ||= row.clamped;
}

function totalsFromRows(rows: QuantityRow[]): QuantityTypeTotal[] {
  const totals = new Map<QuantityType, QuantityTypeTotal>();
  for (const row of rows) addTypeTotal(totals, row);
  return [...totals.values()].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
}

/**
 * Applies the shared page, layer, category, room and visibility filters and
 * measures each matching item. Both the category/room report and the by-page
 * report use this function so their numbers can never diverge.
 */
function forEachMeasuredItem(
  project: Project,
  filters: {
    page?: number | "all";
    layerIds?: readonly string[] | null;
    categoryId?: string | null;
    room?: string;
    includeHidden?: boolean;
  },
  visit: (entry: MeasuredItem) => void,
): { hiddenExcluded: number; uncalibratedExcluded: number } {
  let hiddenExcluded = 0;
  let uncalibratedExcluded = 0;
  const lengthUnit = project.settings.lengthUnit;
  const areaUnit = project.settings.areaUnit;
  const roomFilter = (normalizeRoom(filters.room ?? "") ?? "").toLowerCase();

  for (const layer of project.layers) {
    if (!layer.items.length) continue;
    for (const item of layer.items) {
      const type = quantityType(item);
      if (!type) continue;
      const category = categoryForItem(project, item);
      if (!category) continue;
      const room = normalizeRoom(item.room ?? "") ?? "";
      if (filters.page !== undefined && filters.page !== "all" && item.page !== filters.page) {
        continue;
      }
      if (filters.layerIds && !filters.layerIds.includes(layer.id)) continue;
      if (filters.categoryId && category.id !== filters.categoryId) continue;
      if (roomFilter && !room.toLowerCase().includes(roomFilter)) continue;
      if (filters.includeHidden !== true && !itemIsVisible(item, layer)) {
        hiddenExcluded += 1;
        continue;
      }

      let gross = 0;
      let deduction = 0;
      if (type === "count") {
        gross = 1;
      } else if (type === "angle") {
        gross = angleValue(item) ?? 0;
      } else if (type === "slope") {
        gross = slopeValue(item) ?? 0;
      } else {
        const scale = itemScaleForDisplay(item, project);
        if (!scale) {
          uncalibratedExcluded += 1;
          continue;
        }
        if (type === "length") {
          gross = lengthInUnit(
            measurementValue(item) ?? polylineLength(item.points),
            scale.pointsPerMeter,
            lengthUnit,
          );
        } else if (type === "volume") {
          gross = volumeInUnit(
            areaValue(item.points, "polygon"),
            scale.pointsPerMeter,
            areaUnit,
            item.depth ?? 1,
            lengthUnit,
          );
        } else {
          const area = areaInUnit(
            areaValue(item.points, areaShapeOf(item)),
            scale.pointsPerMeter,
            areaUnit,
          );
          if (item.areaMode === "subtract") deduction = area;
          else gross = area;
        }
      }

      visit({
        item,
        categoryId: category.id,
        categoryName: category.name,
        room,
        type,
        gross,
        deduction,
        wastePercent:
          type === "angle" || type === "slope"
            ? 0
            : (category.wastePercent ?? project.settings.quantity.wastePercent),
        roundingStep:
          type === "angle" || type === "slope"
            ? 0
            : (category.roundingStep ?? project.settings.quantity.roundingStep),
      });
    }
  }

  return { hiddenExcluded, uncalibratedExcluded };
}

function rowFromGroup(
  group: GroupAccumulator,
  units: { length: string; area: string; volume: string },
): QuantityRow {
  const net = Math.max(0, group.gross - group.deduction);
  const special = group.type === "angle" || group.type === "slope";
  const wasteQuantity = special ? 0 : net * (group.wastePercent / 100);
  const rawOrder = net + wasteQuantity;
  const orderQuantity = Math.max(
    net,
    group.type === "count"
      ? roundUpToStep(rawOrder, 1)
      : roundUpToStep(rawOrder, group.roundingStep),
  );
  return {
    categoryId: group.categoryId,
    categoryName: group.categoryName,
    room: group.room,
    type: group.type,
    unit:
      group.type === "length"
        ? units.length
        : group.type === "area"
          ? units.area
          : group.type === "volume"
            ? units.volume
            : group.type === "angle"
              ? "°"
              : group.type === "slope"
                ? "%"
                : "pcs",
    gross: group.gross,
    deduction: group.deduction,
    net,
    wastePercent: group.wastePercent,
    wasteQuantity,
    roundingStep: group.roundingStep,
    orderQuantity: special ? net : orderQuantity,
    items: group.items,
    clamped: group.type === "area" && group.deduction > group.gross,
  };
}

function projectUnits(project: Project): { length: string; area: string; volume: string } {
  return {
    length: project.settings.lengthUnit,
    area: unitLabel(project.settings.areaUnit),
    volume: volumeUnitLabel(project.settings.areaUnit),
  };
}

/**
 * Builds report rows from current item data. Nothing is stored on the project.
 *
 * Area deductions are netted inside one category and room only. Totals are
 * sums of the clamped row nets so a deduction can never make an order row
 * negative.
 */
export function calculateQuantities(project: Project, filters: QuantityFilters): QuantitySummary {
  const groups = new Map<string, GroupAccumulator>();
  const units = projectUnits(project);

  const counters = forEachMeasuredItem(project, filters, (entry) => {
    const key = `${entry.categoryId}\u0000${roomKey(entry.room)}\u0000${entry.type}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        categoryId: entry.categoryId,
        categoryName: entry.categoryName,
        room: entry.room,
        type: entry.type,
        gross: 0,
        deduction: 0,
        items: 0,
        wastePercent: entry.wastePercent,
        roundingStep: entry.roundingStep,
      };
      groups.set(key, group);
    }
    group.gross += entry.gross;
    group.deduction += entry.deduction;
    group.items += 1;
  });

  const rows = [...groups.values()].map((group) => rowFromGroup(group, units));

  const categoryOrder = new Map(project.categories.map((category, index) => [category.id, index]));
  rows.sort((a, b) => {
    const categoryDiff =
      (categoryOrder.get(a.categoryId) ?? Number.MAX_SAFE_INTEGER) -
      (categoryOrder.get(b.categoryId) ?? Number.MAX_SAFE_INTEGER);
    if (categoryDiff) return categoryDiff;
    const roomDiff = compareRooms(a.room, b.room);
    if (roomDiff) return roomDiff;
    return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
  });

  const categories: QuantityCategorySection[] = [];
  for (const row of rows) {
    let category = categories[categories.length - 1];
    if (!category || category.categoryId !== row.categoryId) {
      category = {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        rooms: [],
        totals: [],
      };
      categories.push(category);
    }
    let room = category.rooms[category.rooms.length - 1];
    if (!room || roomKey(room.room) !== roomKey(row.room)) {
      room = { room: row.room, rows: [], totals: [] };
      category.rooms.push(room);
    }
    room.rows.push(row);
  }
  for (const category of categories) {
    for (const room of category.rooms) room.totals = totalsFromRows(room.rows);
    category.totals = totalsFromRows(category.rooms.flatMap((room) => room.rows));
  }

  return {
    categories,
    rows,
    totals: totalsFromRows(rows),
    ...counters,
  };
}

/**
 * Groups the same measurements by page. This is a separate view of the item
 * data for the XLSX workbook; the project itself never stores page totals.
 */
export function calculateQuantitiesByPage(
  project: Project,
  filters: QuantityPageFilters = {},
): QuantityByPageSummary {
  const groups = new Map<string, GroupAccumulator>();
  const units = projectUnits(project);

  const counters = forEachMeasuredItem(project, filters, (entry) => {
    const key = `${entry.item.page}\u0000${entry.categoryId}\u0000${roomKey(entry.room)}\u0000${entry.type}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        categoryId: entry.categoryId,
        categoryName: entry.categoryName,
        room: entry.room,
        type: entry.type,
        gross: 0,
        deduction: 0,
        items: 0,
        wastePercent: entry.wastePercent,
        roundingStep: entry.roundingStep,
        page: entry.item.page,
      };
      groups.set(key, group);
    }
    group.gross += entry.gross;
    group.deduction += entry.deduction;
    group.items += 1;
  });

  const categoryOrder = new Map(project.categories.map((category, index) => [category.id, index]));
  const rows: QuantityByPageRow[] = [...groups.values()]
    .map((group) => ({
      ...rowFromGroup(group, units),
      page: group.page ?? 1,
      pageName: "",
      building: "",
      floor: "",
    }))
    .sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      const categoryDiff =
        (categoryOrder.get(a.categoryId) ?? Number.MAX_SAFE_INTEGER) -
        (categoryOrder.get(b.categoryId) ?? Number.MAX_SAFE_INTEGER);
      if (categoryDiff) return categoryDiff;
      const roomDiff = compareRooms(a.room, b.room);
      if (roomDiff) return roomDiff;
      return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    });

  const pages: QuantityPageSection[] = [];
  for (const row of rows) {
    row.pageName = pageDisplayName(project, row.page) ?? `Page ${row.page}`;
    row.building = pageBuilding(project, row.page) ?? "";
    row.floor = pageFloor(project, row.page) ?? "";
    let page = pages[pages.length - 1];
    if (!page || page.page !== row.page) {
      page = {
        page: row.page,
        pageName: row.pageName,
        building: row.building,
        floor: row.floor,
        rows: [],
        totals: [],
      };
      pages.push(page);
    }
    page.rows.push(row);
  }
  for (const page of pages) page.totals = totalsFromRows(page.rows);

  return { pages, rows, ...counters };
}
