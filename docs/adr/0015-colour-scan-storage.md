# ADR 0015: Colour-scan TIF storage and size budget

- Status: Accepted (decision); implementation deferred to a follow-up issue
- Date: 2026-11-13
- Deciders: GridScalr maintainer
- Supersedes: none
- Related: [0012](0012-source-storage-modes.md), [0010](0010-project-file-integrity.md), [0005](0005-large-project-performance.md)

## Context

A TIF is not a drawing format GridScalr can render directly. Import converts the
scan into a derived PDF and stores that PDF as base64 in
`DocumentRef.embeddedPdf`; the project then works without the original file
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
- every save rewrites the whole string, every undo snapshot keeps a copy of the
  serialized project, and the recovery store keeps a snapshot plus checkpoints;
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

## Decision

**0.27.0 keeps the embedded derived PDF and adds a written size budget. The
storage change is deferred, with schema 27 as its vehicle.**

1. A colour or greyscale TIF page keeps the current shape: one derived PDF, one
   image XObject per strip, base64 in `DocumentRef.embeddedPdf`.
2. CCITT G3/G4 passthrough is unchanged and stays byte-for-byte: the compressed
   strips are copied into `/CCITTFaxDecode` streams with no decode and no
   re-encode. Nothing in this budget applies to a bilevel fax sheet.
3. The accepted **size budget** is:
   - **8 MiB of project JSON per 25 MP colour page** (about A2 at 250 DPI;
     measured at 7.2 MiB), so a full A1 colour sheet at 300 DPI counts as about
     two and a half units at its measured 20.1 MiB;
   - **160 MiB of embedded derived PDFs per project** — twenty 25 MP sheets, or
     eight A1-at-300-DPI sheets, about 63 % of the 256 MB project limit, leaving
     at least 96 MiB for pages, items, images, OCR and saved views;
   - a photographic or otherwise poorly compressible sheet counts as several
     units; above the budget the user splits the takeoff into one project per
     building or floor rather than fighting the file.
4. The budget is a documented operating limit, **not a new refusal**. The only
   hard stops remain the existing 256 MB project limit and the save-time size
   check with its localized message. No new field, no new storage mode and no
   schema change are introduced in 0.27.0.
5. The target design is **reference TIF plus a rebuildable derived-PDF cache**,
   not a larger embedded blob, a downsampled raster or a JPEG re-encode. It needs
   schema 27 and is tracked as
   [#256](https://github.com/MajorJohnDoe/gridscalr/issues/256).

### Why the target design is a cache, not a re-encode

| Option | Verdict |
| --- | --- |
| Keep the TIF as the source and rebuild the derived PDF into a local cache keyed by TIF SHA-256 and converter version | **Target.** Removes the bytes from the project JSON, so save, autosave, undo and recovery stop paying for them. Needs schema 27 (optional `embeddedPdf` plus a cache marker), a cache-invalidation and "cache missing" recovery path, a packaging rule, and a decision for a TIF that has moved. |
| Downsample the decoded raster (for example cap at 200 DPI or 12 MP) | **Rejected as a default.** Line work, small text and hatch patterns are exactly what a takeoff measures and an OCR pass reads; a silent resolution cap trades correctness for size, and the loss is invisible in a thumbnail. |
| Re-encode the derived image as JPEG (`/DCTDecode`) | **Rejected.** It needs a JPEG encoder that the app does not ship (a new codec family in the other direction), it is lossy on line art and OCR, and the bytes would still live in the JSON and be rewritten on every save. It buys a factor, not a fix. |
| Extend managed storage to a `.tif` copy | **Not available yet.** Managed copies are PDF-only (`copy_to_project`, the drawings inventory and packaging, F-108). Copying a TIF would create a file the cleanup cannot see. A managed TIF protects portability, not project size. |

### Deferred work and its gate

The cache design is deferred because it needs a schema change, and 0.27.0 is
declared schema-neutral. The follow-up issue must deliver, together:

- schema 27 with optional `embeddedPdf` for a TIF document and a documented
  invalidation rule (TIF SHA-256, converter version, page count);
- the cache location and lifecycle: created on import, reused on open, rebuilt
  when missing and the TIF is reachable, and a localized "re-render the scan"
  path when the TIF is gone;
- package behaviour: a package includes either the cache or the original scan,
  never both, and the manifest says which;
- focused tests for the migration, a missing cache, a moved TIF and an unchanged
  CCITT passthrough;
- a measured before/after on the reference project and an updated budget in this
  ADR and `docs/limitations.md`.

Until then the budget above is the documented answer, and the user guide names
the practical consequence: a large colour set is one project per building or
floor.

## Consequences

- 0.27.0 ships no schema change, no new storage mode and no change to a scanned
  TIF or its derived PDF.
- A colour project is still bounded by the 256 MB project limit, and its save
  time and undo depth degrade as it approaches that limit. That is written down
  instead of being discovered.
- A future cache removes the bytes from the JSON and makes the budget obsolete;
  it also adds a failure mode the app must explain (cache missing, scan moved),
  which is why it is not rushed into a documentation phase.
- The embedded derived PDF remains the reason a TIF project opens without the
  original scan. A cache design must keep that promise when the TIF is present
  and degrade explicitly when it is not.

## Enforcement

- `tests/tiffStoragePolicy.test.ts` pins the shipped shape: CCITT strips are
  byte-for-byte identical to the source, no `/DCTDecode` re-encode is introduced,
  a decoded colour page is one `/FlateDecode` image per strip, and the document
  reference embeds the derived PDF as base64. A future change to the storage
  mode must update the test and this ADR together.
- `tests/tiffCodecs.test.ts` keeps the per-strip CCITT comparison and the
  decoded-raster checksum checks.
- `docs/limitations.md` and `docs/user-guide.md` carry the budget and the
  explicit decode limits (F-089, F-090, F-092–F-095).

## Non-goals

- Implementing the cache, schema 27 or a managed TIF copy in 0.27.0.
- New decoders (tiled JPEG, old-style abbreviated JPEG, packed-sample
  predictor, 16-bit output, `/SMask` alpha).
- Changing a source scan. It is only ever read.

## Related

- Findings F-091 (this decision), F-089, F-090, F-092–F-095, F-108.
- [`docs/project-file.md`](../project-file.md) — the embedded derived PDF.
- [`docs/limitations.md`](../limitations.md) — the shipped limits.
- Issue [#238](https://github.com/MajorJohnDoe/gridscalr/issues/238),
  follow-up [#256](https://github.com/MajorJohnDoe/gridscalr/issues/256).
