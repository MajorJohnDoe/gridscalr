import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, "..", "fixtures", "demo-project.gridscalr");
const now = "2026-10-25T09:00:00.000Z";

const categories = [
  { id: "cat_floor", name: "Floor", wastePercent: 10, roundingStep: 0.5 },
  { id: "cat_wall", name: "Wall" },
  { id: "cat_ceiling", name: "Ceiling" },
  { id: "cat_facade", name: "Facade" },
  { id: "cat_roof", name: "Roof" },
  { id: "cat_ground", name: "Ground" },
  { id: "cat_other", name: "Other" },
];

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
    scale: { pointsPerMeter: 30, sourceUnit: "m" },
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

const measureItems = [
  item("item_floor_living", "area", 1, [
    { x: 150, y: 235 },
    { x: 330, y: 370 },
  ], {
    label: "Living floor",
    categoryId: "cat_floor",
    room: "Living",
    areaMode: "add",
    areaShape: "rectangle",
    color: "#4cc9f0",
  }),
  item("item_floor_kitchen", "area", 1, [
    { x: 330, y: 370 },
    { x: 610, y: 470 },
  ], {
    label: "Kitchen / dining floor",
    categoryId: "cat_floor",
    room: "Kitchen / dining",
    areaMode: "add",
    areaShape: "rectangle",
    color: "#4cc9f0",
  }),
  item("item_floor_shaft", "area", 1, [
    { x: 480, y: 425 },
    { x: 515, y: 462 },
  ], {
    label: "Shaft deduction",
    categoryId: "cat_floor",
    room: "Kitchen / dining",
    areaMode: "subtract",
    areaShape: "rectangle",
    color: "#4cc9f0",
  }),
  item("item_wall_partition", "length", 1, [
    { x: 330, y: 370 },
    { x: 610, y: 370 },
  ], {
    label: "Partition wall",
    categoryId: "cat_wall",
    room: "Kitchen / dining",
    color: "#4cc9f0",
  }),
  item("item_facade_window", "length", 1, [
    { x: 230, y: 470 },
    { x: 295, y: 470 },
  ], {
    label: "Window run",
    categoryId: "cat_facade",
    room: "Living",
    color: "#4cc9f0",
  }),
  item("item_count_door_living", "count", 1, [{ x: 165, y: 270 }], {
    label: "Living door",
    categoryId: "cat_other",
    room: "Living",
    countType: "door",
    color: "#4cc9f0",
  }),
  item("item_count_door_study", "count", 1, [{ x: 340, y: 280 }], {
    label: "Study door",
    categoryId: "cat_other",
    room: "Study",
    countType: "door",
    color: "#4cc9f0",
  }),
  item("item_count_radiator", "count", 1, [{ x: 365, y: 210 }], {
    label: "Kitchen radiator",
    categoryId: "cat_other",
    room: "Kitchen / dining",
    countType: "radiator",
    color: "#4cc9f0",
  }),
  item("item_floor_bedroom", "area", 2, [
    { x: 190, y: 280 },
    { x: 390, y: 475 },
  ], {
    label: "Bedroom 1 floor",
    categoryId: "cat_floor",
    room: "Bedroom 1",
    areaMode: "add",
    areaShape: "rectangle",
    color: "#4cc9f0",
    scale: { pointsPerMeter: 28.34645669, sourceUnit: "m" },
  }),
];

const drawItems = [
  item("item_cloud_bath", "cloud", 1, [
    { x: 475, y: 295 },
    { x: 615, y: 295 },
    { x: 615, y: 375 },
    { x: 475, y: 375 },
  ], {
    text: "Verify floor drain",
    fillColor: "#f2a93b",
    opacity: 0.14,
    color: "#f2a93b",
    strokeWidth: 1.5,
    fontSize: 10,
    textOffset: { x: 0, y: 58 },
    textColor: "#f7fbfc",
    scale: undefined,
  }),
  item("item_callout_window", "callout", 1, [
    { x: 520, y: 470 },
    { x: 650, y: 515 },
  ], {
    text: "Replace window seal",
    color: "#4cc9f0",
    strokeWidth: 1.2,
    fontSize: 10,
    textBoxWidth: 105,
    textBoxHeight: 30,
    textColor: "#f7fbfc",
    scale: undefined,
  }),
  item("item_stamp_bath", "stamp", 1, [{ x: 725, y: 445 }], {
    text: "INSPECTED",
    color: "#a78bfa",
    strokeWidth: 1.5,
    fontSize: 13,
    scale: undefined,
  }),
  item("item_text_hatch", "text", 1, [{ x: 650, y: 205 }], {
    text: "Access hatch — check clearance",
    color: "#f2a93b",
    strokeWidth: 1.2,
    fontSize: 9,
    scale: undefined,
  }),
  item("item_arrow_hatch", "arrow", 1, [
    { x: 635, y: 215 },
    { x: 560, y: 235 },
  ], {
    color: "#f2a93b",
    strokeWidth: 1.5,
    arrowHeads: "end",
    scale: undefined,
  }),
  item("item_delta_b", "delta", 1, [{ x: 760, y: 505 }], {
    text: "B",
    label: "2026-10-25",
    color: "#f2a93b",
    strokeWidth: 1.2,
    fontSize: 14,
    scale: undefined,
  }),
];

const project = {
  schemaVersion: 8,
  id: "prj_demo_takeoff",
  name: "Riverside House - Takeoff",
  documents: [
    {
      id: "doc_demo_plan",
      kind: "pdf",
      name: "sample-plan.pdf",
      path: null,
      relativePath: "sample-plan.pdf",
      sha256: "",
      pageCount: 2,
      sizeBytes: 3781,
    },
  ],
  settings: {
    lengthUnit: "m",
    areaUnit: "m2",
    showGrid: false,
    showCalibration: true,
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
    "1": {
      calibration: {
        id: "cal_demo_page_1",
        source: "reference",
        p1: { x: 150, y: 135 },
        p2: { x: 450, y: 135 },
        knownLength: 10,
        unit: "m",
        pointsPerMeter: 30,
        createdAt: now,
      },
    },
    "2": {
      calibration: {
        id: "cal_demo_page_2",
        source: "manual",
        ratio: 100,
        pointsPerMeter: 28.34645669,
        createdAt: now,
      },
    },
  },
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
