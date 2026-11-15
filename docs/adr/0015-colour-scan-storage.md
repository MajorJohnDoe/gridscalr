# ADR 0015: Colour-scan TIF storage and size budget

- Status: Accepted — implemented. Schema 27 format in 0.28.0 phase 3, cache
  lifecycle, packaging and the enforced budget in phase 4
- Date: 2026-11-13 (decision), 2026-11-15 (lifecycle implemented)
- Deciders: GridScalr maintainer
- Supersedes: none
- Related: [0012](0012-source-storage-modes.md), [0010](0010-project-file-integrity.md), [0005](0005-large-project-performance.md)

## Context

A TIF is not a drawing format GridScalr can render directly. Import converts the
scan into a derived PDF; before schema 27 that PDF was stored as base64 in
`DocumentRef.embeddedPdf`, so the project worked without the original file
(`src/io/tiffImport.ts`, schema 6 onward). ADR 0012 keeps that as the one allowed
embedded-document exception because the PDF is a GridScalr-derived artifact, not
a user PDF.

The exception is cheap for the common case. A bilevel CCITT G3/G4 sheet keeps its
compressed strips byte-for-byte, so a 25 MP drawing sheet adds well under 1 MiB
of base64 — the same order as the source file. It is expensive for every other
scan:

- a decoded page is expanded to one byte per component, then Flate-compressed as
  one image per strip;
- base64 inflates the stored bytes by 4/3;
- before schema 27 every save rewrote the whole string, every undo snapshot kept
  a copy of the serialized project, and the recovery store kept a snapshot plus
  checkpoints;
- the project has a hard 256 MB limit and a 48-million-character undo-history
  budget that shrinks history as a snapshot grows.

`MAX_DECODED_RASTER_BYTES` (256 MiB per page) bounds import memory, not the saved
project. The worst allowed colour page can therefore produce more base64 than the
project limit allows, and a realistic colour set can make a project slow to save
long before it is refused.

### Measured size

Measured with Node 24 `zlib.deflateSync` (level 6) on RGB buffers, then base64
(`ceil(bytes / 3) * 4`). The app writes one stream per strip instead of one per
page, so the real figure is a few percent larger.

| Content | Pixels | Decoded | Flate | Base64 in project JSON |
| --- | --- | --- | --- | --- |
| A2 line-art at 250 DPI: white paper, grid and border lines, ±2 grey scan grain | 25 MP | 71.5 MiB | 5.4 MiB | **7.2 MiB** |
| A1 line-art at 300 DPI, same content | 69.7 MP | 199.4 MiB | 15.1 MiB | **20.1 MiB** |
| A2 smooth gradient (photo background) | 25 MP | 71.5 MiB | 2.9 MiB | 3.9 MiB |
| A2 incompressible noise | 25 MP | 71.5 MiB | ~71.5 MiB | ~95 MiB |
| The A2 line-art sheet as 1-bit | 25 MP | 3.0 MiB | ~0.01 MiB | ~0.01 MiB |
| Worst allowed RGB page (256 MiB decoded) | ~89 MP | 256 MiB | up to 256 MiB | up to ~341 MiB |

Two things follow from the table. First, the 400-megapixel pixel cap is not the
real limit for colour: the 256 MiB decoded-raster guard bites first, at about
89 MP for three bytes per pixel, so a full A1 colour sheet at 300 DPI (69.7 MP,
199 MiB) is just inside it. Second, that worst row can exceed the 256 MB project
limit on its own, which is why this is a decision rather than a note.

### Measured before/after

`tests/derivedPdfBudget.test.ts` builds a reference project of six A2-class
colour sheets (4960 × 3508 px, 300 DPI, deterministic line art with scan grain),
converts each through the real `tiffToPdf`, and serializes the project both ways.
Run it with `GRIDSCALR_DERIVED_BENCH=1 npx vitest run tests/derivedPdfBudget.test.ts`:

| Project form | Project JSON | Derived PDFs on disk |
| --- | --- | --- |
| Embedded (`embeddedPdf`, 0.27.0) | **79.19 MiB** | — |
| Schema 27 cache (`derivedPdf` marker) | **0.01 MiB** | 59.39 MiB in `<project>.derived/` |

