import type { InspectionStatus, Point, SymbolCategory } from "./types";

/**
 * Built-in facility symbols are paper-space vector line art. The same
 * primitives are rendered by the canvas, the symbol library and the flattened
 * PDF export, so every placed symbol stays crisp and matches the print.
 */
export const SYMBOL_SIZE = 20;
export const SYMBOL_VIEWBOX = 24;
export const DEFAULT_SYMBOL_ID = "fire.extinguisher";

export interface SymbolPath {
  points: Point[];
  closed: boolean;
}

export interface SymbolCircle {
  center: Point;
  radius: number;
}

export interface SymbolDefinition {
  id: string;
  name: string;
  category: SymbolCategory;
  keywords: string[];
  paths: SymbolPath[];
  circles: SymbolCircle[];
}

export const SYMBOL_CATEGORIES: SymbolCategory[] = [
  "fire",
  "egress",
  "hvac",
  "electrical",
  "building",
  "waste",
];

export const SYMBOL_CATEGORY_LABELS: Record<SymbolCategory, string> = {
  fire: "Fire protection",
  egress: "Evacuation & safety",
  hvac: "HVAC & plumbing",
  electrical: "Electrical & controls",
  building: "Building elements",
  waste: "Waste & environment",
};

export const SYMBOL_CATEGORY_COLORS: Record<SymbolCategory, string> = {
  fire: "#e5484d",
  egress: "#35c2a1",
  hvac: "#4cc9f0",
  electrical: "#f2a93b",
  building: "#a78bfa",
  waste: "#8fbf6a",
};

export const INSPECTION_STATUSES: InspectionStatus[] = [
  "approved",
  "not-approved",
  "action-required",
  "missing",
];

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  approved: "Approved",
  "not-approved": "Not approved",
  "action-required": "Action required",
  missing: "Missing",
};

export const INSPECTION_STATUS_COLORS: Record<InspectionStatus, string> = {
  approved: "#35c2a1",
  "not-approved": "#f26d6d",
  "action-required": "#f2a93b",
  missing: "#9aa8ae",
};

const p = (x: number, y: number): Point => ({ x, y });

function path(points: Array<[number, number]>, closed = false): SymbolPath {
  return { points: points.map(([x, y]) => p(x, y)), closed };
}

function ln(x1: number, y1: number, x2: number, y2: number): SymbolPath {
  return path([
    [x1, y1],
    [x2, y2],
  ]);
}

function rect(x: number, y: number, width: number, height: number): SymbolPath {
  return path(
    [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ],
    true,
  );
}

function circle(cx: number, cy: number, radius: number): SymbolCircle {
  return { center: p(cx, cy), radius };
}

function arc(
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number,
  steps = 14,
): SymbolPath {
  const points: Array<[number, number]> = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = start + ((end - start) * index) / steps;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return path(points);
}

function arrow(x1: number, y1: number, x2: number, y2: number, head = 2.4): SymbolPath[] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  return [
    ln(x1, y1, x2, y2),
    ln(
      x2,
      y2,
      x2 - Math.cos(angle - Math.PI / 6) * head,
      y2 - Math.sin(angle - Math.PI / 6) * head,
    ),
    ln(
      x2,
      y2,
      x2 - Math.cos(angle + Math.PI / 6) * head,
      y2 - Math.sin(angle + Math.PI / 6) * head,
    ),
  ];
}

function sym(
  id: string,
  name: string,
  category: SymbolCategory,
  keywords: string[],
  paths: SymbolPath[],
  circles: SymbolCircle[] = [],
): SymbolDefinition {
  return { id, name, category, keywords, paths, circles };
}

