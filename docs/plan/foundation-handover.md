# Foundation handover

**Purpose:** compact state between foundation phases. Each phase appends one
section. Detailed behaviour belongs in the user guide, architecture map and
findings log; this file records what landed, what is next and what a later phase
must know.

**Related:** [`robustness.md`](robustness.md), [`foundation-findings.md`](foundation-findings.md),
ADR [0010](../adr/0010-project-file-integrity.md)–[0013](../adr/0013-module-first-foundation.md),
epic [#59](https://github.com/MajorJohnDoe/gridscalr/issues/59).

## Phase 1 — Safe save

- **Issue:** [#153](https://github.com/MajorJohnDoe/gridscalr/issues/153) — closed.
- **PR:** [#160](https://github.com/MajorJohnDoe/gridscalr/pull/160) — squash-merged.
- **Commit:** `b745b3b` on `main`.
- **Schema:** unchanged (23). The file stamp is runtime state and is never
  serialized.

### Completed

- Runtime `ProjectFileStamp` (SHA-256, size, mtime), captured on open, after a
  successful save and on package open; cleared on reset.
- Rust `write_project_conditional` hashes the target immediately before the
  rename, rejects a mismatch with a structured `projectConflict` error, writes
  through a flushed sibling temp file, reads the file back and verifies bytes.
- Conflict dialog: **Save as conflicted copy** (default), **Compare with disk
  version**, **Reload from disk**, **Overwrite** (danger), **Cancel**.
  Conflicted copies use `<project> (conflicted copy YYYY-MM-DD HHMM).gridscalr`
  and never touch the disk file.
- Rolling three-file backups in app data keyed by project ID, plus
  **File → Back up now…** and **File → Restore backup…**. Restore opens an
  unsaved copy and never enters recents or packages.
- No-op saves skip the write. Failed saves restore relative document paths in
  memory. Browser fallback still downloads and explicitly does not claim a
  conditional write.

### Modules

```text
src/features/saveIntegrity/
  index.ts        public surface
  stamp.ts        ProjectFileStamp, no-op rule, conflicted-copy name
  conflict.ts     conflict classification and actions
  backup.ts       backup naming/retention helpers
  files.ts        Tauri/platform adapters
  ports.ts        host boundary
  controller.ts   save, conflict and backup orchestration
  ui.ts           conflict, compare and restore dialogs
src-tauri/src/project_write.rs   stamps, conditional write, read-back
src-tauri/src/project_backup.rs  rolling backup commands
```

`ProjectSession.saveProject()` delegates to the feature controller; `App.ts` and
`ProjectSession` remain wiring.

### Decisions

- Comparison in the conflict dialog is metadata-only for now (F-004).
- A missing target for an expected stamp is a conflict, not a silent recreate.
- Backups live in app data, not beside the project, and are keyed by project ID.

### New findings

- F-004 — conflict comparison is metadata-only (P2, deferred to Phase 6).
- F-005 — restored backups cannot resolve relative drawing links when opened
  with a null project path (P2, open).
- F-006 — backup history is keyed only by project ID (P2, open).

### Checks

Full AGENTS pre-commit list plus `npm run test:ui`, `test:import`,
`test:canvas`, `test:count`, `test:touch`, `test:visual`,
`cargo test --lib` and GitHub CI on Ubuntu, Windows and macOS. All green.

### Next

- Phase 2, [#154](https://github.com/MajorJohnDoe/gridscalr/issues/154) — scoped
  autosave, recovery chooser, advisory leases and read-only open. Phase 2 must
  consume the Phase 1 stamp rather than introduce a second file-identity model.
  The Phase 1 conflict dialog is reused for take-over/save conflicts.

## Phase 2 — Recovery and open-elsewhere

- **Issue:** [#154](https://github.com/MajorJohnDoe/gridscalr/issues/154).
- **PR:** [#161](https://github.com/MajorJohnDoe/gridscalr/pull/161).
- **Schema:** unchanged (23). Recovery records and the sidecar lease are outside
  the project JSON.

### Completed

- IndexedDB v2 recovery records keyed by project ID and instance ID. Each project
  keeps the latest autosave plus one previous; checkpoints are separate and
  capped at ten per project. Every record stores the Phase 1 base file SHA-256.
- Legacy `current` and `gridscalr.autosave.v1` snapshots migrate to an explicit
  record with an unknown base hash; nothing is restored automatically.
- Recovery chooser on the welcome screen, Preferences → Data and the project
  flow. It lists every project and instance, labels snapshots based on an older
  or unknown file version, and requires an explicit Restore, Discard or Cancel.
  A successful normal save clears this instance's record.
- Atomic sidecar lease in `src-tauri/src/project_lease.rs` with instance ID,
  project ID, opened time, 30-second heartbeat, project hash, coarse host label
  and app version. A live foreign lease offers **Open read-only** (default),
  **Take over** and **Cancel**. Stale and corrupt leases are information only.
  A save verifies lease ownership first, so a taken-over session cannot write
  even before its next heartbeat.
- Read-only sessions can export, package and **Save a copy**, but normal Save and
  Save As are refused and the status bar shows **Read-only**.
- Non-blocking file-change banner with **Reload from disk**, using a cheap
  metadata check before hashing. No network.
- Labelled checkpoints before page delete/duplicate, add/import pages, sheet add
  and paper change.
- Browser fallback keeps the scoped IndexedDB recovery store and has no sidecar
  lease, read-only enforcement or file watcher.

### Modules

```text
src/features/sessionRecovery/
  index.ts          public surface
  record.ts         record types, IDs, retention and sorting
  autosave.ts       scoped snapshot API, migration and cleanup
  recoveryStore.ts  IndexedDB v2, localStorage fallback and legacy cleanup
  recovery.ts       base-version comparison and recoverable entries
  lease.ts          pure lease model, stale boundary and classification
  leaseFiles.ts     Rust lease command wrappers
  leaseSession.ts   acquire, take-over, heartbeat and release lifecycle
  controller.ts     autosave loop, chooser, read-only and watcher orchestration
  checkpoint.ts     labelled structural checkpoints
  watch.ts          metadata-first project file polling
  summary.ts        synchronous summary for welcome and Preferences
  ui.ts             chooser, lease dialog and banners
  ports.ts          host boundary
src/app/recoveryHost.ts  app host wiring
src-tauri/src/project_lease.rs  atomic lease commands
```

`state/autosave.ts` is retired; `state/store.ts` keeps only runtime read-only and
autosave-error state.

### Decisions

- A stale lease is not taken over automatically. The banner offers an explicit
  **Clear stale lock**, which clears only the observed stale owner and then
  acquires a fresh lease. Corrupt leases are ignored and replaced.
- Read-only blocks Save and Save As, not in-memory editing (F-007). Local edits
  leave through **Save a copy…**.
- Recovery retention is count-based, not byte-based (F-008).
- The watcher checks size and mtime first and hashes only when either changes
  (F-010).

### New findings

- F-007 — read-only mode blocks saving, not editing (P2, open).
- F-008 — recovery retention is count-based, not size-based (P2, open).
- F-009 — lease instance identity is session-scoped and coarse (P3, open).
- F-010 — metadata watcher can miss a same-size, same-mtime change (P3, open).

### Checks

Full AGENTS pre-commit list plus `npm run tauri build -- --no-bundle`,
`npm run test:ui`, `test:import`, `test:canvas`, `test:count`, `test:touch`,
`test:visual`, `cargo test --lib` and GitHub CI on Ubuntu, Windows and macOS.

### Next

- Phase 3, [#155](https://github.com/MajorJohnDoe/gridscalr/issues/155) — explicit
  page list and schema 24. Keep the recovery records and lease metadata stable;
  page checkpoints keep working once page deletion cascades by page ID.

## Phase 3 — page list and document model (#155)

Status: implemented on `feat/155-page-model`, PR
[#162](https://github.com/MajorJohnDoe/gridscalr/pull/162). No app version bump.

### Scope delivered

- `PageId` and `PageRecord[]` as the canonical page order; `MarkupItem.pageId`,
  `Layer.homePageId` and page-state keys by page ID.
- Schema 24 migration with deterministic page IDs, page/item/layer/page-state
  mapping and invalid-reference warnings.
- Insert, drag-and-drop reorder, duplicate and delete by stable page ID.
- Empty projects and the **Blank project** starting flow.
- **Replace source…** with page mapping, superseded documents and explicit
  cleanup.
- One destination layer per source layer identity on project import; import
  appends by default and accepts an insertion index.
- Revision comparison matches by PageId first, then the fallback page position.

### Modules

```text
src/model/pages.ts             PageId, PageRecord and resolvers
src/features/pageModel/
  index.ts                     public surface
  pageList.ts                  insert, move, delete, duplicate, cleanup
  replacement.ts               source mapping and superseded documents
  importMapping.ts             source layer identity and insertion index
  ui.ts                        replacement mapping dialog
src/io/projectFile/pages.ts    schema 23 → 24 migration and normalization
src/app/replacementFlows.ts    file pick, previews, renderer swap and checkpoint
```

### Migration IDs and strategy

- IDs are `page_` plus an FNV-style hash of project ID, document ID, source-local
  page and document-order ordinal. The same input always produces the same IDs.
- The page list is built in document order from `documents` and
  `excludedPages`; numeric page state moves into `record.state`.
- Invalid item pages fall back to the first page and are reported. Invalid layer
  home pages are cleared, invalid page-state keys are dropped, and all three are
  reported. Nothing is silently renumbered.
- `DocumentRef.copiedFrom.page` remains a source-local provenance number, not a
  project page reference. `DocumentRef.superseded` is persisted.

### Decisions

- Runtime `ui.page` stays a 1-based display number; every stored reference is a
  page ID.
- Deleting the last page of a document removes that document. Template sheets
  clone their document on duplicate/insert so their field maps stay independent.
- Replacing a source updates the existing `DocumentRef` when every old page is
  mapped; otherwise a new document is added and the old one is marked
  superseded. Cleanup is explicit and checkpointed.
- Cross-document reorder is supported by the model and enabled in the UI. TIF
  replacement is out of scope (F-013).

### New findings

- F-011 — template sheet fields remain document-owned (P2, open).
- F-012 — renderer page order is synchronized manually (P2, open).
- F-013 — source replacement supports PDF only (P3, open).

## Phase 4 — source storage and managed copies (#156)

Status: implemented on `feat/156-source-storage`. No app version bump.

### Scope delivered

- `DocumentRef.storage: "reference" | "managed"` with optional `originalPath`
  and `originalSha256`; schema 25 and a schema 24 → 25 migration that marks
  every document as a reference without touching a file.
- A Rust `source_copy.rs` command copies a PDF into
  `<project>.drawings/<safe-name>-<hash8>.pdf`, verifies the copied SHA-256 and
  refuses a destination inside a protected source path. Source hash checks and
  a non-recursive folder checksum search support relinking.
- **Use managed copy**, **Detach from source**, **Consolidate drawings…**, the
  source-changed banner (**Reload**, **Use current**, **Relink**, **Copy into
  project**) and a non-blocking cloud/UNC import recommendation.
- Managed copies are linked relatively and keep provenance. Packages include
  each managed drawing once and clear the sender's original path.
- Reload/Relink verify the page count and route a change to Phase 3 **Replace
  source…** rather than guessing.

### Modules

```text
src/features/sourceStorage/
  index.ts        public surface
  mode.ts         reference/managed mode and cloud/UNC hint
  managedCopy.ts  managed fields, detach and consolidation candidates
  documents.ts    document lookup and path resolution
  copyActions.ts  copy and consolidate orchestration
  sourceActions.ts detach, use-current, reload and relink
  relink.ts       action list, page/checksum checks and folder search
  files.ts        Tauri command wrappers
  controller.ts   banner state and public controller
  ports.ts        host boundary
  ui.ts           import recommendation and source banner
src/io/projectFile/sourceStorage.ts  schema 24 → 25 migration
src/app/sourceStorageHost.ts         app wiring and renderer replacement
src-tauri/src/source_copy.rs         verified copy, hash and folder search
```

`App.ts` adds one field, one factory call and document actions; renderer
replacement and page-size refresh stay in `sourceStorageHost.ts`.

### Decisions

- A managed copy requires a saved project; the user is prompted to save first
  and no PDF is ever embedded as a fallback.
- A source that changed on disk is never copied silently. Copy verifies the
  stored checksum before writing.
- Relink by checksum is limited to the project folder and its drawings folder.
- Managed copy, detach, reload, relink and consolidation are explicit,
  checkpointed structural actions and clear undo history so an older snapshot
  cannot restore a previous source path.
- The managed folder is fixed at `<project>.drawings/`; a selectable folder
  remains a future decision (F-014).

### New findings

- F-014 — managed drawings folder is fixed, not user-selectable (P2, open).
- F-015 — cloud/network detection is a path-segment heuristic (P3, accepted).
- F-016 — same-size source changes can be missed between status polls (P3, open).
- F-017 — managed copies are not garbage-collected on detach or document removal
  (P2, open).
- F-018 — consolidation failure can leave unreferenced copies on disk (P3,
  accepted).

### Next

- Phase 5, [#157](https://github.com/MajorJohnDoe/gridscalr/issues/157) —
  integrity validator, load report, project doctor, import preflight and
  provenance.

## Phase 5 — integrity and project doctor (#157)

Status: implemented on `feat/157-project-integrity`, PR
[#164](https://github.com/MajorJohnDoe/gridscalr/pull/164). No app version bump;
schema stays 25.

### Scope delivered

- Pure `validateProject()` in `src/model/integrity.ts` with duplicate-ID,
  reference, page-range, count-preset, Markups-view, active-layer, report-logo,
  `excludedPages`, `copiedFrom`, OCR checksum/source-page, asset MIME/data and
  image/text-box geometry rules. Zero documents and zero pages are valid.
- `ProjectLoadReport` extended with `dropped`, `repaired` and `issues`; the parser
  reports every normalization drop and repair instead of filtering silently.
- Normal save validates before serialisation, shows warnings for acceptance,
  blocks errors and opens the doctor. Serialisation is followed by parse and
  entity-shape comparison before the existing conditional verified write.
  Browser Save validates too; autosave is not blocked.
- Project doctor: load report, issue list by severity/entity, **Open read-only**,
  **Save repaired copy…**, **Export diagnostics…**, and explicit duplicate-ID,
  dangling-reference and stale-OCR repairs. Repairs work on a copy; reparsed
  open uses the in-memory repaired project only after the user chose it.
- Import preflight counts pages, items, documents, merged categories, count
  types, line types, assets, missing files, skipped pages, checksums and page
  count changes before mutation. Imported pages keep optional provenance.
- Optional `PageRecord.provenance` (source project ID, revision SHA-256/size/
  mtime, source page ID, import time, app version). Schema 25; older files load
  unchanged and malformed provenance is dropped with a load-report code.

### Modules

```text
src/model/integrity.ts                  pure validator and shape comparison
src/io/projectFile/report.ts            load-report counts
src/io/projectFile/{parse,pages,items,layers,documents}.ts  reporting hooks
src/features/projectIntegrity/
  index.ts                              public surface
  validator.ts                          re-export of the shared rules
  repair.ts                             explicit repairs
  doctor.ts                             doctor loop, load decision, diagnostics
  ui.ts                                 localized doctor and warning dialog
src/features/projectImport/preflight.ts import preflight model
src/features/projectImport/preflightUi.ts preflight dialog
src/app/projectDoctorFlows.ts           App wiring for doctor and load report
```

### Decisions

- The validator lives in `src/model`, not in the feature, so `io` and
  `saveIntegrity` can call it without a reversed dependency.
- Saved repair output is always a copy. The doctor never repairs the open file in
  place and never blocks autosave recovery.
- Provenance is descriptive and optional, not a signature or revision DAG.
- Repairs keep the first duplicate ID; references stay attached to it (F-020).
- The validator does not read external sources, so it proves internal
  consistency only (F-019).

### New findings

- F-019 — validator proves internal references, not external source truth (P2, open).
- F-020 — duplicate-ID repair keeps the first occurrence (P2, open).
- F-021 — import provenance is stored but not shown in the UI (P2, open).
- F-022 — import revision hash is computed from decoded text (P3, open).

### Next

- Phase 6, [#158](https://github.com/MajorJohnDoe/gridscalr/issues/158) —
  interoperability: real OCG layers, annotation export, package/share flow,
  relinking search by checksum and **Compare with disk version**.

## Phase 6 — interoperability (#158)

Status: implemented on `feat/158-interoperability`, PR
[#165](https://github.com/MajorJohnDoe/gridscalr/pull/165). No app version bump;
schema stays 25.

### Scope delivered

- Opt-in **Optional layers (OCG)** in the drawing export. `src/pdf/export/ocg.ts`
  writes `/OCProperties` on the catalog, one `/OCG` per exported visible layer
  and `/OC … BDC` … `EMC` around that layer's drawing on each page. Hidden
  layers, page-scoped hidden layers and hidden items are still excluded.
- Opt-in **Review annotations** in the drawing export.
  `src/pdf/export/annotations.ts` writes standard `Square`, `Circle`, `Line`,
  `PolyLine`, `Polygon` and `Text` annotation dictionaries with `/Rect`, `/C`,
  `/Contents`, `/T` = GridScalr and `/NM` = item ID. No appearance stream, no
  project data and no change to the flattened page.
- **Compare with disk version** at a save conflict now parses the disk project
  through the save-integrity port and runs the existing `compareRevisions()`
  engine. The dialog shows changed/added/removed item counts, page rows and
  changed fields including `countQuantity` and `depth`. Invalid disk data falls
  back to the metadata summary. Nothing is merged or written.
- **File → Share project package…** replaces the old Package wording. The
  existing package flow is unchanged: one action, managed drawings once,
  sender paths cleared, optional reports/drawing PDF.

### Modules

```text
src/pdf/export/ocg.ts                 optional-content catalog, OCGs and BDC/EMC
src/pdf/export/annotations.ts         review-only annotation dictionaries
src/features/saveIntegrity/compare.ts read-only conflict comparison summary
src/pdf/pdfExport.ts                  orchestration only; wraps layer drawing
src/ui/dialogs.ts                     two opt-in export checkboxes
```

### Decisions

- OCG and annotations are one-off export options, never project data, and both
  default off so the flattened PDF is byte-identical to the previous default.
- The OCG wrapper uses a page `/Properties` entry for each group instead of an
  inline dictionary, which keeps the content stream standards-shaped and lets
  pdf.js resolve the same group names.
- Review annotations are sticky notes for text-like items to avoid a missing
  `/DA` font and keep the flattened text untouched. Geometry is the item bounds
  or vertex list, not a generated appearance.
- Conflict comparison is read-only. **Save as conflicted copy** remains the
  default and the conflict action state is unchanged by comparing.

### New findings

- F-023 — OCG groups cannot express page-scoped layer visibility (P2, open).
- F-024 — review annotations have approximate geometry and reader-dependent
  appearance (P2, accepted).
- F-025 — conflict comparison is heuristic and project-data only (P2, open).
- F-026 — share package has no operating-system share sheet (P3, accepted).
- F-004 — conflict comparison is no longer metadata-only (fixed).

### Checks

Full AGENTS pre-commit list plus `npm run test:ui`, `test:import`,
`test:canvas`, `test:count`, `test:touch`, `test:visual`, `cargo test --lib` and
GitHub CI on Ubuntu, Windows and macOS.

### Next

- Phase 7, [#159](https://github.com/MajorJohnDoe/gridscalr/issues/159) —
  stateful and property-based page/save flows, concurrent-save and
  crash-during-save tests, a migration corpus and CI gates.

## Phase 7 — robustness, concurrency and migration gates (#159)

Status: implemented on `feat/159-robustness-gates`. No app version bump; schema
stays 25.

### Scope delivered

- `tests/robustness/pageIdentity.test.ts` runs a deterministic, seeded sequence
  of insert, reorder, duplicate, delete, import, source replacement, bulk edit,
  undo/redo, save and load. Every step checks unique IDs, every item/layer/page
  reference, display page numbers, stable `PageId` bindings, operation-accounted
  counts and `validateProject()` errors. It proves one import and one bulk edit
  are one undo step, structural page actions clear history and a checkpoint is
  written before a structural action.
- `tests/robustness/saveConflict.test.ts` models two writers against one path:
  a stale stamp conflicts, the default conflicted copy preserves both versions,
  overwrite needs the explicit action, a failed write keeps the previous file
  and in-memory project valid, a deleted target is not recreated and a no-op save
  does not rewrite.
- Rust `project_write` tests cover the conditional write against a changed file,
  a failure between the flushed temporary file and the rename (previous file
  remains readable), a missing/empty expected hash as the explicit overwrite
  path, hash case, and a second writer that still holds the loaded stamp.
- `fixtures/legacy/` now contains a deliberate fixture for every schema 1–25:
  the older single-`document` shape, numeric page maps, each version's added
  fields, and the schema 24 page list and schema 25 storage mode. The original
  schema 23/24 fixtures remain, and `scripts/make-legacy-fixtures.mjs`
  regenerates the corpus deterministically.
- `tests/robustness/migrations.test.ts` loads every fixture, checks the
  version-specific data, deterministic page IDs, reported invalid references and
  the no-move schema 24 → 25 path.
- `tests/robustness/sourceStorage.test.ts` covers reference versus managed
  mode, managed-copy identity, consolidation leaving the original bytes
  untouched, a changed reference never being auto-accepted, managed drawings
  included once in a package, empty project save/load/import, and page identity
  through reorder, delete and source replacement.
- `npm run test:robustness` runs only `tests/robustness/`. The normal
  `npm test -- --run` suite includes it, and CI runs the focused command as a
  named step. `docs/testing.md` records the suites and their limits.
- `Store.clearHistory()` and source replacement now discard undo/redo at the
  structural boundary (F-027). The unused `remapPageItems()` helper was removed
  (F-003).

### Findings

`docs/plan/foundation-findings.md` now has a Phase 7 triage table for F-001 to
F-027. F-003 and F-027 are fixed; the rest are deferred or accepted with a
written rationale. No finding was silently closed and no app version was
changed.

### Checks

Full AGENTS pre-commit list plus `npm run test:robustness`, `cargo test --lib`
and the Playwright suites (`test:ui`, `test:import`, `test:canvas`, `test:count`,
`test:touch`, `test:visual`).

## Foundation complete

All seven foundation phases are implemented. This is not a 1.0 release claim:
the app version remains 0.22.4, the project schema remains 25, and no tag is
created by this phase.

The tests now enforce:

- conditional saves, conflicted copies and a readable previous file after a
  failed or interrupted replace;
- unique IDs and live references for documents, pages, layers, items,
  categories, count types, line types, count presets and Markups views;
- stable page identity through insert, reorder, duplicate, delete, import and
  source replacement;
- one import or bulk edit as one history step, structural actions clearing
  history and checkpoints before structural actions;
- deterministic migration from every supported schema, with invalid references
  reported rather than silently dropped;
- reference/managed source modes, verified copies, package-once behaviour and
  empty projects;
- source files remaining immutable through copy, consolidation and package
  paths.

Remaining limitations stay in [`docs/limitations.md`](../limitations.md) and the
triaged findings log. The tests cannot prove a real cloud client racing between
the final hash check and the rename, a process kill at every instruction, or
external source truth without reading the drawing. Those remain documented
limits, not hidden assumptions.

No Phase 8 exists. Future work is product maintenance and the 1.0 quality gate
in [`docs/roadmap.md`](../roadmap.md), tracked through issues rather than a new
foundation phase.
