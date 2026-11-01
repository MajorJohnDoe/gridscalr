# Roadmap

GridScalr is pre-1.0. This page is the current status: what is shipped, what is
planned for 1.0, what is deliberately deferred, and which decisions are still open.
Detailed planning documents from the implementation period live in
[`docs/plan/archive/`](plan/archive/README.md); they are historical and written in
Swedish.

Current version: **0.16.1** · Project-file schema: **21**

1.0 target: **Windows, macOS and Linux**, English and Swedish UI, portable project
packages, and tested large-project performance. The 1.0 architecture decisions are
recorded in [`docs/adr/`](adr/README.md).

## Product principles

These are not negotiable without an explicit decision, and they apply to every
milestone:

- Local-first. A source PDF or TIF is referenced by path and SHA-256 and is never
  overwritten.
- Hidden items never render, hit-test or export. Hidden layers behave the same way.
- Locked items stay visible and exportable but cannot be edited, moved or deleted.
  Layer visibility and locking take precedence over per-item flags.
- Measurement and drawing layers stay separate; a layer is `measure` or `draw`.
- One bulk action is one undo step.
- Project files stay backward compatible. Every schema change ships migration
  tests for the current and previous version.
- Derived quantities and summaries are calculated from item data, never stored as
  a separate source of truth.
- Exports use the same visibility and locking rules as the canvas.
- No accounts, cloud sync, collaboration, telemetry or network dependencies.

`AGENTS.md` carries the same rules for contributors, with more detail.

## Milestones

| Milestone | Scope | Status | Schema |
| --- | --- | --- | --- |
| 1 | Layers, target layer, selection, per-item visibility and locks, bulk edits, clipboard, context menus | Complete | v2 |
| 2A | Categories, rooms, count tool, deduction areas, quantities panel, measurement bulk edits | Complete | v3 |
| 2B | Waste, rounding, order quantities, quantity CSV and print PDF | Complete | v3 |
| 3A | Quick areas, manual scale, per-page scale locks, markup snapping | Complete | v4 |
| 3B | Drawing export dialog with page ranges, crop, layer selection, labels, calibration and legend | Complete | v4 |
| 4 | Embedded PNG/JPEG images, background and annotation modes, image handles, opacity, rotation, image-aware PDF export | Complete | v5 |
| 5 | TIF import as lossless CCITT G3/G4 pages, multiple documents per project, append-only page numbering | Complete | v6 |
| 0.6 | Built-in vector facility symbols, inspection statuses, Markups symbol and status views | Complete | v13 |
| 0.7 | Docked Markups list with saved views, grouping and filters; stamp and symbol corner resizing; context-aware focus zoom; new app icon | Complete | v14 |
| 0.7.3 | Synchronized read-only split view and XLSX quantity workbook; schema 16 docs sync | Complete | v16 |
| 0.8.0 | Session-only revision comparison with overlay and side-by-side views, markup diff and comparison PDF | Complete | v16 |
| 0.9.0 | Local PDF text-layer search with highlighted hits | Complete | v16 |
| 0.10.0 | Bundled English/Swedish OCR for scanned pages, stored as a rebuildable schema 17 index | Complete | v17 |
| 0.11.0 | Radius, diameter and three-point arc measurements with labels, quantities and PDF export | Complete | v18 |
| 0.12.0 | Angle, slope and volume measurements with their own quantity units and depth input | Complete | v19 |
| 0.13.0 | Reference pane with same-page, revision and raw PDF drawing sources; curve, angle and slope labels placed outside their geometry | Complete | v19 |
| 0.13.1 | Slope preview matches the saved label, volume depth dialog and volume label locking, level reference panes and a collapsible comparison panel | Complete | v19 |
| 0.13.2 | Shared Circle & arc and Angle & slope tool families, a distinct symbol icon, and signal-red default measurement layers with local layer colour defaults | Complete | v19 |
| 0.13.3 | Release hardening: Save/Discard/Cancel, safe dialog focus, automated checksums, context-bar family switching and reference menu state | Complete | v19 |
| 0.14.0 | Internal refactors: reference/comparison controller, canvas draft renderer, shared flyout mount, ESLint in CI, direct UI tests and ADR 0001 | Complete | v19 |
| 0.14.1 | Lazy-loaded OCR, PDF exports, XLSX and TIF import; production source maps removed | Complete | v19 |
| 0.15.0 | Custom count types, pieces per count object, schema 20 and the first feature module | Complete | v20 |
| 0.16.0 | Count schedule: quantity rows per count type, Markups count-type column/filter/grouping, count legend glyphs and reusable presets | Complete | v21 |
| 0.16.1 | Two-finger touch pan and pinch zoom on both canvases, pen/palm priority and long-press context menu | Complete | v21 |
| **0.17.0** | **Portable `.gridscalr.zip` packages, Windows/macOS/Linux builds, safer saving, preferences, diagnostics, demo onboarding, i18n foundation** | **Planned** | v21 |
| **0.18.0** | **Swedish/English UI and reports, locale formatting, project metadata and report branding** | **Planned** | v22 |
| **0.19.0** | **Large-project performance, independent reference page navigation** | **Planned** | v22 |
| **1.0.0** | **Release candidate hardening, documentation, clean installs and public 1.0** | **Planned** | v22 |

