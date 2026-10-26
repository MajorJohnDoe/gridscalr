import { categoryForItem, normalizeRoom } from "./categories";
import { areaShapeOf, areaValue } from "./area";
import { itemIsVisible } from "./layers";
import { itemScaleForDisplay } from "./measure";
import { areaInUnit, lengthInUnit, unitLabel } from "./units";
import { polylineLength } from "./geometry";
import type { MarkupItem, Project } from "./types";

export type QuantityType = "length" | "area" | "count";

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
}

const TYPE_ORDER: Record<QuantityType, number> = {
  length: 0,
  area: 1,
  count: 2,
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
 * Builds report rows from current item data. Nothing is stored on the project.
 *
 * Area deductions are netted inside one category and room only. Totals are
 * sums of the clamped row nets so a deduction can never make an order row
 * negative.
 */
export function calculateQuantities(project: Project, filters: QuantityFilters): QuantitySummary {
  const groups = new Map<string, GroupAccumulator>();
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
      if (filters.page !== "all" && item.page !== filters.page) continue;
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
      } else {
        const scale = itemScaleForDisplay(item, project);
        if (!scale) {
          uncalibratedExcluded += 1;
          continue;
        }
        if (type === "length") {
          gross = lengthInUnit(polylineLength(item.points), scale.pointsPerMeter, lengthUnit);
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

      const key = `${category.id}\u0000${roomKey(room)}\u0000${type}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          categoryId: category.id,
          categoryName: category.name,
          room,
          type,
          gross: 0,
          deduction: 0,
          items: 0,
          wastePercent: category.wastePercent ?? project.settings.quantity.wastePercent,
          roundingStep: category.roundingStep ?? project.settings.quantity.roundingStep,
        };
        groups.set(key, group);
      }
      group.gross += gross;
      group.deduction += deduction;
      group.items += 1;
    }
  }

  const rows: QuantityRow[] = [...groups.values()].map((group) => {
    const net = Math.max(0, group.gross - group.deduction);
    const wasteQuantity = net * (group.wastePercent / 100);
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
        group.type === "length" ? lengthUnit : group.type === "area" ? unitLabel(areaUnit) : "pcs",
      gross: group.gross,
      deduction: group.deduction,
      net,
      wastePercent: group.wastePercent,
      wasteQuantity,
      roundingStep: group.roundingStep,
      orderQuantity,
      items: group.items,
      clamped: group.type === "area" && group.deduction > group.gross,
    };
  });

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
    hiddenExcluded,
    uncalibratedExcluded,
  };
}
