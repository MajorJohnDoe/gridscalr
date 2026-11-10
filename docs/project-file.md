# Project files


A `.gridscalr` file is UTF-8 JSON. It contains one or more document references,
per-page calibrations and locations, settings, categories, saved Markups views,
layers, markup items, and embedded images. Ordinary PDFs are **never** base64
embedded: each document is either a path reference or an explicit managed copy
inside the project folder. A TIF's converted PDF is embedded, because the scan
cannot be read directly at render time.

Schema 25 implements the source storage modes described in
[ADR 0012](adr/0012-source-storage-modes.md) on top of the explicit page list
from schema 24 ([ADR 0011](adr/0011-page-list-and-source-replacement.md)). This
document describes schema 25.

Drawing PDFs, optional-content layer groups and review annotations are export
artifacts. They are generated on demand, are not stored in the project and are
never read back. Interoperability export options therefore do not change the
schema.

Schema version 2 added optional per-item `visible` and `locked` flags. Schema version 3 added project categories, category/room fields on measurements, area add/subtract, count items, and quantity settings. Schema version 4 added quick-area shapes, manual 1:N scales, per-page scale locks, and the snap distance setting. Schema version 5 added embedded image assets and image items. Schema version 6 replaces the single `document` reference with a `documents` array and adds embedded PDFs for TIF documents.

Version 1–5 projects load normally and are migrated to schema 25: the old `document` entry becomes the first element of `documents`, numeric page references are converted to stable page IDs, and every document becomes an explicit reference. Version 6 projects keep each document's pages in order. Schema 7 adds optional removed-page lists (`excludedPages`) so individual pages can be deleted without rewriting the source files. Schema 8 adds project stamp presets, cloud scallop/box sizing, and the cloud, callout, stamp, revision-delta, and area-highlight markup kinds. Schema 9 adds optional manual measurement-label offsets, label connection points, and dashed length measurements. Schema 10 adds the optional `smartLengthUnits` setting; missing values default to on. Schema 11 adds page names, page-scoped layer visibility and lock overrides, layer home pages, and copied-page document references. Schema 12 adds optional page building/floor labels and project-stored Markups views with column, filter, grouping and sort settings. Schema 13 adds vector facility symbols with a stable `symbolId`, category-derived colour, rotation, and optional inspection status. Schema 14 adds the optional `symbolSize` on facility symbols; a missing value renders the 24 pt default. Schema 15 adds the optional measurement `labelSize` override and the project `labelSize` and `compactAreaLabels` settings; missing values use a 6 pt label and the full `Perimeter` wording. Schema 16 adds the optional area `labelFit` position, which keeps the label inside the area and fits its size to the available space. Schema 17 adds optional per-page OCR data (`ocr`) with words, bounding boxes, language and engine metadata, and the source document checksum/page used to invalidate stale OCR. Schema 18 adds the radius, diameter and three-point arc measurement kinds; they use the existing points and scale fields. Schema 19 adds angle, slope and volume measurement kinds; volumes store an optional `depth` in the project length unit and use the existing polygon points. Schema 20 adds ordered project count types (`countTypes`) with a stable id, label and one of the built-in glyphs, plus an optional `countQuantity` on count items. Schema 21 adds reusable Count tool presets (`countPresets`) and count-type columns, filters and grouping in saved Markups views. Schema 22 adds optional procurement metadata (`metadata`) for facility, client, project number, revision, author, report date, report title and notes, plus an optional report-logo reference (`reportLogoAssetId`) to an embedded project image asset. Missing metadata migrates to empty values and a missing or invalid logo reference is dropped. Schema 23 adds template sheet documents (`kind: "template"`) with a stable template id and version, a paper size (`A3` or `A2`) and a string map of title-block or table field values. `sheet.details` stores the optional multi-line system/equipment block; field values may contain explicit newlines. A template document has no source file, exactly one page and an empty checksum. Missing or invalid template metadata falls back to the built-in drawing frame; unknown field ids are preserved. Schema 23 also adds project line types (`lineTypes`) for schematic media classes, and the `polyline` and `rail` item kinds. Polylines store an optional `lineTypeId` and dashed style; rails store editable `rows`, row spacing and badge/legend toggles. Text boxes may carry an optional `runs` array of formatted ranges (`text`, `bold`, `italic`, `underline`, `size`, `color`); `text` remains the plain-text fallback, so older boxes open unchanged and the schema version does not change. Symbols may also carry an optional free-text `tag` and a `tagOffset`; neither is numbered automatically. Missing count types migrate to the five built-in definitions, missing quantities mean one piece, unknown item ids fall back to `other`, and built-in types cannot be deleted. Text, callout, and cloud items also store optional `textBold`, `textUnderline`, and `textAlign` fields; missing values mean regular weight, no underline, and the kind's default alignment. Schema 24 replaces numeric page identity with an ordered `pages` array of `PageRecord` objects. Each record has a stable `id`, a `documentId`, a 1-based source-local `localPage` and a `state` object that holds the calibration, scale lock, name, building, floor and OCR data that used to live in the numeric `pages` map. Items store `pageId` instead of `page`; layers store `homePageId` and key `pageState` by page ID. Page numbers are derived from array order and are never stored. A project may have zero pages and zero documents; empty is valid. `DocumentRef.superseded` marks a source whose remaining pages were not mapped during **Replace source…**. Migration from schema 23 builds the page list in document order from `documents` and `excludedPages`, assigns deterministic IDs, moves each numeric page state into the matching record, and reports invalid numeric references instead of silently remapping them. Old page state beyond the last included page is reported and not kept. Measurements are assigned to the `Other` category when needed, areas default to `add` and `polygon`, and missing quantity and snap settings get safe defaults. Reference calibrations without `source` become `reference`; invalid manual scales and locks without a scale are dropped. Quick rectangle/ellipse data with extra points is trimmed to the two defining points, and unknown shapes fall back to polygon. A category may omit `wastePercent` and `roundingStep` to inherit the project defaults. Image items without a valid embedded asset or a valid two-corner geometry are dropped; old projects start with an empty `assets` map. Saved Markups views with missing categories or unknown columns are repaired on load. Unknown symbol ids are preserved and render as a safe fallback; invalid statuses are dropped. Schema 25 adds an explicit source storage mode. Each document may carry `storage: "reference" | "managed"`, plus optional `originalPath` and `originalSha256` provenance for a managed copy. A managed copy is stored in the sibling folder `<project>.drawings/<safe-name>-<hash8>.pdf` and referenced through `relativePath`; `path` is the current session's resolved absolute path. Migration from schema 24 sets `storage: "reference"` on every document and does not copy, move or rewrite any source file. The TIF embedded-PDF exception is unchanged.

