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
