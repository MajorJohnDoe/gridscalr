# Project files


A `.gridscalr` file is UTF-8 JSON. It contains one or more document references, per-page calibrations and locations, settings, categories, saved Markups views, layers, markup items, and embedded images. Referenced PDFs are **not** embedded; a TIF's converted PDF is, because the scan cannot be read directly at render time.

Schema version 2 added optional per-item `visible` and `locked` flags. Schema version 3 added project categories, category/room fields on measurements, area add/subtract, count items, and quantity settings. Schema version 4 added quick-area shapes, manual 1:N scales, per-page scale locks, and the snap distance setting. Schema version 5 added embedded image assets and image items. Schema version 6 replaces the single `document` reference with a `documents` array and adds embedded PDFs for TIF documents.

Version 1–5 projects load normally and are migrated to schema 16: the old `document` entry becomes the first element of `documents`, and page keys keep their numbers. Version 6 projects keep each document's pages in order. Schema 7 adds optional removed-page lists (`excludedPages`) so individual pages can be deleted without rewriting the source files. Schema 8 adds project stamp presets, cloud scallop/box sizing, and the cloud, callout, stamp, revision-delta, and area-highlight markup kinds. Schema 9 adds optional manual measurement-label offsets, label connection points, and dashed length measurements. Schema 10 adds the optional `smartLengthUnits` setting; missing values default to on. Schema 11 adds page names, page-scoped layer visibility and lock overrides, layer home pages, and copied-page document references. Schema 12 adds optional page building/floor labels and project-stored Markups views with column, filter, grouping and sort settings. Schema 13 adds vector facility symbols with a stable `symbolId`, category-derived colour, rotation, and optional inspection status. Schema 14 adds the optional `symbolSize` on facility symbols; a missing value renders the 24 pt default. Schema 15 adds the optional measurement `labelSize` override and the project `labelSize` and `compactAreaLabels` settings; missing values use a 6 pt label and the full `Perimeter` wording. Schema 16 adds the optional area `labelFit` position, which keeps the label inside the area and fits its size to the available space. Text, callout, and cloud items also store optional `textBold`, `textUnderline`, and `textAlign` fields; missing values mean regular weight, no underline, and the kind's default alignment. Page state beyond the last included page is dropped. Measurements are assigned to the `Other` category when needed, areas default to `add` and `polygon`, and missing quantity and snap settings get safe defaults. Reference calibrations without `source` become `reference`; invalid manual scales and locks without a scale are dropped. Quick rectangle/ellipse data with extra points is trimmed to the two defining points, and unknown shapes fall back to polygon. A category may omit `wastePercent` and `roundingStep` to inherit the project defaults. Image items without a valid embedded asset or a valid two-corner geometry are dropped; old projects start with an empty `assets` map. Saved Markups views with missing categories or unknown columns are repaired on load. Unknown symbol ids are preserved and render as a safe fallback; invalid statuses are dropped.

```json
{
  "schemaVersion": 16,
  "name": "Level 01",
  "documents": [
    {
      "id": "doc_8f21c3",
      "kind": "pdf",
      "name": "Level 01.pdf",
      "path": "/home/ana/drawings/Level 01.pdf",
      "relativePath": "../drawings/Level 01.pdf",
      "sha256": "7ef5cc05...",
      "pageCount": 12,
      "sizeBytes": 4839201
    },
    {
      "id": "doc_tif_4b77de",
      "kind": "tiff",
      "name": "Site plan.tif",
      "path": "/home/ana/drawings/Site plan.tif",
      "relativePath": "../drawings/Site plan.tif",
      "sha256": "1c9ad40e...",
      "pageCount": 1,
      "sizeBytes": 708779,
      "embeddedPdf": "JVBERi0xLjQK...",
      "source": { "format": "tiff", "dpi": [400, 400], "originalName": "Site plan.tif" }
    }
  ],
  "settings": {
    "lengthUnit": "mm",
    "areaUnit": "m2",
    "smartLengthUnits": true,
    "showGrid": false,
    "showCalibration": true,
    "snapToGeometry": true,
    "snapTolerancePx": 8,
    "stampPresets": ["APPROVED", "NOT APPROVED", "FOR INFORMATION"],
    "quantity": {
      "defaultCategoryId": "cat_...",
      "wastePercent": 0,
      "roundingStep": 0
    }
  },
  "categories": [
    { "id": "cat_...", "name": "Floor", "wastePercent": 10, "roundingStep": 0.5 },
    { "id": "cat_...", "name": "Other" }
  ],
  "assets": {
    "img_...": {
      "id": "img_...",
      "name": "Site photo.jpg",
      "mime": "image/jpeg",
      "width": 1600,
      "height": 900,
      "byteSize": 184320,
      "data": "data:image/jpeg;base64,/9j/4AAQSk..."
    }
  },
  "pages": {
    "1": {
      "name": "Ground floor",
      "calibration": {
        "id": "cal_...",
        "source": "reference",
        "p1": { "x": 120, "y": 460 },
        "p2": { "x": 420, "y": 460 },
        "knownLength": 10,
        "unit": "m",
        "pointsPerMeter": 30,
        "createdAt": "2026-10-20T18:41:05.215Z"
      },
      "scaleLocked": true
    },
    "2": {
      "calibration": {
        "id": "cal_...",
        "source": "manual",
        "ratio": 100,
        "pointsPerMeter": 28.34645669,
        "createdAt": "2026-10-20T18:42:11.031Z"
      }
    }
  },
  "layers": [
    {
      "id": "layer_...",
      "name": "Measurements",
      "kind": "measure",
      "visible": true,
      "locked": false,
      "opacity": 1,
      "color": "#4cc9f0",
      "homePage": 1,
      "pageState": {
        "2": { "visible": false }
      },
      "items": []
    }
  ],
  "activeLayerId": "layer_..."
}
```

On desktop, GridScalr tries each referenced PDF's stored absolute path first, then a path relative to the project file. If a PDF is missing, it asks you to locate it. If the file exists but its SHA-256 differs from the stored checksum, GridScalr warns before continuing. TIF documents need no external file: their converted PDF is embedded, and the stored path and checksum only record where the original scan came from. The project file is designed to stay useful when a project folder is moved without the drawings it references.

Layer IDs, item IDs, document IDs, calibration data, quick-area shapes, scale locks, timestamps, style values, text styling, category IDs, per-item visibility/lock flags, snap settings, stamp presets, annotation text and layouts, and embedded image assets are preserved in the file. Reading validates the schema, normalizes older projects, repairs category references, drops page state beyond the last included page, and drops items that do not match their layer kind or reference a missing image.