```json
{
  "schemaVersion": 25,
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
      "sizeBytes": 4839201,
      "storage": "reference"
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
      "source": { "format": "tiff", "dpi": [400, 400], "originalName": "Site plan.tif" },
      "storage": "reference"
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
  "countTypes": [
    { "id": "door", "label": "Door", "glyph": "door" },
    { "id": "window", "label": "Window", "glyph": "window" },
    { "id": "other", "label": "Other", "glyph": "other" }
  ],
  "countPresets": [
    {
      "id": "preset_...",
      "countType": "door",
      "categoryId": "cat_...",
      "room": "Floor 1",
      "quantity": 2
    }
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
  "metadata": {
    "facility": "Northgate Logistics Hub",
    "client": "Example Property AB",
    "projectNumber": "2026-014",
    "revision": "A",
    "preparedBy": "A. Technician",
    "reportDate": "2026-11-04",
    "reportTitle": "Procurement quantities",
    "notes": "Priced against revision A drawings."
  },
  "reportLogoAssetId": null,
  "pages": [
    {
      "id": "page_1",
      "documentId": "doc_8f21c3",
      "localPage": 1,
      "state": {
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
      }
    },
    {
      "id": "page_2",
      "documentId": "doc_8f21c3",
      "localPage": 2,
      "state": {
        "calibration": {
          "id": "cal_...",
          "source": "manual",
          "ratio": 100,
          "pointsPerMeter": 28.34645669,
          "createdAt": "2026-10-20T18:42:11.031Z"
        }
      }
    }
  ],
  "layers": [
    {
      "id": "layer_...",
      "name": "Measurements",
      "kind": "measure",
      "visible": true,
      "locked": false,
      "opacity": 1,
      "color": "#4cc9f0",
      "homePageId": "page_1",
      "pageState": {
        "page_2": { "visible": false }
      },
      "items": [
        {
          "id": "item_...",
          "pageId": "page_1",
          "kind": "length",
          "points": [{ "x": 120, "y": 460 }, { "x": 420, "y": 460 }],
          "color": "#f70808",
          "strokeWidth": 2,
          "createdAt": "2026-10-20T18:41:05.215Z",
          "updatedAt": "2026-10-20T18:41:05.215Z"
        }
      ]
    }
  ],
  "activeLayerId": "layer_..."
}
```