The derived bytes are carried exactly once instead of once per save, autosave,
undo snapshot and recovery record. The saving per write is the whole 79 MiB of
base64; the JSON still grows with pages, items, images and OCR, which is what the
remaining budget is for.

## Decision

**A TIF's derived PDF is a rebuildable cache beside the project, never base64 in
the project JSON.**

1. A colour or greyscale TIF page keeps today's conversion: one derived PDF, one
   image XObject per strip. The PDF is no longer stored in `embeddedPdf` once a
   cache exists.
2. CCITT G3/G4 passthrough is unchanged and stays byte-for-byte: the compressed
   strips are copied into `/CCITTFaxDecode` streams with no decode and no
   re-encode. A document whose every page is a passthrough (CCITT G3/G4 or
   JPEG-in-TIFF) is about the size of the scan, so it stays embedded and never
   acquires a cache entry.
3. The cache lives in `<project folder>/<project stem>.derived/`, beside the
   project the way a managed copy lives in `<project stem>.drawings/`. The file
   name is the key: `<sourceSha256 first 16>-v<converterVersion>-p<pageCount>.pdf`.
   Two documents that share one scan share one cache file.
4. The project stores a `derivedPdf` marker instead of the bytes: source TIF
   SHA-256, converter version, page count and the cache path relative to the
   project folder. A TIF document carries the marker or `embeddedPdf`, never
   both.
5. **The key decides reuse, and a mismatch is always a rebuild.** A cache is
   reused only when the source hash, the converter version and the page count
   all match the document. The one exception is a converter-version change with
   an unchanged source hash and page count: the drawing revision is identical, so
   a present cache still opens when the scan is gone, and a reachable scan still
   rebuilds it first.
6. The lifecycle is: build on import into a saved project and on save for an
   embedded document whose scan is reachable, reuse on open, rebuild silently
   from the scan when the cache is missing or stale, and show one actionable
   **Locate the scan…** path when neither is available. A located scan must match
   the document checksum. The project is not opened on a blank page.
7. A cache is only written from bytes the current converter produced. Bytes
   inherited from an older release stay embedded rather than being stamped with
   a converter version that did not produce them (the phase 3 decision).
8. **Packaging carries one form per scan, never both.** A cache-backed scan ships
   its derived cache under `derived/` and its original scan is not included; an
   embedded document may still include its original scan under `source-scans/`.
   The manifest lists the cache under `derivedCaches` with `kind: "derived"`, so
   the form is stated, not implied.
9. The accepted operating budget becomes an **enforced warning**:

   - **160 MiB of derived cache per project** — twenty 25 MP sheets, or eight A1
     sheets at 300 DPI;
   - the combined project JSON plus derived cache is checked against the
     existing **256 MB project limit**, which stays the only hard stop.

   At or above the cache budget the app warns once per changed state with the
   measured sizes and the practical advice (one project per building or floor).
   It never refuses a save that fits the project limit and never deletes a page
   to fit the budget.
10. The cache is an artifact, not a source of truth. Deleting the `.derived`
    folder costs a rebuild from the scan, never data. GridScalr does not delete a
    cache automatically, and no code path writes, moves or deletes a source TIF
    or an ordinary PDF.

### Why the target design is a cache, not a re-encode

| Option | Verdict |
| --- | --- |
| Keep the TIF as the source and rebuild the derived PDF into a local cache keyed by TIF SHA-256 and converter version | **Shipped.** Removes the bytes from the project JSON, so save, autosave, undo and recovery stop paying for them. |
| Downsample the decoded raster (for example cap at 200 DPI or 12 MP) | **Rejected as a default.** Line work, small text and hatch patterns are exactly what a takeoff measures and an OCR pass reads; a silent resolution cap trades correctness for size, and the loss is invisible in a thumbnail. |
| Re-encode the derived image as JPEG (`/DCTDecode`) | **Rejected.** It needs a JPEG encoder that the app does not ship (a new codec family in the other direction), it is lossy on line art and OCR, and the bytes would still live in the JSON and be rewritten on every save. It buys a factor, not a fix. |
| Extend managed storage to a `.tif` copy | **Not available.** Managed copies are PDF-only (`copy_to_project`, the drawings inventory and packaging, F-108). Copying a TIF would create a file the cleanup cannot see. A managed TIF protects portability, not project size. |

