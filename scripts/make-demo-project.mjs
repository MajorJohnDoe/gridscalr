import { stat, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MEZZANINE, PLAN, SITE } from "./plan-geometry.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, "..", "fixtures", "demo-project.gridscalr");
const pdfPath = resolve(here, "..", "fixtures", "industrial-plan.pdf");
const pdfStat = await stat(pdfPath);
const now = "2026-10-26T09:00:00.000Z";

const categories = [
  { id: "cat_floor", name: "Floor", wastePercent: 10, roundingStep: 0.5 },
  { id: "cat_wall", name: "Wall" },
  { id: "cat_ceiling", name: "Ceiling" },
  { id: "cat_facade", name: "Facade" },
  { id: "cat_roof", name: "Roof" },
  { id: "cat_ground", name: "Ground" },
  { id: "cat_other", name: "Other" },
];

// Drawing geometry uses a bottom-left origin. Project items use the app's
// top-left PDF coordinate space, so every Y value is mirrored across the sheet.
const SHEET_HEIGHT = 842;
const pdfY = (drawingY) => SHEET_HEIGHT - drawingY;

const p1 = (x, y) => ({
  x: PLAN.origin.x + x * PLAN.scalePpm,
  y: pdfY(PLAN.origin.y + y * PLAN.scalePpm),
});
const p2 = (x, y) => ({
  x: MEZZANINE.origin.x + (x - 22) * MEZZANINE.scalePpm,
  y: pdfY(MEZZANINE.origin.y + (y - 12) * MEZZANINE.scalePpm),
});
const p3 = (x, y) => ({
  x: SITE.origin.x + x * SITE.scalePpm,
  y: pdfY(SITE.origin.y + y * SITE.scalePpm),
});

const scales = {
  1: { pointsPerMeter: PLAN.scalePpm, sourceUnit: "m" },
  2: { pointsPerMeter: MEZZANINE.scalePpm, sourceUnit: "m" },
  3: { pointsPerMeter: SITE.scalePpm, sourceUnit: "m" },
};