Saving a project is atomic. GridScalr flushes a temporary file in the project's folder and replaces the project with one rename. A failed write or a failed replacement leaves the previous file unchanged; an interrupted save leaves either the old or the new project at the expected path. **File → Save a copy…** writes the same payload to another folder and recomputes the document relative paths for that location without changing the open project.

A desktop save is also conditional. The editor keeps a runtime `ProjectFileStamp` with the SHA-256, byte size and modification time of the file it loaded. The Rust command re-reads and hashes the target immediately before the rename; a mismatch returns a structured `projectConflict` error instead of overwriting the newer file. After writing, GridScalr reads the file back and verifies the hash and size before it marks the project saved. The stamp is runtime state only: it is not serialized into the project JSON, adds no field and does not change the schema. It is captured again whenever the project is opened and after each verified save. The browser fallback still uses a download and never claims a conditional write.

Two companion stores sit outside the project JSON and are never part of a package:

- `<project>.gridscalr.lock` is an advisory sidecar lease with app instance, project ID, open time, heartbeat, project hash, coarse host label and app version. It is not project data. Deleting it never changes the project; a stale or corrupt lock is ignored and can be cleared explicitly.
- Recovery snapshots and structural checkpoints live in the local browser/desktop recovery store (IndexedDB, with a small localStorage fallback), scoped by project ID and app instance. They store a serialized project plus the base file SHA-256, but they are never written into the `.gridscalr` file, a package or a report.

Neither store changes `schemaVersion`; the current schema remains 25.

Before a save or export, both the frontend guard and the Rust layer compare the destination with every source document path. The Rust side resolves real paths, including symlinks and junctions, and compares file identities when the destination exists, so a source drawing cannot be reached through an alternate spelling or link.

On desktop, GridScalr tries each referenced PDF's stored absolute path first, then a path relative to the project file. If a PDF is missing, it asks you to locate it. If the file exists but its SHA-256 differs from the stored checksum, GridScalr warns before continuing. TIF documents need no external file: their converted PDF is embedded, and the stored path and checksum only record where the original scan came from. The project file is designed to stay useful when a project folder is moved without the drawings it references.

Layer IDs, item IDs, document IDs, calibration data, quick-area shapes, scale locks, timestamps, style values, text styling, category IDs, per-item visibility/lock flags, snap settings, stamp presets, annotation text and layouts, and embedded image assets are preserved in the file. Reading validates the schema, normalizes older projects, repairs category references, drops page state beyond the last included page, and drops items that do not match their layer kind or reference a missing image.

## Integrity validation and provenance

`parseProjectWithReport(text)` returns a `ProjectLoadReport` alongside the
project. It contains the existing migration warnings plus `dropped` and
`repaired` counts (stable codes such as `droppedItem`, `repairedCategoryId` and
`droppedPageProvenance`) and the `issues` that remain after normalization. The
producer never reports a property as preserved when normalization removed it.

Before a normal save, `validateProject(project)` checks every persistent ID and
reference: documents, pages, layers, items, assets, categories, count types,
line types, page state, page ranges, count presets, Markups views, the active
layer, the report logo, `excludedPages`, `copiedFrom`, OCR source revision,
asset MIME/data agreement, and image and text-box geometry. Errors block the
save; warnings are shown for acceptance. After serialisation, GridScalr parses
the text back and compares entity counts before writing. The same conditional,
verified write is used after the round trip. Autosave recovery is not blocked by
validation, but an invalid project is not written over a project file by a
normal save. This applies to the browser download fallback too.

From schema 25, a page record may carry optional provenance. It is additive and
older files simply omit it; no schema bump is required.

```json
{
  "id": "page_1",
  "documentId": "doc_8f21c3",
  "localPage": 1,
  "state": {},
  "provenance": {
    "sourceProjectId": "project_...",
    "sourceRevisionSha256": "d5c2…",
    "sourceRevisionSize": 1048576,
    "sourceRevisionModifiedAt": "2026-11-10T09:30:00.000Z",
    "sourcePageId": "page_...",
    "importedAt": "2026-11-10T09:35:12.000Z",
    "appVersion": "0.22.4"
  }
}
```