export const SYMBOLS: SymbolDefinition[] = [
  // Fire protection
  sym(
    "fire.extinguisher",
    "Fire extinguisher",
    "fire",
    ["brandsläckare", "släckare", "pulver", "skum", "co2"],
    [
      rect(9, 7, 6, 13),
      ln(11, 7, 11, 4),
      ln(13, 7, 13, 4),
      ln(10, 4, 14, 4),
      ln(13, 9, 17, 9),
      ln(17, 9, 17, 13),
      ln(16, 13, 18, 13),
    ],
  ),
  sym(
    "fire.hose",
    "Fire hose reel",
    "fire",
    ["brandpost", "brandslang", "slangvinda", "inomhusbrandpost"],
    [circPath(11, 13, 6), circPath(11, 13, 1.5), ln(15, 9, 20, 4), ln(20, 4, 22, 4)],
    [circle(11, 13, 6)],
  ),
  sym(
    "fire.blanket",
    "Fire blanket",
    "fire",
    ["brandfilt", "filt", "släckfilt"],
    [rect(5, 3, 14, 18), ln(5, 3, 19, 21), ln(19, 3, 5, 21), ln(8, 6, 16, 6)],
  ),
  sym(
    "fire.call-point",
    "Manual call point",
    "fire",
    ["brandlarm", "larmknapp", "manuell larmknapp", "tryckknapp"],
    [rect(5, 3, 14, 18), circPath(12, 12, 4.5), ln(8, 8, 16, 16), ln(16, 8, 8, 16)],
    [circle(12, 12, 4.5)],
  ),
  sym(
    "fire.smoke-detector",
    "Smoke detector",
    "fire",
    ["rökdetektor", "brandvarnare", "detektor", "rök"],
    [
      circPath(12, 12, 7),
      circPath(12, 12, 2),
      arc(12, 12, 4.2, 0.25, 2.9),
      arc(12, 12, 4.2, 3.4, 6.0),
    ],
    [circle(12, 12, 7), circle(12, 12, 2)],
  ),
  sym(
    "fire.heat-detector",
    "Heat detector",
    "fire",
    ["värmdetektor", "termisk detektor", "värme"],
    [circPath(12, 9, 5), ln(12, 6, 12, 14), circPath(12, 16, 2)],
    [circle(12, 9, 5), circle(12, 16, 2)],
  ),
  sym(
    "fire.door",
    "Fire door",
    "fire",
    ["branddörr", "dörr", "brandcellsgräns"],
    [
      rect(5, 3, 14, 18),
      ln(5, 21, 15, 11),
      arc(5, 21, 14, -Math.PI / 2, 0),
      path([
        [15, 8],
        [17, 10],
        [16, 12],
        [18, 14],
        [16, 17],
      ]),
    ],
  ),
  sym(
    "fire.smoke-vent",
    "Smoke vent",
    "fire",
    ["brandgasventilator", "rökventilation", "brandgas", "ventilator"],
    [rect(4, 15, 16, 5), ...arrow(7, 13, 7, 4), ...arrow(12, 13, 12, 3), ...arrow(17, 13, 17, 4)],
  ),

  // Evacuation and safety
  sym(
    "egress.exit",
    "Emergency exit",
    "egress",
    ["utrymningsväg", "nödutgång", "utrymning", "grön gubbe", "exit"],
    [
      rect(3, 3, 7, 18),
      circlePath(15, 6, 1.5),
      ln(15, 8, 18, 13),
      ln(15, 9, 11, 12),
      ln(15, 9, 19, 9),
      ln(18, 13, 15, 18),
      ln(18, 13, 21, 18),
      ...arrow(18, 20, 22, 20, 2),
    ],
    [circle(15, 6, 1.5)],
  ),
  sym(
    "egress.assembly",
    "Assembly point",
    "egress",
    ["uppsamlingsplats", "samlingsplats", "mötesplats", "utrymning"],
    [
      circlePath(7, 6, 1.7),
      circlePath(12, 5, 1.7),
      circlePath(17, 6, 1.7),
      ln(7, 8, 7, 14),
      ln(12, 7, 12, 15),
      ln(17, 8, 17, 14),
      ln(7, 14, 4, 19),
      ln(7, 14, 10, 19),
      ln(12, 15, 9, 20),
      ln(12, 15, 15, 20),
      ln(17, 14, 14, 19),
      ln(17, 14, 20, 19),
      ln(4, 11, 7, 10),
      ln(17, 10, 20, 11),
    ],
    [circle(7, 6, 1.7), circle(12, 5, 1.7), circle(17, 6, 1.7)],
  ),
  sym(
    "egress.aed",
    "AED",
    "egress",
    ["hjärtstartare", "defibrillator", "aed", "första hjälpen"],
    [
      rect(4, 5, 16, 14),
      path(
        [
          [7, 9],
          [9, 7],
          [11, 9],
          [12, 10],
          [13, 9],
          [15, 7],
          [17, 9],
          [17, 12],
          [12, 17],
          [7, 12],
        ],
        true,
      ),
      path([
        [12, 10],
        [10, 13],
        [13, 13],
        [11, 16],
      ]),
    ],
  ),
  sym(
    "egress.first-aid",
    "First aid",
    "egress",
    ["första hjälpen", "förband", "sjukvård", "kors"],
    [rect(4, 4, 16, 16), ln(12, 8, 12, 16), ln(8, 12, 16, 12)],
  ),

  // HVAC and plumbing
  sym(
    "hvac.supply",
    "Supply air diffuser",
    "hvac",
    ["tilluftsdon", "tilluft", "don", "diffuser", "ftx"],
    [
      rect(3, 3, 18, 18),
      ...arrow(12, 3, 12, 10),
      ...arrow(12, 21, 12, 14),
      ...arrow(3, 12, 10, 12),
      ...arrow(21, 12, 14, 12),
    ],
  ),
  sym(
    "hvac.extract",
    "Extract air diffuser",
    "hvac",
    ["frånluftsdon", "frånluft", "don", "diffuser", "ftx"],
    [
      rect(3, 3, 18, 18),
      ...arrow(12, 10, 12, 3),
      ...arrow(12, 14, 12, 21),
      ...arrow(10, 12, 3, 12),
      ...arrow(14, 12, 21, 12),
    ],
  ),
  sym(
    "hvac.transfer",
    "Transfer air diffuser",
    "hvac",
    ["överluftsdon", "överluft", "transfer", "don"],
    [rect(3, 5, 18, 14), ...arrow(3, 12, 11, 12), ...arrow(21, 12, 13, 12)],
  ),
  sym(
    "hvac.ahu",
    "Air handling unit",
    "hvac",
    ["ventilationsaggregat", "ftx", "aggregat", "ahu", "fläkt"],
    [
      rect(3, 5, 18, 14),
      circlePath(8.5, 12, 3),
      circlePath(15.5, 12, 3),
      ln(8.5, 9, 8.5, 15),
      ln(15.5, 9, 15.5, 15),
      ln(3, 12, 5.5, 12),
      ln(18.5, 12, 21, 12),
    ],
    [circle(8.5, 12, 3), circle(15.5, 12, 3)],
  ),
  sym(
    "hvac.valve",
    "Shut-off valve",
    "hvac",
    ["stängningsventil", "avstängningsventil", "ventil", "vatten", "värme", "gas"],
    [
      path(
        [
          [4, 8],
          [12, 12],
          [4, 16],
        ],
        true,
      ),
      path(
        [
          [20, 8],
          [12, 12],
          [20, 16],
        ],
        true,
      ),
      ln(12, 12, 12, 5),
      ln(9, 5, 15, 5),
    ],
  ),
  sym(
    "hvac.radiator",
    "Radiator",
    "hvac",
    ["radiator", "element", "värme"],
    [
      rect(3, 7, 18, 10),
      ln(6, 7, 6, 17),
      ln(9, 7, 9, 17),
      ln(12, 7, 12, 17),
      ln(15, 7, 15, 17),
      ln(18, 7, 18, 17),
    ],
  ),
  sym(
    "hvac.convector",
    "Convector",
    "hvac",
    ["konvektor", "konvektionsbatteri", "värme"],
    [rect(3, 8, 18, 8), ln(6, 10, 18, 10), ln(6, 12, 18, 12), ln(6, 14, 18, 14)],
  ),
  sym(
    "hvac.cooling",
    "Cooling unit",
    "hvac",
    ["luftkylare", "kylbatteri", "kyla", "kylaggregat"],
    [
      rect(3, 6, 18, 12),
      ln(12, 8, 12, 16),
      ln(8, 10, 16, 14),
      ln(8, 14, 16, 10),
      ln(10, 8, 14, 16),
      ln(14, 8, 10, 16),
    ],
  ),
  sym(
    "hvac.pump",
    "Circulation pump",
    "hvac",
    ["cirkulationspump", "pump", "vatten", "värme"],
    [
      circlePath(11, 12, 6),
      path(
        [
          [8, 9],
          [16, 12],
          [8, 15],
        ],
        true,
      ),
      ln(17, 12, 21, 12),
    ],
    [circle(11, 12, 6)],
  ),
  sym(
    "hvac.heat-exchanger",
    "Heat exchanger",
    "hvac",
    ["värmeväxlare", "värme", "växlare"],
    [
      rect(3, 6, 18, 12),
      path([
        [6, 9],
        [9, 15],
        [12, 9],
        [15, 15],
        [18, 9],
      ]),
      path([
        [6, 15],
        [9, 9],
        [12, 15],
        [15, 9],
        [18, 15],
      ]),
    ],
  ),
  sym(
    "hvac.water-meter",
    "Water meter",
    "hvac",
    ["vattenmätare", "mätare", "vatten"],
    [circlePath(12, 12, 7), ln(12, 12, 16, 8), circlePath(12, 12, 1.2)],
    [circle(12, 12, 7)],
  ),
  sym(
    "hvac.energy-meter",
    "Energy meter",
    "hvac",
    ["energimätare", "elmätare", "mätare", "energi"],
    [
      circlePath(12, 12, 7),
      path(
        [
          [13, 6],
          [9, 13],
          [12, 13],
          [11, 18],
          [15, 11],
          [12, 11],
        ],
        true,
      ),
    ],
    [circle(12, 12, 7)],
  ),
  sym(
    "hvac.expansion-vessel",
    "Expansion vessel",
    "hvac",
    ["expansionskärl", "kärl", "värme", "vatten"],
    [rect(7, 3, 10, 18), ln(7, 10, 17, 10), ln(12, 21, 12, 23), ln(5, 23, 19, 23)],
  ),
  sym(
    "hvac.floor-drain",
    "Floor drain",
    "hvac",
    ["golvbrunn", "brunn", "avlopp", "dränering"],
    [rect(5, 5, 14, 14), ln(8, 8, 16, 8), ln(8, 11, 16, 11), ln(8, 14, 16, 14), ln(8, 17, 16, 17)],
  ),
  sym(
    "hvac.oil-separator",
    "Oil separator",
    "hvac",
    ["oljeavskiljare", "olja", "avskiljare", "avlopp"],
    [
      rect(3, 7, 18, 12),
      path([
        [5, 12],
        [8, 10],
        [11, 12],
        [14, 10],
        [17, 12],
        [19, 11],
      ]),
      ln(12, 5, 12, 8),
      path(
        [
          [9, 16],
          [12, 19],
          [15, 16],
          [12, 14],
        ],
        true,
      ),
    ],
  ),

  // Electrical and controls
  sym(
    "electrical.main-panel",
    "Main electrical panel",
    "electrical",
    ["elcentral", "huvudcentral", "plc", "duc", "el"],
    [
      rect(4, 2, 16, 20),
      ln(7, 6, 17, 6),
      ln(7, 9, 12, 9),
      ln(14, 9, 17, 9),
      ln(7, 12, 12, 12),
      ln(14, 12, 17, 12),
      ln(7, 15, 12, 15),
      ln(14, 15, 17, 15),
      ln(7, 18, 17, 18),
    ],
  ),
  sym(
    "electrical.fuse-cabinet",
    "Fuse cabinet",
    "electrical",
    ["säkringsskåp", "gruppcentral", "säkring", "el"],
    [
      rect(4, 3, 16, 18),
      rect(7, 6, 4, 7),
      rect(13, 6, 4, 7),
      ln(9, 6, 9, 13),
      ln(15, 6, 15, 13),
      ln(7, 17, 17, 17),
    ],
  ),
  sym(
    "electrical.outlet-230",
    "Wall outlet 230 V",
    "electrical",
    ["vägguttag", "uttag", "230v", "eluttag"],
    [rect(6, 4, 12, 16), ln(8, 17, 16, 17), ln(9, 7, 9, 12), ln(15, 7, 15, 12), ln(9, 15, 15, 15)],
  ),
  sym(
    "electrical.outlet-400",
    "Wall outlet 400 V",
    "electrical",
    ["vägguttag", "uttag", "400v", "kraftuttag", "eluttag"],
    [
      rect(6, 4, 12, 16),
      ln(8, 17, 16, 17),
      ln(9, 7, 9, 12),
      ln(12, 7, 12, 12),
      ln(15, 7, 15, 12),
      ln(9, 15, 15, 15),
    ],
  ),
  sym(
    "electrical.data-outlet",
    "Data outlet",
    "electrical",
    ["datauttag", "nätverk", "rj45", "uttag", "tele"],
    [
      rect(6, 4, 12, 16),
      rect(9, 8, 6, 5),
      ln(10, 10, 14, 10),
      ln(10, 12, 14, 12),
      ln(8, 17, 16, 17),
    ],
  ),
  sym(
    "electrical.light",
    "Lighting fixture",
    "electrical",
    ["belysning", "armatur", "lampa", "standard"],
    [
      circlePath(12, 12, 5),
      ln(12, 3, 12, 6),
      ln(12, 18, 12, 21),
      ln(3, 12, 6, 12),
      ln(18, 12, 21, 12),
      ln(6, 6, 8, 8),
      ln(16, 16, 18, 18),
    ],
    [circle(12, 12, 5)],
  ),
  sym(
    "electrical.emergency-light",
    "Emergency lighting",
    "electrical",
    ["nödbelysning", "nödljus", "belysning", "säkerhet"],
    [rect(3, 6, 18, 9), circlePath(8, 10.5, 2), circlePath(16, 10.5, 2), ...arrow(12, 15, 12, 21)],
    [circle(8, 10.5, 2), circle(16, 10.5, 2)],
  ),
  sym(
    "electrical.access",
    "Access control",
    "electrical",
    ["passagekontroll", "kortläsare", "porttelefon", "passage"],
    [
      rect(5, 3, 14, 18),
      circlePath(9, 7, 1),
      circlePath(12, 7, 1),
      circlePath(15, 7, 1),
      circlePath(9, 11, 1),
      circlePath(12, 11, 1),
      circlePath(15, 11, 1),
      ln(8, 16, 16, 16),
      ln(8, 18, 13, 18),
    ],
    [
      circle(9, 7, 1),
      circle(12, 7, 1),
      circle(15, 7, 1),
      circle(9, 11, 1),
      circle(12, 11, 1),
      circle(15, 11, 1),
    ],
  ),
  sym(
    "electrical.cctv",
    "CCTV camera",
    "electrical",
    ["kamera", "cctv", "övervakning", "kameraövervakning"],
    [
      path(
        [
          [4, 7],
          [17, 7],
          [20, 10],
          [17, 13],
          [4, 13],
        ],
        true,
      ),
      circlePath(15, 10, 1.8),
      ln(8, 13, 8, 17),
      ln(5, 20, 11, 17),
    ],
    [circle(15, 10, 1.8)],
  ),
  sym(
    "electrical.temperature",
    "Temperature sensor",
    "electrical",
    ["temperaturgivare", "temperatur", "givare", "termometer"],
    [
      ln(12, 3, 12, 15),
      circlePath(12, 18, 3),
      ln(14, 6, 17, 6),
      ln(14, 9, 17, 9),
      ln(14, 12, 17, 12),
    ],
    [circle(12, 18, 3)],
  ),
  sym(
    "electrical.co2",
    "CO₂ sensor",
    "electrical",
    ["co2-givare", "koldioxid", "co2", "givare", "ventilation"],
    [
      circPath(12, 12, 7),
      circPath(9, 10, 1.2),
      circPath(14, 9, 1.2),
      circPath(13, 15, 1.2),
      arc(12, 12, 3.5, 0.2, 2),
      arc(12, 12, 3.5, 3.4, 5.2),
    ],
    [circle(12, 12, 7), circle(9, 10, 1.2), circle(14, 9, 1.2), circle(13, 15, 1.2)],
  ),
  sym(
    "electrical.humidity",
    "Humidity sensor",
    "electrical",
    ["fuktgivare", "fukt", "luftfuktighet", "givare"],
    [
      path(
        [
          [12, 3],
          [7, 11],
          [8, 16],
          [12, 20],
          [16, 16],
          [17, 11],
        ],
        true,
      ),
      path([
        [9, 16],
        [11, 18],
        [13, 16],
        [15, 18],
      ]),
    ],
  ),
  sym(
    "electrical.wifi",
    "Wi-Fi access point",
    "electrical",
    ["wifi", "accesspunkt", "ap", "nätverk", "trådlös"],
    [circlePath(12, 19, 1.5), arc(12, 19, 5, -2.45, -0.69), arc(12, 19, 9, -2.45, -0.69)],
    [circle(12, 19, 1.5)],
  ),

  // Building elements
  sym(
    "building.window",
    "Window",
    "building",
    ["fönster", "fönsterbåge", "glas", "skadad"],
    [rect(3, 5, 18, 14), ln(12, 5, 12, 19), ln(3, 12, 21, 12)],
  ),
  sym(
    "building.door",
    "Door",
    "building",
    ["dörr", "dörrblad", "kräver justering", "tröskel"],
    [rect(5, 3, 14, 18), ln(5, 21, 14, 12), arc(5, 21, 13, -Math.PI / 2, 0), circlePath(16, 12, 1)],
    [circle(16, 12, 1)],
  ),
  sym(
    "building.damage",
    "Damage marker",
    "building",
    ["skada", "anmärkning", "fukt", "spricka", "slitage", "varning"],
    [
      path(
        [
          [12, 3],
          [21, 20],
          [3, 20],
        ],
        true,
      ),
      ln(12, 8, 12, 14),
      circlePath(12, 17, 1),
    ],
    [circle(12, 17, 1)],
  ),
  sym(
    "building.elevator",
    "Elevator",
    "building",
    ["hiss", "personhiss", "transport"],
    [
      rect(5, 3, 14, 18),
      ln(12, 3, 12, 21),
      ...arrow(9, 12, 9, 7, 1.8),
      ...arrow(15, 12, 15, 17, 1.8),
    ],
  ),
  sym(
    "building.stair-lift",
    "Stair lift",
    "building",
    ["trapphiss", "stolhiss", "trappa", "tillgänglighet"],
    [
      path([
        [3, 21],
        [3, 17],
        [7, 17],
        [7, 13],
        [11, 13],
        [11, 9],
        [15, 9],
        [15, 5],
        [21, 5],
      ]),
      path(
        [
          [9, 7],
          [14, 7],
          [15, 10],
          [10, 10],
        ],
        true,
      ),
      ln(12, 10, 12, 13),
    ],
  ),
  sym(
    "building.dock",
    "Loading dock",
    "building",
    ["lastbrygga", "lastkaj", "dock", "lastning"],
    [
      rect(3, 11, 18, 8),
      ln(3, 11, 8, 6),
      ...arrow(12, 10, 12, 3),
      ln(8, 19, 8, 16),
      ln(16, 19, 16, 16),
    ],
  ),

  // Waste and environment
  sym(
    "waste.recycling",
    "Recycling",
    "waste",
    ["återvinning", "miljörum", "källsortering", "sortering"],
    [
      ...arrow(12, 3, 5, 15),
      ...arrow(5, 15, 19, 15),
      ...arrow(19, 15, 12, 3),
      ln(9, 8, 12, 12),
      ln(15, 8, 12, 12),
    ],
  ),
  sym(
    "waste.bins",
    "Sorting bins",
    "waste",
    ["källsorteringskärl", "sortering", "kärl", "avfall", "miljörum"],
    [
      rect(3, 9, 5, 12),
      rect(9.5, 7, 5, 14),
      rect(16, 10, 5, 11),
      ln(3, 9, 8, 9),
      ln(9.5, 7, 14.5, 7),
      ln(16, 10, 21, 10),
    ],
  ),
  sym(
    "waste.hazardous",
    "Hazardous waste",
    "waste",
    ["farligt avfall", "miljöfarligt", "avfall", "varning"],
    [
      path(
        [
          [12, 3],
          [21, 20],
          [3, 20],
        ],
        true,
      ),
      path(
        [
          [12, 7],
          [9, 13],
          [10, 16],
          [12, 18],
          [14, 16],
          [15, 13],
        ],
        true,
      ),
    ],
  ),
  sym(
    "waste.battery",
    "Battery collection",
    "waste",
    ["batteri", "batteriholk", "farligt avfall", "återvinning"],
    [
      rect(5, 7, 14, 12),
      rect(9, 4, 6, 3),
      ln(11, 10, 11, 16),
      ln(13, 10, 13, 16),
      ln(9, 19, 9, 21),
      ln(15, 19, 15, 21),
    ],
  ),
  sym(
    "waste.chemical",
    "Chemical cabinet",
    "waste",
    ["kemikalieskåp", "kemikalier", "förvaring", "farligt avfall"],
    [
      rect(5, 3, 14, 18),
      path(
        [
          [12, 6],
          [16, 10],
          [12, 14],
          [8, 10],
        ],
        true,
      ),
      ln(12, 8, 12, 12),
      circlePath(12, 13, 0.8),
      ln(8, 18, 16, 18),
    ],
    [circle(12, 13, 0.8)],
  ),
  sym(
    "waste.grease",
    "Grease separator",
    "waste",
    ["fettavskiljare", "fett", "avskiljare", "avlopp", "miljö"],
    [
      rect(3, 7, 18, 12),
      path([
        [5, 12],
        [8, 10],
        [11, 12],
        [14, 10],
        [17, 12],
        [19, 11],
      ]),
      path(
        [
          [9, 17],
          [12, 20],
          [15, 17],
          [12, 15],
        ],
        true,
      ),
    ],
  ),
];