Schema history and migration rules are documented in
[`project-file.md`](project-file.md).

## Path to 1.0

The program index is issue
[#59 — Roadmap: GridScalr 1.0](https://github.com/MajorJohnDoe/gridscalr/issues/59).
Work is grouped into release milestones so each stage can be tested and released
independently.

### 0.17.0 — Portable projects and platform foundation

**Goal:** send a project to another person and run GridScalr on all three desktop
platforms.

Deliverables:

- Portable `.gridscalr.zip` packages with manifest, checksums, relative paths and
  opt-in exports/original scans — [#40](https://github.com/MajorJohnDoe/gridscalr/issues/40)
- Windows, universal macOS and Linux x86_64 artifacts with checksums and CI matrix —
  [#41](https://github.com/MajorJohnDoe/gridscalr/issues/41)
- Separate app preferences from project settings, plus local diagnostics and support
  links — [#42](https://github.com/MajorJohnDoe/gridscalr/issues/42)
- `.gridscalr` file association, single instance and window state —
  [#43](https://github.com/MajorJohnDoe/gridscalr/issues/43)
- Safer atomic saving, backups and canonical path protection —
  [#44](https://github.com/MajorJohnDoe/gridscalr/issues/44)
- Bundle the demo project and add a three-step quick start —
  [#45](https://github.com/MajorJohnDoe/gridscalr/issues/45)
- Packaged desktop smoke tests on all three platforms —
  [#46](https://github.com/MajorJohnDoe/gridscalr/issues/46)
- Typed message catalogs, language selection and English fallback —
  [#47](https://github.com/MajorJohnDoe/gridscalr/issues/47)

Exit criteria:

- A multi-PDF project packages, transfers and opens without relinking.
- All three platforms produce startable artifacts from the same tag.
- A failed save never destroys the previous project.
- New UI strings use catalog keys.
- The packaged app passes a launch/open/save smoke test on each platform.

### 0.18.0 — Swedish, English and professional output

**Goal:** a Swedish user can complete the full workflow and send a professional
procurement report.

Deliverables:

- Complete Swedish UI, reports, XLSX/CSV headings and locale-aware formatting —
  [#48](https://github.com/MajorJohnDoe/gridscalr/issues/48)
- Optional project metadata and report branding, schema 22 —
  [#49](https://github.com/MajorJohnDoe/gridscalr/issues/49)
- Swedish quick start and language-aware help fallback —
  [#50](https://github.com/MajorJohnDoe/gridscalr/issues/50)
- Honest “count schedule” wording for doors, windows and fixtures —
  [#51](https://github.com/MajorJohnDoe/gridscalr/issues/51)

Exit criteria:

- Swedish and English UI are complete and selectable.
- A Swedish quantity PDF/XLSX/CSV uses Swedish headings and number formatting.
- Project metadata renders on reports and survives packaging.
- Missing translations fail CI.
- English remains complete.

### 0.19.0 — Scale and workflow

**Goal:** large drawing sets and many objects are a tested, supported use case.

Deliverables:

- Reference project, benchmarks, virtualised Markups, adaptive history, faster
  autosave and canvas viewport culling —
  [#52](https://github.com/MajorJohnDoe/gridscalr/issues/52)
- Independent page navigation in the reference pane —
  [#23](https://github.com/MajorJohnDoe/gridscalr/issues/23)

Exit criteria:

- The reference project opens, edits, saves and packages within the documented
  budgets.
- No UI freeze over two seconds without progress and cancel.
- Memory and autosave limits are documented in `docs/limitations.md`.
- The same budgets are checked on Windows, macOS and Linux.

### 1.0.0 — Release candidate and hardening

**Goal:** a release candidate that is safe to call 1.0.

Deliverables:

- Release-candidate gate, clean install/upgrade/uninstall and schema freeze —
  [#53](https://github.com/MajorJohnDoe/gridscalr/issues/53)
- Complete 1.0 documentation, screenshots, website and release notes —
  [#54](https://github.com/MajorJohnDoe/gridscalr/issues/54)
- Accessibility and performance release gates —
  [#55](https://github.com/MajorJohnDoe/gridscalr/issues/55)

Exit criteria:

- All P0/P1 issues closed.
- Schema 22 migration and project packages verified.
- Clean installation and upgrade tested on Windows, macOS and Linux.
- `1.0.0-rc.1` has been exercised before `1.0.0`.
- Strict documentation and site checks pass.
- Release notes and all platform artifacts are published.

## Definition of done for 1.0

1. Windows, macOS and Linux artifacts are built, checksummed and installable.
2. English and Swedish UI, reports and export formats are complete.
3. A project can be packaged, sent and opened by another person.
4. Large projects meet the documented performance budgets.
5. Saving, recovery, diagnostics and project metadata are production-ready.
6. Packaged desktop smoke tests pass on all platforms.
7. The schema and migration promise are frozen and documented.
8. No P0/P1 bugs, no unaccepted dependency alerts, and the release checklist is
   complete.

## After 1.0

Candidates in expected-value order, not scheduled:

1. **Code signing and macOS notarization** — deferred by decision; tracked in
   [#56](https://github.com/MajorJohnDoe/gridscalr/issues/56).
2. **Full Swedish user guide, workflows and additional languages** — the 1.0 help
   system is ready; translation follows in
   [#57](https://github.com/MajorJohnDoe/gridscalr/issues/57).
3. **Broader TIF decoding** for LZW/Deflate, greyscale, colour and JPEG-in-TIFF
   scans — [#58](https://github.com/MajorJohnDoe/gridscalr/issues/58).
4. **Project templates** for recurring properties and portfolios.
5. **Facility symbol quantities in the procurement report.**
6. **Snap directly to PDF vector geometry** as a separate spike.
7. **Semantic PDF vector comparison** as a separate spike.
8. **Additional OCR languages** with matching traineddata and license review.
9. **Automatic update check** only with an explicit local-first decision.

## Deferred by design

These are known gaps, not bugs. See [`limitations.md`](limitations.md) for the
full list.

- No cloud sync, accounts, collaboration or automatic updates.
- Pages are append-only. Deleting a page is an explicit structural action; pages
  cannot be inserted or reordered.
- Markups are stored in the project, not as PDF annotations or optional-content
  groups. The drawing PDF export flattens visible markups into page content.
- Images are embedded in the project file. External image assets are only worth
  adding if project size becomes a practical problem.
- Quantity reports are CSV, XLSX and PDF. The Excel workbook is derived on demand
  and never replaces the item data.
- The symbol library is built in; custom symbol uploads and symbol quantities in
  the procurement report are not supported.
- Count types are limited to door, window, radiator, fixture and other.
- Door and window schedules remain Count schedules without width, height or fire
  rating fields.
- Rectangle and ellipse quick areas cannot be rotated.
- Text notes do not wrap in a fixed box; `Shift+Enter` inserts a line break.
- The full user guide and workflows remain English-only for 1.0; the Swedish quick
  start and help fallback ship with the Swedish UI.

## Open decisions

| Decision | Current position |
| --- | --- |
| Windows code signing | Deferred for 1.0. Unsigned installers, checksums and SmartScreen instructions. Revisit in [#56](https://github.com/MajorJohnDoe/gridscalr/issues/56). |
| macOS signing and notarization | Deferred for 1.0. Document the Gatekeeper path. Revisit in [#56](https://github.com/MajorJohnDoe/gridscalr/issues/56). |
| macOS and Linux release pipelines | Planned for 0.17.0: universal macOS DMG and Linux x86_64 AppImage/deb/tar.gz. |
| Windows and Linux ARM64 | Deferred until there is demand. |
| Full Swedish help | Quick start and UI chrome in 1.0; full guide/workflows after 1.0. |
| External image assets | Deferred until embedded project files become too large in practice. |
| TIF codecs beyond CCITT G3/G4 | Deferred; would need a decoding fallback. Tracked in [#58](https://github.com/MajorJohnDoe/gridscalr/issues/58). |
| Revision comparison scope | Shipped with visual overlay, side-by-side and a markup diff. Semantic PDF vector diff is a separate spike. |
| OCR engine | Bundled Tesseract.js with English and Swedish models. Additional languages require new traineddata assets and license review. |
| PDF vector geometry snapping | A candidate spike, not scheduled. |
| Door and window schedule attributes | Count schedule only for 1.0; no width, height or fire rating. |
| Project package format | Standard `.gridscalr.zip` with manifest and relative paths. See [ADR 0002](adr/0002-project-package.md). |

## Technical debt and post-release refactors

These are internal improvements, not user-facing promises. Record concrete
items as GitHub issues with the `tech-debt` or `refactor` label rather than
anonymous `TODO` comments in code; see **Issue tracking** in `AGENTS.md`.

- Split `CanvasView.ts` further into label rendering, annotation drawing and pointer interaction modules.
- Extract project save/open flows from `App.ts` into focused `src/app/` modules.
- Split `selectionInspector.ts` and `settingsDialog.ts` into section modules as they grow.
- Lazy-load the PDF.js renderer so the welcome screen and project shell do not parse the PDF runtime before a drawing is opened.
- Virtualise the Markups table and adapt history/autosave for large projects — [#52](https://github.com/MajorJohnDoe/gridscalr/issues/52).
- Add viewport culling for canvas items.
- Replace full-snapshot history for large projects.
- Extract UI strings into the localization catalog — [#47](https://github.com/MajorJohnDoe/gridscalr/issues/47).
- Harden atomic saving and canonicalise protected paths — [#44](https://github.com/MajorJohnDoe/gridscalr/issues/44).
- Revisit the GTK/glib generation with a future Tauri upgrade so the Linux advisory can be cleared; tracked in [#21](https://github.com/MajorJohnDoe/gridscalr/issues/21).

## Project operations

- The repository is public and MIT licensed. Releases are cut manually from tested
  artifacts; see [`releasing.md`](releasing.md).
- The release workflow will expand from Windows-only to a Windows/macOS/Linux matrix
  in 0.17.0. Until then, Linux and macOS remain source builds.
- CI runs lint, frontend tests, build, UI smoke tests and canvas regressions on
  Ubuntu, plus `cargo fmt` and `cargo check`.
- The bilingual landing page and feature tour are generated from `site/` and
  deployed to GitHub Pages by `.github/workflows/pages.yml`. English pages are at
  `/` and `/features/`; Swedish pages at `/sv/` and `/sv/funktioner/`.
- `site/release.json` is the single source for the displayed release version,
  date, notes URL and download asset links. It is updated for every tagged release.
- `main` is protected and requires both CI jobs. Dependabot proposes weekly
  dependency updates.