### Failure modes and their answers

| Situation | Behaviour |
| --- | --- |
| Cache missing, scan reachable and checksum matches | Rebuild silently and continue. No dialog. |
| Cache missing, scan moved | Rebuild from the stored path or the project-relative path; otherwise ask once. |
| Cache missing, scan gone | One dialog naming the document and the expected path, with **Locate the scan…** and Cancel. The project is not opened with a blank page. |
| Located scan is a different revision | Refused with a message: re-rendering another revision would change what the project measures. |
| Cache stale by converter version, scan gone | The present cache opens, because the source hash and page count still match the same drawing revision. |
| Cache write fails during save | The embedded bytes stay in the project. The save stays lossless; the doctor reports the marker on the next open. |
| `.derived` folder deleted | Every cache-backed page rebuilds from its scan on the next open. |

## Consequences

- A colour project's project JSON no longer grows with its decoded raster, so the
  project file, every save, every autosave snapshot, the undo history and the
  recovery store stop carrying it. The 0.27.0 "8 MiB per 25 MP page" budget no
  longer describes the project file; it describes the cache on disk.
- The disk still holds the derived bytes. `<project>.derived/` must travel with
  the project folder, like `<project>.drawings/`; a package includes it.
- A cache that is stale for any reason other than the converter version is
  rebuilt, never trusted, so a wrong revision can never be rendered.
- The app gains a real failure mode to explain (cache missing, scan moved). It is
  a dialog with one action, not a thrown error, and it costs a rebuild.
- A TIF replacement still stores a reference; the cache is derived from the new
  scan and never becomes a managed source (F-108 unchanged).

## Enforcement

- `tests/derivedPdf.test.ts` pins the marker shape, the key rule, the schema
  26 → 27 migration and the doctor codes.
- `tests/derivedPdfCache.test.ts` pins the lifecycle: reuse, silent rebuild,
  missing-cache-and-scan, checksum mismatch, the converter-only fallback and the
  save-time materialization that keeps embedded bytes when the scan is gone.
- `tests/derivedPdfBudget.test.ts` measures the before/after JSON size and fails
  if a cache-backed project still carries the derived bytes.
- `tests/tiffStoragePolicy.test.ts` pins the shipped shape: CCITT strips are
  byte-for-byte identical to the source, no `/DCTDecode` re-encode is introduced,
  a decoded colour page is one `/FlateDecode` image per strip, and the cache
  marker is the storage form.
- `tests/tiffCodecs.test.ts` keeps the per-strip CCITT comparison and the
  decoded-raster checksum checks.
- `src-tauri/src/derived_cache_tests.rs` pins the cache write: folder beside the
  project, verified bytes, a source path never written, a symlinked folder
  refused, and the key in the file name.
- `tests/projectPackage.test.ts` and the Rust package tests pin "cache or scan,
  never both" and the `derivedCaches` manifest section.
- `docs/limitations.md` and `docs/user-guide.md` carry the enforced budget and
  the recovery path.

## Non-goals

- Downsampling the decoded raster or a JPEG re-encode (see above).
- A managed-copy mode for `.tif` (F-108).
- New decoders (tiled JPEG, old-style abbreviated JPEG, packed-sample
  predictor, 16-bit output, `/SMask` alpha).
- Changing a source scan. It is only ever read.
- Automatic deletion of an unused cache folder. Deferring it costs disk space
  only; a wrong delete would cost a scan.

## Related

- Findings F-091 (this decision, fixed by schema 27 and the cache lifecycle),
  F-089, F-090, F-092–F-095, F-108, F-113, F-114.
- [`docs/project-file.md`](../project-file.md) — the derived-PDF marker.
- [`docs/limitations.md`](../limitations.md) — the shipped limits.
- Issue [#238](https://github.com/MajorJohnDoe/gridscalr/issues/238) (0.27.0
  decision), [#256](https://github.com/MajorJohnDoe/gridscalr/issues/256)
  (schema 27 and the cache lifecycle).
