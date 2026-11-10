/**
 * Generates one deliberate project fixture for every supported schema version.
 *
 * The fixtures are checked in as test data. Each one uses the structure that
 * version documented instead of relabelling current data: schemas 1-5 use the
 * single `document` field, 6+ use `documents`, 23 and earlier use a numeric
 * page map and 24+ use the ordered page list. Fields introduced by a version
 * are added only from that version onward.
 *
 * The existing `schema-23.gridscalr` and `schema-24.gridscalr` fixtures stay in
 * place for the older focused tests; `schema-23-full` and `schema-24-full` add
 * the template, line-type and provenance fields those versions introduced.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "fixtures", "legacy");
const NOW = "2026-01-01T00:00:00.000Z";
const MAIN_SHA = "a".repeat(64);
const SCAN_SHA = "b".repeat(64);
const PNG_DATA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function pageRef(version, index) {
  return version >= 24 ? `page_${version}_${index}` : index;
}

function mainDocument(version, pageCount, excludedPages) {
  const document = {
    id: "doc_main",
    kind: "pdf",
    name: "Legacy plan.pdf",
    path: `/legacy/schema-${version}/Legacy plan.pdf`,
    relativePath: "Legacy plan.pdf",
    sha256: MAIN_SHA,
    pageCount,
    sizeBytes: 2048,
  };
  if (excludedPages) document.excludedPages = excludedPages;
  if (version >= 25) {
    document.storage = "managed";
    document.path = `/legacy/schema-${version}/schema-${version}.drawings/Legacy plan-aaaaaaaa.pdf`;
    document.relativePath = `schema-${version}.drawings/Legacy plan-aaaaaaaa.pdf`;
    document.originalPath = `/legacy/schema-${version}/Legacy plan.pdf`;
    document.originalSha256 = MAIN_SHA;
  }
  return document;
}

function scanDocument(version) {
  const document = {
    id: "doc_scan",
    kind: "tiff",
    name: "Legacy scan.tif",
    path: `/legacy/schema-${version}/Legacy scan.tif`,
    relativePath: "Legacy scan.tif",
    sha256: SCAN_SHA,
    pageCount: 1,
    sizeBytes: 4096,
    embeddedPdf: "JVBERi0xLjQK",
    source: { format: "tiff", dpi: [400, 400], originalName: "Legacy scan.tif" },
  };
  if (version >= 11) document.copiedFrom = { documentId: "doc_main", page: 1 };
  return document;
}

function templateDocument() {
  return {
    id: "doc_sheet",
    kind: "template",
    name: "Operation card",
    path: null,
    relativePath: null,
    sha256: "",
    pageCount: 1,
    sizeBytes: 0,
    template: {
      id: "gridscalr.operation-card.frame",
      version: 1,
      paper: "A3",
      fields: {
        "title.card": "56-01-01",
        "sheet.details": "Line 1\nLine 2",
      },
    },
  };
}

function item(version, id, kind, points, extra = {}) {
  const value = {
    id,
    [version >= 24 ? "pageId" : "page"]: pageRef(version, 1),
    kind,
    points,
    color: "#e30613",
    strokeWidth: 2,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
  return value;
}

function measurementItems(version) {
  const items = [];
  const lengthExtra = {};
  if (version >= 3) {
    lengthExtra.categoryId = "cat_floor";
    lengthExtra.room = "Room A";
  }
  if (version >= 9) {
    lengthExtra.labelOffset = { x: 5, y: -5 };
    lengthExtra.labelAnchor = { x: 10, y: 0 };
    lengthExtra.lineStyle = "dashed";
  }
  if (version >= 15) lengthExtra.labelSize = 8;
  items.push(
    item(
      version,
      "item_measure",
      "length",
      [
        { x: 100, y: 100 },
        { x: 220, y: 100 },
      ],
      lengthExtra,
    ),
  );

  if (version >= 3) {
    items.push(
      item(version, "item_count", "count", [{ x: 300, y: 200 }], {
        categoryId: "cat_other",
        countType: version >= 20 ? "valve" : "other",
        ...(version >= 20 ? { countQuantity: 3 } : {}),
      }),
      item(
        version,
        "item_area",
        "area",
        [
          { x: 100, y: 300 },
          { x: 240, y: 380 },
        ],
        {
          categoryId: "cat_floor",
          areaMode: "subtract",
          ...(version >= 4 ? { areaShape: "rectangle" } : { areaShape: "polygon" }),
          ...(version >= 16 ? { labelFit: "center" } : {}),
        },
      ),
    );
  }

  if (version >= 18) {
    items.push(
      item(
        version,
        "item_radius",
        "radius",
        [
          { x: 400, y: 100 },
          { x: 460, y: 100 },
        ],
        { categoryId: "cat_other" },
      ),
      item(
        version,
        "item_diameter",
        "diameter",
        [
          { x: 400, y: 160 },
          { x: 460, y: 160 },
        ],
        { categoryId: "cat_other" },
      ),
      item(
        version,
        "item_arc",
        "arc",
        [
          { x: 400, y: 220 },
          { x: 460, y: 220 },
          { x: 430, y: 260 },
        ],
        { categoryId: "cat_other" },
      ),
    );
  }

  if (version >= 19) {
    items.push(
      item(
        version,
        "item_angle",
        "angle",
        [
          { x: 500, y: 100 },
          { x: 550, y: 100 },
          { x: 500, y: 150 },
        ],
        { categoryId: "cat_other" },
      ),
      item(
        version,
        "item_slope",
        "slope",
        [
          { x: 500, y: 200 },
          { x: 560, y: 230 },
        ],
        { categoryId: "cat_other" },
      ),
      item(
        version,
        "item_volume",
        "volume",
        [
          { x: 500, y: 300 },
          { x: 580, y: 300 },
          { x: 560, y: 360 },
        ],
        { categoryId: "cat_other", depth: 2.5 },
      ),
    );
  }

  return items;
}

function drawingItems(version) {
  const items = [
    item(version, "item_text", "text", [{ x: 160, y: 420 }], {
      color: "#f2a93b",
      text: "Legacy note",
      ...(version >= 2 ? { visible: false, locked: true } : {}),
    }),
  ];
  if (version >= 5) {
    items.push(
      item(
        version,
        "item_image",
        "image",
        [
          { x: 80, y: 440 },
          { x: 160, y: 500 },
        ],
        {
          color: "#7aa2f7",
          image: { assetId: "asset_logo", mode: "annotation" },
        },
      ),
    );
  }
  if (version >= 8) {
    items.push(
      item(
        version,
        "item_callout",
        "callout",
        [
          { x: 320, y: 360 },
          { x: 360, y: 330 },
        ],
        { text: "Check valve", fontSize: 12 },
      ),
      item(version, "item_stamp", "stamp", [{ x: 340, y: 420 }], { text: "APPROVED" }),
      item(
        version,
        "item_cloud",
        "cloud",
        [
          { x: 300, y: 450 },
          { x: 360, y: 450 },
          { x: 330, y: 490 },
        ],
        { text: "Rev A", cloudRadius: 8 },
      ),
      item(version, "item_delta", "delta", [{ x: 380, y: 450 }], { text: "A" }),
    );
  }
  if (version >= 13) {
    items.push(
      item(version, "item_symbol", "symbol", [{ x: 240, y: 250 }], {
        color: "#e30613",
        symbolId: "fire.extinguisher",
        status: "approved",
        ...(version >= 14 ? { symbolSize: 32 } : {}),
        ...(version >= 23 ? { tag: "FE-01", tagOffset: { x: 10, y: -12 } } : {}),
      }),
    );
  }
  if (version >= 23) {
    items.push(
      item(
        version,
        "item_polyline",
        "polyline",
        [
          { x: 100, y: 520 },
          { x: 180, y: 520 },
          { x: 180, y: 560 },
        ],
        { color: "#3b82f6", lineTypeId: "line_supply" },
      ),
      item(
        version,
        "item_rail",
        "rail",
        [
          { x: 100, y: 600 },
          { x: 260, y: 600 },
        ],
        {
          color: "#3b82f6",
          rows: [
            { id: "row_1", label: "K1", legend: "Supply" },
            { id: "row_2", label: "K2", legend: "Exhaust" },
          ],
          rowSpacing: 14,
        },
      ),
      item(
        version,
        "item_textbox",
        "textbox",
        [
          { x: 280, y: 520 },
          { x: 420, y: 570 },
        ],
        {
          text: "Bold note",
          runs: [
            { text: "Bold", bold: true },
            { text: " note" },
          ],
          textBackground: "white",
          padding: 6,
        },
      ),
    );
  }
  return items;
}

function pageState(version, index) {
  if (index === 1) {
    return {
      ...(version >= 11 ? { name: "Ground floor" } : {}),
      ...(version >= 12 ? { building: "House A", floor: "Floor 1" } : {}),
      calibration: {
        id: "cal_fixture",
        p1: { x: 0, y: 0 },
        p2: { x: 100, y: 0 },
        knownLength: 10,
        unit: "m",
        pointsPerMeter: 10,
        createdAt: NOW,
      },
      ...(version >= 17
        ? {
            ocr: {
              text: "Legacy OCR text",
              words: [
                {
                  text: "Legacy",
                  x: 10,
                  y: 10,
                  width: 40,
                  height: 12,
                  confidence: 90,
                },
              ],
              engine: "tesseract",
              languages: "eng",
              generatedAt: NOW,
              documentSha256: MAIN_SHA,
              sourcePage: 1,
              width: 600,
              height: 800,
            },
          }
        : {}),
    };
  }
  if (index === 2) {
    const state = {
      ...(version >= 11 ? { name: "Upper floor" } : {}),
      ...(version >= 12 ? { building: "House A", floor: "Floor 2" } : {}),
    };
    if (version >= 4) {
      state.calibration = {
        id: "cal_manual",
        source: "manual",
        ratio: 100,
        pointsPerMeter: 28.34645669,
        createdAt: NOW,
      };
      state.scaleLocked = true;
    }
    return state;
  }
  if (index === 4) return { name: "Operation card" };
  return {};
}

function documentsFor(version, rich) {
  const mainPageCount = version >= 7 ? 3 : 2;
  const excludedPages = version >= 7 ? [3] : undefined;
  const documents = [mainDocument(version, mainPageCount, excludedPages)];
  if (version >= 6) documents.push(scanDocument(version));
  if (rich) documents.push(templateDocument());
  return documents;
}

function includedPages(documents) {
  const pages = [];
  for (const document of documents) {
    const excluded = new Set(document.excludedPages ?? []);
    for (let localPage = 1; localPage <= document.pageCount; localPage += 1) {
      if (excluded.has(localPage)) continue;
      pages.push({ documentId: document.id, localPage });
    }
  }
  return pages;
}

function layersFor(version) {
  const draw = {
    id: "layer_draw",
    name: "Markups",
    kind: "draw",
    visible: true,
    locked: false,
    opacity: 1,
    color: "#f2a93b",
    items: drawingItems(version),
  };
  const measure = {
    id: "layer_measure",
    name: "Measurements",
    kind: "measure",
    visible: true,
    locked: false,
    opacity: 1,
    color: "#e30613",
    items: measurementItems(version),
  };
  if (version >= 11) {
    for (const layer of [draw, measure]) {
      layer[version >= 24 ? "homePageId" : "homePage"] = pageRef(version, 1);
    }
    draw.pageState = {
      [pageRef(version, 2)]: { visible: false },
    };
  }
  return [draw, measure];
}

function settingsFor(version) {
  const settings = {
    lengthUnit: "m",
    areaUnit: "m2",
    showGrid: false,
    showCalibration: true,
    snapToGeometry: true,
  };
  if (version >= 3) {
    settings.quantity = {
      defaultCategoryId: "cat_other",
      wastePercent: 5,
      roundingStep: 0.5,
    };
  }
  if (version >= 4) settings.snapTolerancePx = 10;
  if (version >= 8) settings.stampPresets = ["APPROVED", "FOR INFORMATION"];
  if (version >= 10) settings.smartLengthUnits = true;
  if (version >= 15) {
    settings.labelSize = 7;
    settings.compactAreaLabels = true;
  }
  return settings;
}

function categoriesFor(version) {
  if (version < 3) return undefined;
  return [
    { id: "cat_floor", name: "Floor", wastePercent: 10, roundingStep: 0.5 },
    { id: "cat_other", name: "Other" },
  ];
}

function countTypesFor(version) {
  if (version < 20) return undefined;
  return [
    { id: "door", label: "Door", glyph: "door" },
    { id: "window", label: "Window", glyph: "window" },
    { id: "valve", label: "Valve", glyph: "fixture" },
    { id: "other", label: "Other", glyph: "other" },
  ];
}

function countPresetsFor(version) {
  if (version < 21) return undefined;
  return [
    {
      id: "preset_valve",
      countType: "valve",
      categoryId: "cat_other",
      room: "Room A",
      quantity: 2,
    },
  ];
}

function lineTypesFor(version) {
  if (version < 23) return undefined;
  return [
    { id: "line_supply", name: "Supply air", color: "#3b82f6", widthPt: 2.5, style: "solid" },
    { id: "line_exhaust", name: "Exhaust air", color: "#f97316", widthPt: 2, style: "dashed" },
  ];
}

function assetsFor(version) {
  if (version < 5) return undefined;
  return {
    asset_logo: {
      id: "asset_logo",
      name: "Legacy logo.png",
      mime: "image/png",
      width: 1,
      height: 1,
      byteSize: 68,
      data: PNG_DATA,
    },
  };
}

function markupsViewsFor(version) {
  if (version < 12) return undefined;
  return [
    {
      id: "view_legacy",
      name: "Legacy view",
      columns: ["name", "page", "category", "countType"],
      pageFilter: "all",
      typeFilter: "all",
      categoryId: "cat_floor",
      symbolCategory: null,
      countType: version >= 21 ? "valve" : null,
      search: "legacy",
      groupBy: version >= 21 ? ["countType", "room"] : [],
      sort: { column: "name", direction: "asc" },
    },
  ];
}

function metadataFor(version) {
  if (version < 22) return undefined;
  return {
    facility: "Legacy facility",
    client: "Legacy client",
    projectNumber: "2026-159",
    revision: "A",
    preparedBy: "Fixture generator",
    reportDate: "2026-01-01",
    notes: "Migration corpus fixture.",
    reportTitle: "Legacy quantities",
  };
}

function buildFixture(version, { rich = false } = {}) {
  const documents = documentsFor(version, rich);
  const pages = includedPages(documents);
  const project = {
    schemaVersion: version,
    id: `prj_schema_${version}`,
    name: `Schema ${version} fixture`,
    ...(version >= 6 ? { documents } : { document: documents[0] }),
    settings: settingsFor(version),
  };
  const categories = categoriesFor(version);
  if (categories) project.categories = categories;
  const countTypes = countTypesFor(version);
  if (countTypes) project.countTypes = countTypes;
  const countPresets = countPresetsFor(version);
  if (countPresets) project.countPresets = countPresets;
  const lineTypes = lineTypesFor(version);
  if (lineTypes) project.lineTypes = lineTypes;
  const assets = assetsFor(version);
  if (assets) project.assets = assets;
  if (version >= 24) {
    project.pages = pages.map((entry, index) => {
      const record = {
        id: pageRef(version, index + 1),
        documentId: entry.documentId,
        localPage: entry.localPage,
        state: pageState(version, index + 1),
      };
      if (version >= 25 && index === 0) {
        record.provenance = {
          sourceProjectId: "prj_source",
          sourceRevisionSha256: "c".repeat(64),
          sourceRevisionSize: 4096,
          sourceRevisionModifiedAt: NOW,
          sourcePageId: "page_source_1",
          importedAt: NOW,
          appVersion: "0.22.4",
        };
      }
      return record;
    });
  } else {
    project.pages = Object.fromEntries(
      pages.map((_entry, index) => [String(index + 1), pageState(version, index + 1)]),
    );
  }
  const markupsViews = markupsViewsFor(version);
  if (markupsViews) project.markupsViews = markupsViews;
  const metadata = metadataFor(version);
  if (metadata) project.metadata = metadata;
  if (version >= 22) project.reportLogoAssetId = "asset_logo";
  project.layers = layersFor(version);
  project.activeLayerId = "layer_measure";
  project.createdAt = NOW;
  project.updatedAt = NOW;
  return project;
}

function write(name, value) {
  writeFileSync(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`);
}

for (let version = 1; version <= 22; version += 1) {
  write(`schema-${version}.gridscalr`, buildFixture(version));
}
write("schema-23-full.gridscalr", buildFixture(23, { rich: true }));
write("schema-24-full.gridscalr", buildFixture(24, { rich: true }));
write("schema-25.gridscalr", buildFixture(25, { rich: true }));

console.log("Wrote schema 1-22, schema-23-full, schema-24-full and schema-25 fixtures.");