/** A single stroked circle path, used by the shared canvas/PDF renderers. */
function circPath(cx: number, cy: number, radius: number): SymbolPath {
  return arc(cx, cy, radius, 0, Math.PI * 2);
}

/** Convenience alias used inside a few icon definitions. */
function circlePath(cx: number, cy: number, radius: number): SymbolPath {
  return circPath(cx, cy, radius);
}

const SYMBOL_MAP = new Map(SYMBOLS.map((symbol) => [symbol.id, symbol]));

export const UNKNOWN_SYMBOL: SymbolDefinition = {
  id: "unknown",
  name: "Unknown symbol",
  category: "building",
  keywords: ["unknown", "missing"],
  paths: [
    path(
      [
        [5, 5],
        [19, 5],
        [19, 19],
        [5, 19],
      ],
      true,
    ),
    ln(8, 8, 16, 16),
    ln(16, 8, 8, 16),
  ],
  circles: [],
};

export function symbolFor(id: string | undefined): SymbolDefinition {
  return (id ? SYMBOL_MAP.get(id) : undefined) ?? UNKNOWN_SYMBOL;
}

export function hasSymbol(id: string | undefined): boolean {
  return Boolean(id && SYMBOL_MAP.has(id));
}

export function symbolName(id: string | undefined): string {
  return symbolFor(id).name;
}