function item(id, kind, page, points, extra = {}) {
  return {
    id,
    page,
    kind,
    points,
    color: "#4cc9f0",
    strokeWidth: 0.75,
    visible: true,
    locked: false,
    scale: scales[page],
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

function drawItem(id, kind, page, points, extra = {}) {
  return item(id, kind, page, points, {
    color: "#f2a93b",
    scale: undefined,
    ...extra,
  });
}

const measureItems = [
  // Floor areas.
  item("item_floor_living", "area", 1, [p1(0, 0), p1(22, 22)], {
    label: "Warehouse floor",
    categoryId: "cat_floor",
    room: "Warehouse",
    areaMode: "add",
    areaShape: "rectangle",
  }),

  // Linear takeoff.
  item("item_wall_partition", "length", 1, [p1(22, 5), p1(34, 5)], {
    label: "Corridor partition",
    categoryId: "cat_wall",
    room: "Office",
  }),
  item("item_wall_warehouse", "length", 1, [p1(0, 22), p1(22, 22)], {
    label: "North wall",
    categoryId: "cat_wall",
    room: "Warehouse",
  }),
  item("item_facade_window", "length", 1, [p1(27.5, 0), p1(30.5, 0)], {
    label: "Meeting window",
    categoryId: "cat_facade",
    room: "Office",
  }),
  item("item_facade_dock", "length", 1, [p1(0, 3.2), p1(0, 6.6)], {
    label: "Dock 01 opening",
    categoryId: "cat_facade",
    room: "Warehouse",
  }),

  // Counts.
  item("item_count_dock", "count", 1, [p1(1.8, 4.9)], {
    label: "Dock 01",
    categoryId: "cat_facade",
    room: "Warehouse",
    countType: "other",
  }),
  item("item_count_entrance", "count", 1, [p1(24.2, 0.4)], {
    label: "Office entrance",
    categoryId: "cat_other",
    room: "Office",
    countType: "door",
  }),
  item("item_count_window", "count", 1, [p1(30.5, 21.8)], {
    label: "Workshop window",
    categoryId: "cat_facade",
    room: "Workshop",
    countType: "window",
  }),
  item("item_count_radiator", "count", 1, [p1(23.1, 11.9)], {
    label: "Office radiator",
    categoryId: "cat_other",
    room: "Office",
    countType: "radiator",
  }),
  item("item_count_toilet", "count", 1, [p1(33.35, 10.75)], {
    label: "WC toilet",
    categoryId: "cat_other",
    room: "Office",
    countType: "fixture",
  }),

  // Mezzanine and site.
  item("item_floor_mezz", "area", 2, [p2(22, 12), p2(34, 22)], {
    label: "Mezzanine floor",
    categoryId: "cat_floor",
    room: "Mezzanine",
    areaMode: "add",
    areaShape: "rectangle",
    labelOffset: { x: 0, y: -40 },
  }),
  item("item_floor_stair_void", "area", 2, [p2(22.35, 12.35), p2(24.85, 14.85)], {
    label: "Stair void deduction",
    categoryId: "cat_floor",
    room: "Mezzanine",
    areaMode: "subtract",
    areaShape: "rectangle",
  }),
  item("item_railing_mezz", "length", 2, [p2(22, 15), p2(22, 22)], {
    label: "Glass railing",
    categoryId: "cat_other",
    room: "Mezzanine",
  }),
  item("item_ground_yard", "area", 3, [p3(1, 1), p3(33, 47)], {
    label: "Truck yard",
    categoryId: "cat_ground",
    room: "Site",
    areaMode: "add",
    areaShape: "rectangle",
  }),
];

const drawItems = [
  drawItem(
    "item_cloud_dock",
    "cloud",
    1,
    [p1(0.3, 10.1), p1(4.7, 10.1), p1(4.7, 14.6), p1(0.3, 14.6)],
    {
      text: "Verify dock leveller",
      fillColor: "#f2a93b",
      opacity: 0.14,
      strokeWidth: 1.5,
      fontSize: 10,
      textOffset: { x: 120, y: 26 },
      textColor: "#f7fbfc",
    },
  ),
  drawItem("item_callout_window", "callout", 1, [p1(24.2, 0.2), p1(27.6, 2.8)], {
    text: "New entrance canopy",
    strokeWidth: 1.2,
    fontSize: 10,
    textBoxWidth: 108,
    textBoxHeight: 28,
    textColor: "#f7fbfc",
  }),
  drawItem("item_text_hatch", "text", 1, [p1(8.0, 4.0)], {
    text: "Keep 3.5 m forklift aisle clear",
    strokeWidth: 1.2,
    fontSize: 9,
    color: "#f2a93b",
  }),
  drawItem("item_arrow_aisle", "arrow", 1, [p1(8.0, 4.3), p1(11.0, 8.8)], {
    strokeWidth: 1.5,
    arrowHeads: "end",
  }),
  drawItem("item_stamp_inspected", "stamp", 1, [p1(20.3, 10.5)], {
    text: "INSPECTED",
    color: "#a78bfa",
    strokeWidth: 1.5,
    fontSize: 13,
  }),
  drawItem("item_delta_b", "delta", 1, [p1(33.0, 20.5)], {
    text: "B",
    label: "2026-10-26",
    strokeWidth: 1.2,
    fontSize: 14,
  }),
  drawItem(
    "item_cloud_stair",
    "cloud",
    2,
    [p2(22.3, 12.3), p2(25.0, 12.3), p2(25.0, 15.0), p2(22.3, 15.0)],
    {
      text: "Verify stair headroom",
      fillColor: "#f2a93b",
      opacity: 0.14,
      strokeWidth: 1.5,
      fontSize: 9,
      textOffset: { x: 95, y: 80 },
      textColor: "#f7fbfc",
    },
  ),
  drawItem("item_text_railing", "text", 2, [p2(22.6, 16.0)], {
    text: "Glass railing to warehouse void",
    strokeWidth: 1.2,
    fontSize: 7.5,
    rotation: 90,
    color: "#f2a93b",
  }),
  drawItem("item_symbol_extinguisher", "symbol", 1, [p1(26.5, 6.5)], {
    symbolId: "fire.extinguisher",
    status: "approved",
    color: "#e5484d",
  }),
  drawItem("item_symbol_exit", "symbol", 1, [p1(23.8, 0.9)], {
    symbolId: "egress.exit",
    status: "not-approved",
    color: "#35c2a1",
    rotation: 90,
  }),
  drawItem("item_symbol_supply", "symbol", 1, [p1(10.5, 18.5)], {
    symbolId: "hvac.supply",
    status: "action-required",
    color: "#4cc9f0",
  }),
  drawItem("item_symbol_panel", "symbol", 1, [p1(22.7, 20.8)], {
    symbolId: "electrical.main-panel",
    status: "approved",
    color: "#f2a93b",
  }),
  drawItem("item_symbol_aed", "symbol", 1, [p1(31.5, 20.6)], {
    symbolId: "egress.aed",
    status: "missing",
    color: "#35c2a1",
  }),
  drawItem("item_symbol_cctv", "symbol", 1, [p1(33.2, 1.2)], {
    symbolId: "electrical.cctv",
    status: "approved",
    color: "#f2a93b",
    rotation: 180,
  }),
];

const project = {
  schemaVersion: 12,
  id: "prj_demo_takeoff",
  name: "Northgate Logistics Hub - Takeoff",
  documents: [
    {
      id: "doc_demo_plan",
      kind: "pdf",
      name: "industrial-plan.pdf",
      path: null,
      relativePath: "industrial-plan.pdf",
      sha256: "",
      pageCount: 3,
      sizeBytes: pdfStat.size,
    },
  ],
  settings: {
    lengthUnit: "m",
    areaUnit: "m2",
    smartLengthUnits: true,
    showGrid: false,
    showCalibration: false,
    snapToGeometry: true,
    snapTolerancePx: 8,
    stampPresets: ["APPROVED", "NOT APPROVED", "FOR INFORMATION", "INSPECTED", "REVISED"],
    quantity: {
      defaultCategoryId: "cat_floor",
      wastePercent: 10,
      roundingStep: 0.5,
    },
  },
  categories,
  assets: {},
  pages: {
    1: {
      name: "Ground floor",
      building: "Northgate",
      floor: "Ground floor",
      calibration: {
        id: "cal_demo_page_1",
        source: "reference",
        p1: p1(PLAN.calibration.p1.x, PLAN.calibration.p1.y),
        p2: p1(PLAN.calibration.p2.x, PLAN.calibration.p2.y),
        knownLength: PLAN.calibration.metres,
        unit: "m",
        pointsPerMeter: PLAN.scalePpm,
        createdAt: now,
      },
    },
    2: {
      name: "Mezzanine",
      building: "Northgate",
      floor: "Mezzanine",
      calibration: {
        id: "cal_demo_page_2",
        source: "manual",
        ratio: 50,
        pointsPerMeter: MEZZANINE.scalePpm,
        createdAt: now,
      },
    },
    3: {
      name: "Site plan",
      building: "Northgate",
      floor: "Site",
      calibration: {
        id: "cal_demo_page_3",
        source: "manual",
        ratio: 400,
        pointsPerMeter: SITE.scalePpm,
        createdAt: now,
      },
    },
  },
  markupsViews: [
    {
      id: "view_room_review",
      name: "Room review",
      columns: ["name", "type", "page", "layer", "value", "category", "room", "visible", "locked"],
      pageFilter: "all",
      typeFilter: "measure",
      categoryId: null,
      symbolCategory: null,
      search: "",
      groupBy: ["building", "floor", "room"],
      sort: { column: "page", direction: "asc" },
    },
    {
      id: "view_drawing_checks",
      name: "Drawing checks",
      columns: ["name", "type", "page", "layer", "visible", "locked"],
      pageFilter: "all",
      typeFilter: "draw",
      categoryId: null,
      symbolCategory: null,
      search: "",
      groupBy: ["page"],
      sort: { column: "name", direction: "asc" },
    },
    {
      id: "view_symbols_status",
      name: "Symbols & status",
      columns: ["name", "type", "page", "layer", "category", "status", "visible", "locked"],
      pageFilter: "all",
      typeFilter: "symbol",
      categoryId: null,
      symbolCategory: null,
      search: "",
      groupBy: ["category"],
      sort: { column: "name", direction: "asc" },
    },
  ],
  layers: [
    {
      id: "layer_markups",
      name: "Site markups",
      kind: "draw",
      visible: true,
      locked: false,
      opacity: 1,
      color: "#f2a93b",
      items: drawItems,
    },
    {
      id: "layer_measurements",
      name: "Measurements",
      kind: "measure",
      visible: true,
      locked: false,
      opacity: 1,
      color: "#4cc9f0",
      items: measureItems,
    },
  ],
  activeLayerId: "layer_measurements",
  createdAt: now,
  updatedAt: now,
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(project, null, 2)}\n`);
console.log(`Wrote ${output}`);