`sourceRevisionModifiedAt` is `null` when the platform did not provide a
modification time. A partial or malformed provenance object is dropped as a
whole and counted in the load report; the page itself is kept. Provenance is
descriptive context for a page imported from another project, not a signature or
a revision ancestry model.

## Source storage modes

`DocumentRef.storage` is explicit:

| Mode | Stored reference | Use |
| --- | --- | --- |
| `reference` | The original path plus SHA-256 | A stable local drawing |
| `managed` | A copy in `<project>.drawings/`, relative path plus SHA-256 | A shared, network or cloud-synced source |

A managed copy keeps `originalPath` and `originalSha256` as provenance. **Detach
from source** keeps the copy and clears that provenance. The copy is never
hidden inside the project JSON: it is a real PDF in the drawings folder, and the
copy's checksum remains authoritative. A managed copy requires a saved project
path, because the folder is derived from the project file. GridScalr prompts to
save first instead of falling back to an embedded PDF.

The import dialog recommends **Copy drawing into project** when the picked path
looks like a UNC network share or a well-known cloud-client folder. The
heuristic is documented in `docs/limitations.md`; it is advisory and the user can
always keep a reference.

When a reference PDF changes on disk, GridScalr keeps the working drawing and
shows a non-blocking banner with **Reload**, **Use current**, **Relink** and
**Copy into project**. None of them is automatic. A changed page count routes to
**Replace source…** instead of guessing. Relinking verifies the page count and
warns on a checksum mismatch. The checksum search helper looks only in the
project folder and its drawings folder, never the whole file system.

## Portable project packages

A project can be packaged as a standard ZIP named `<project>.gridscalr.zip`. The
package is a transport container; it does not change the project schema. The
format is defined by [ADR 0002](adr/0002-project-package.md).

```text
README.txt
manifest.json
<project>.gridscalr
documents/<safe-name>.pdf
exports/...            optional
source-scans/...       optional original TIF scans
```

The packaged project file clears absolute document paths, links each PDF through
`documents/`, and sets TIF document paths to null. A managed drawing is included
exactly once even when several document records share the copy; its
`originalPath` is cleared so a sender's absolute path never travels, while
`originalSha256` stays as provenance. A reference document keeps its normal
package entry; packaging does not silently promote it to a managed copy. A TIF
document keeps its embedded derived PDF; original TIF scans are optional and off
by default. Quantity CSV/XLSX/PDF reports and a flattened drawing PDF are also
opt-in.

`manifest.json` version 1 is independent of the project schema and contains:

```json
{
  "format": "gridscalr-package",
  "formatVersion": 1,
  "createdAt": "2026-11-01T10:00:00.000Z",
  "appVersion": "0.16.1",
  "projectFile": "Level 01.gridscalr",
  "projectSha256": "…",
  "projectSchema": 21,
  "documents": [
    { "file": "documents/Level 01.pdf", "sha256": "…", "sizeBytes": 4839201, "kind": "pdf" }
  ],
  "exports": [],
  "sourceScans": []
}
```

Each `documents`, `exports` and `sourceScans` entry records a relative archive
path, SHA-256 and uncompressed size. `kind` is `pdf` or `tiff` for documents,
`tiff` for source scans, and a descriptive value for optional exports.

Packages are created and extracted with streaming in Rust. PDFs are stored
uncompressed while JSON, README and CSV entries use deflate. A package is written
to a temporary file and moved into place atomically; a failed create or cancel
leaves no package or temporary file.

Extraction validates the manifest before writing anything, then rejects absolute
names, `..`, symlinks, encrypted archives, duplicate names, unknown files, more
than 4096 entries, a single file over 4 GiB, a total over 16 GiB and suspicious
compression ratios. Every file is checksum-verified before the project opens.
Extraction happens in a temporary sibling folder that is moved into place
atomically; an existing extraction can be reused or replaced, and cancel removes
the temporary folder. Manual unzip followed by opening the extracted `.gridscalr`
also works.

Packages are not encrypted and are not cryptographically signed. Checksums detect
corruption and accidental changes, not deliberate tampering.