export function symbolCategoryOf(id: string | undefined): SymbolCategory {
  return symbolFor(id).category;
}

export function symbolCategoryLabel(category: SymbolCategory | undefined): string {
  return category ? SYMBOL_CATEGORY_LABELS[category] : "Uncategorized";
}

export function symbolCategoryColor(category: SymbolCategory | undefined): string {
  return category ? SYMBOL_CATEGORY_COLORS[category] : "#9aa8ae";
}

export function inspectionStatusLabel(status: InspectionStatus | undefined): string {
  return status ? INSPECTION_STATUS_LABELS[status] : "Not assessed";
}

export function inspectionStatusColor(status: InspectionStatus | undefined): string {
  return status ? INSPECTION_STATUS_COLORS[status] : "#9aa8ae";
}

export function isInspectionStatus(value: unknown): value is InspectionStatus {
  return typeof value === "string" && INSPECTION_STATUSES.includes(value as InspectionStatus);
}

/** SVG markup for the symbol library and help screenshots. */
export function symbolSvgMarkup(
  symbol: SymbolDefinition,
  size = 24,
  color = "#e8eef1",
  strokeWidth = 1.5,
): string {
  const pathMarkup = symbol.paths
    .map((entry) => {
      const data = entry.points
        .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
        .join(" ");
      return `<path d="${data}${entry.closed ? " Z" : ""}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  const circleMarkup = symbol.circles
    .map(
      (entry) =>
        `<circle cx="${entry.center.x}" cy="${entry.center.y}" r="${entry.radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"/>`,
    )
    .join("");
  return `<svg class="symbol-glyph" width="${size}" height="${size}" viewBox="0 0 ${SYMBOL_VIEWBOX} ${SYMBOL_VIEWBOX}" aria-hidden="true">${pathMarkup}${circleMarkup}</svg>`;
}
