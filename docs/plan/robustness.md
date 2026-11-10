# Project-file robustness and concurrent editing

**Status:** proposed 2026-11-10. Discussion draft; no implementation is scheduled.
**Scope:** concurrent edits on local, network and cloud-synced files; save and
recovery integrity; stable page identity; layer and markup binding; import and
structural-operation safety.
**Related:** PR [#152](https://github.com/MajorJohnDoe/gridscalr/pull/152),
issue [#44](https://github.com/MajorJohnDoe/gridscalr/issues/44),
issue [#53](https://github.com/MajorJohnDoe/gridscalr/issues/53),
[project file](../project-file.md), [limitations](../limitations.md),
[roadmap](../roadmap.md).

If the code and this plan disagree, stop and surface the conflict rather than
silently choosing one.

**Baseline:** PR #152 (`feat/project-page-import`) is merged as commit
`7083814`. This plan builds on the import module. It keeps the import rules
that the source project is read-only and that one import is one undo step. It
extends those rules with page identity, conflict safety and provenance.

## 1. Summary

GridScalr is local-first. A source PDF or TIF is referenced by path and SHA-256
and is never overwritten. The `.gridscalr` project is the source of truth for
pages, layers, measurements, symbols, counts, categories, rooms and quantities.

That model is strong for measurement and procurement. It is weaker than a
PDF-centric editor at the edges of the file lifecycle:

- a project file can change outside GridScalr while it is open;
- two machines can edit the same cloud-synced file;
- a crash or a second window can overwrite the only recovery snapshot;
- page bindings are numeric and must be remapped by every structural operation;
- malformed project data can be filtered out without a report.

This plan treats the project file as a small database. It adds conditional
writes, scoped recovery, stable page identities, referential-integrity checks
and recovery checkpoints for structural operations. It does not add cloud sync,
accounts, collaboration or a server.

## 2. What is already strong

The plan should not regress these properties:

- The source drawing is protected by a write guard, canonical-path checks and
  SHA-256 references.
- Project saves use a flushed temporary file and a single rename in
  `src-tauri/src/commands.rs` (`atomic_write`). A failed save keeps the previous
  file.
- Hidden items do not render, hit-test or export. Locked items remain visible
  and exportable but cannot be edited.
- Quantities are derived from item data, never stored as a separate source of
  truth.
- Pages are append-only. New pages append at the end; deleting a page is an
  explicit structural action.
- One bulk edit is one undo step. Importing pages from another project is one
  undo step.
- Project packages are standard ZIP files with a manifest and per-file SHA-256
  checksums.
- The test suite includes migration tests, seeded fuzzing, project-package
  tests and pointer-level canvas regressions.

These are the parts that make the project-centred model worth keeping.

## 3. The cloud-folder scenario

The failure sequence is short:

1. A project is opened on the home computer. The project lives in memory and
   `store.projectPath` points at the file.
2. The computer is left with the project open.
3. The same file is opened on the work computer and saved.
4. The cloud client syncs the new file.
5. The home computer wakes and saves its older in-memory version.

`saveProject()` in `src/app/projectSession.ts` serialises the project and writes
it without reading the current disk version first. `atomic_write()` protects
against a half-written file, but it does not protect against a different file
that is already on disk. The result is last-writer-wins.

Autosave does not close the gap:

- it lives in local IndexedDB, not on the cloud drive;
- it stores one record under the key `current`, so a second project overwrites
  the previous recovery snapshot;
- it does not record which disk version it is based on;
- opening the project again does not compare the recovery snapshot with the
  file on disk.

This is not only a cloud problem. The same risk exists on network shares, in a
second app window, and after a crash where the recovery snapshot is newer than
the file.

## 4. Comparison with Bluebeam Revu

The comparison should be read as a difference in where the truth lives, not as
a claim that one product is universally safer.

| Area | Bluebeam Revu | GridScalr today | Robustness assessment |
| --- | --- | --- | --- |
| Truth | The PDF is the document; annotations and OCG layers live in it | PDF/TIF are immutable sources; the project is the truth | Deliberate. Correct for takeoff, but the project must be protected like a database |
| Pages | PDF page tree; insert, delete, move, extract | Append-only; deletion is structural and not undoable | Stable, but built on numeric page numbers |
| Layers | PDF optional-content groups, toggleable in compatible readers | Project layers with `measure` or `draw`, page-scoped visibility and locking | Strong for measurement, weaker for interoperability |
| Markups | PDF annotations | Typed project items | Structured and deterministic, not editable in Acrobat/Revu |
| Quantities | Markups List over annotations | First-class derived data | GridScalr is stronger here |
| Concurrency | Studio/sessions and a server model coordinate edits | No conflict detection; last writer wins | **Largest gap** |
| File identity | PDF structure and Studio session history | `project.id` exists, but no revision or saved-file fingerprint | **Missing** |
| Recovery | App recovery plus document-level versioning | One IndexedDB autosave record | **Weak** |
| Page identity | PDF indirect objects | Numeric page index remapped on delete/import | **Weak** |
| Integrity | Tolerant PDF readers | Normalisation can silently drop invalid data | **Weak** |
| Interoperability | High across the PDF ecosystem | High for PDF/CSV/XLSX export, low for editing | Deliberate trade-off |
| Undo | Mixed, depending on the operation | Edits and import are undoable; structural page operations clear history | Documented, but risky |
| File movement | The PDF travels as one file | The project references drawings by path and checksum | Mitigated by relative paths, packages and checksums |

Bluebeam is not automatically more robust. It outsources concurrency to Studio
and relies on the PDF ecosystem, which has its own failure modes: annotations
can be flattened or lost, OCG support varies, and page edits can break links.
GridScalr should copy the concurrency discipline, not the PDF-as-truth model.

## 5. Current-state findings

| ID | Finding | Evidence | Impact | Priority |
| --- | --- | --- | --- | --- |
| F1 | No conditional write before save | `saveProject()` serialises and writes without reading the disk version; `atomic_write()` only makes the replacement atomic | Silent loss of another machine's edits | P0 |
| F2 | One autosave slot for the whole app | `src/state/autosave.ts` uses `RECORD_KEY = "current"` | Opening a second project overwrites the first project's recovery | P0 |
| F3 | No open-elsewhere signal or read-only mode | No lock, heartbeat or session marker exists | The user gets no warning before a conflict | P1 |
| F4 | Backups are claimed but not implemented | `docs/roadmap.md` lists backups under #44; no backup code exists in `src/` or `src-tauri/` | A logical bad save or a mistaken overwrite has no local restore point | P0 |
| F5 | Save mutates relative paths before the write succeeds | `saveProject()` calls `updateRelativeDocumentPaths()` before `writeTextFile()`; `saveProjectCopy()` correctly restores in `finally` | A failed Save As can leave wrong relative links in memory | P1 |
| F6 | No pre-save or post-load validation | `serializeProject()` only calls `JSON.stringify`; `parseProject()` normalises and filters | Invalid or damaged data can be written or silently discarded | P1 |
| F7 | Item invariants are incomplete | `normalizeItem()` accepts `page >= 1` but not `page <= total`; item IDs are not deduplicated | Orphan items and duplicate IDs can break selection, commands and export | P1 |
| F8 | Page identity is numeric everywhere | `MarkupItem.page`, `Layer.homePage`, `Layer.pageState`, `Project.pages`; `deletePageFromProject()` remaps all of them | One missed remap puts a markup on the wrong page | P1 |
| F9 | Import splits a source layer into one layer per page | `prepareProjectImport()` calls `createImportedLayer()` inside the page loop | Imported layer names can duplicate; the intended layer grouping is lost | P2 |
| F10 | Structural operations have no checkpoint | `addDocument()`, `deletePage()`, `duplicatePage()` and `setTemplatePaper()` clear history | A mistaken structural action is recoverable only through the single autosave slot | P1 |
| F11 | Source status is size-only while a project is open | `src/source/sourceStatus.ts` compares existence and byte size | A same-size source change is missed until reopen | P2 |
| F12 | Schema handling is an implicit normaliser, not a migration ladder | `parseProject()` normalises every version through the same path | A migration bug can reinterpret old data without a version-specific test | P2 |

The conflict between `docs/roadmap.md` and the code is recorded here rather than
silently corrected. It should be resolved before a new roadmap entry promises
backups.

## 6. Invariants

These are the rules the implementation must enforce.

| ID | Invariant |
| --- | --- |
| I1 | Every project save is a compare-and-swap against the file version the editor loaded. |
| I2 | A conflict preserves both versions. The default is a conflicted copy, never a silent overwrite. |
| I3 | Every persistent entity has a stable, unique ID. Array indexes and display page numbers are never persistent references. |
| I4 | Page identity is separate from page order. Deleting or importing a page cascades by ID; it does not renumber references. |
| I5 | Project invariants are validated before save and after load. User data is never dropped without a report. |
| I6 | Autosave is scoped to one project and one base file version. It is never restored over a changed disk file without confirmation. |
| I7 | Structural operations write a recovery checkpoint and remain explicit. |
| I8 | Source drawings remain immutable. No new save, export, package or recovery path may write to a source file. |
| I9 | Derived quantities and summaries remain calculated from item data, not stored as a second truth. |

## 7. Target architecture

### 7.1 File identity and conditional writes

Add a runtime file stamp:

```ts
interface ProjectFileStamp {
  sha256: string;
  sizeBytes: number;
  modifiedAt: number;
  /** Optional once schema 24 stores it. */
  revisionId?: string;
}
```

The stamp is captured when a project is opened and after every successful save.
It is not a replacement for the project data; it is the expected disk state.

Save flow:

1. If the project is not dirty and this is not Save As, do nothing.
2. Compute the current stamp of the target file.
3. If the target is missing, offer Save As instead of recreating a deleted file.
4. If the current stamp differs from the expected stamp, open the conflict
   dialog.
5. Otherwise write through a conditional command.
6. Read the file back, hash it and verify the written bytes.
7. Update the expected stamp and mark the project saved.

Conflict dialog options:

- **Save as conflicted copy** (default): write
  `<project> (conflicted copy YYYY-MM-DD HHMM).gridscalr`, leave the disk file
  untouched and keep the local project open.
- **Reload from disk**: discard the local in-memory version after confirmation.
- **Overwrite**: explicit danger action, with the disk version described
  (time, size, revision if known).
- **Cancel**: keep editing without writing.

The write should move into a Rust command such as
`write_text_conditional(path, contents, expected_sha256, protected_paths)`.
The command reads and hashes the current file immediately before the rename.
This narrows the race window; no local API can remove it completely when a cloud
client writes outside the process.

Rolling backups:

- keep two or three previous project files next to the project, or in a local
  app-data backup folder keyed by project ID;
- rotate on each successful save;
- never include backups in packages or recent-file lists;
- add a restore action in File or the project doctor.

Browser fallback:

- the browser fallback has no native file path, so it keeps download-based
  saving; conflict detection applies to the desktop app;
- the fallback must still validate before download and never claim that a
  conditional write happened.

### 7.2 Autosave and recovery

Replace the single `current` record with records keyed by project identity and
instance:

```ts
interface AutosaveRecord {
  projectId: string;
  projectPath: string | null;
  instanceId: string;
  baseFileSha256: string | null;
  baseRevisionId: string | null;
  savedAt: string;
  serialized: string;
}
```

Rules:

- keep the latest record per project, plus one previous record for recovery;
- show all recoverable projects on the welcome screen and in Preferences;
- label a recovery as “based on an older file version” when its base hash does
  not match the current disk file;
- never auto-restore over a changed disk file;
- delete or mark the record after a successful save, depending on whether the
  recovery is still useful;
- keep structural-operation checkpoints in the same store with a clear label,
  for example “Before deleting page 12”.

### 7.3 Open-elsewhere awareness

A sidecar lock is useful as a warning, not as a safety mechanism:

```text
<project>.gridscalr.lock
```

Contents: instance ID, project ID, opened time, last heartbeat, app version and
an optional machine label. Refresh the heartbeat while the project is open and
remove the lock on a clean close.

On open:

- a live lock from another instance offers **Open read-only**, **Take over** or
  **Cancel**;
- a stale lock is shown as information, not a block;
- a read-only session can export and package but cannot save over the project;
- a file watcher may show a non-blocking banner when the project file changes
  outside the app.

Cloud clients and sleeping laptops make locks unreliable. Invariant I1 remains
the real protection.

### 7.4 Stable page identity

Introduce a `PageId` and make the page list explicit:

```ts
type PageId = string;

interface PageRecord {
  id: PageId;
  documentId: string;
  /** 1-based page inside the source document. */
  localPage: number;
  state: PageState;
}

interface MarkupItem {
  pageId: PageId;
  // `page: number` is removed from persisted data
}

interface Layer {
  homePageId?: PageId;
  pageState?: Record<PageId, LayerPageState>;
}
```

`Project.pages` becomes an ordered `PageRecord[]` or a map plus an explicit
order array. Page numbers are derived from the order. UI, reports and exports
keep showing numbers, but persistent references use IDs.

Structural operations:

- **Delete page:** remove the page record, its items and its layer page state.
  No later page is renumbered in stored data.
- **Duplicate page:** create a new `PageId`; copy the source state and items to
  it.
- **Import pages:** create new `PageId`s and map source items to them. The
  destination append order stays the same.
- **Document removal:** remove page records that belong to the document and
  clear dangling `copiedFrom` references.
- **Layer cleanup:** a page deletion must not leave an empty layer pointing at a
  different page. Either remove the layer when it loses its last page, or offer
  an explicit cleanup action.

Revision comparison should match pages by `pageId` first, then by document and
local page. This keeps comparison reliable when pages are inserted or deleted.

Page reordering remains out of scope until a separate ADR. Stable IDs are the
prerequisite that makes it safe later.

### 7.5 Layer and markup binding

Today a markup is already bound to a page by `item.page`, and a layer is bound to
pages by `homePage`, `pageState` and its items. The fragile part is that the
binding is a number that must be remapped by every structural operation.

The recommendation is:

- keep project-level layers, because the Layers panel has an intentional
  “All pages” view and layers can be reused across pages;
- make the page relationship explicit with `pageId`;
- validate that every item's `pageId` exists and that every `pageState` key
  belongs to an existing page;
- validate that an item kind matches its layer kind;
- keep the home page as the place where an empty layer was created;
- add a cleanup action for empty layers left by a page deletion.

Physically nesting layers inside pages (`page.layers[]`) is a separate product
decision. It would:

- remove the “All pages” layer view;
- prevent reusing one layer across pages;
- require new UI for copying layers between pages;
- create duplicate layer names on import.

It is not recommended without evidence that users want page-owned layer stacks.

### 7.6 Integrity validation

Add a shared validator, for example `src/model/integrity.ts`:

```ts
interface ProjectIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  entity?: { kind: string; id?: string };
}

function validateProject(project: Project): ProjectIssue[];
```

Checks:

- at least one document and one page;
- unique document, page, layer, item, asset, category, count-type and line-type
  IDs;
- every item `pageId` exists;
- every layer `homePageId` exists;
- every `pageState` key exists;
- every `categoryId`, `countType`, `lineTypeId` and `assetId` reference exists;
- every count preset references an existing category and count type;
- `activeLayerId` exists and has a valid kind;
- `reportLogoAssetId` references an image asset;
- `excludedPages` are within `pageCount`;
- `copiedFrom` references an existing document and page;
- OCR checksum and source page still match the page;
- asset mime and data prefix match;
- images and text boxes still have valid geometry.

Save runs the validator before serialisation. Errors block the save and open the
project doctor. Warnings are shown and can be accepted. Serialisation is followed
by a parse round-trip before writing. The written file is read back and hashed.

On load, the parser should return a report alongside the project. Invalid items
are counted and described. The user can open the project read-only, save a
repaired copy or export diagnostics. Silent filtering remains only for
deliberately discarded unknown fields, and the report must say what was dropped.

A migration registry with one function per schema version is preferable to a
single normaliser. It makes each migration testable against a real fixture.

### 7.7 Import and structural operations

The merged import module already has the right high-level shape:

- `prepareProjectImport()` builds a complete bundle;
- `commitProjectImport()` applies it in one step;
- the source project is read-only;
- one import is one undo step.

Add:

- a preflight report with page count, item count, categories, count types, line
  types, assets, missing files and checksum warnings;
- provenance on imported pages: source project ID, revision, source page ID,
  import time and app version;
- an explicit layer policy. Today each page gets its own new layer. Decide
  whether to preserve a source layer across imported pages or keep one layer per
  page, then test it;
- a structural checkpoint before page delete, duplicate, add-document and paper
  change;
- a page-delete summary that names the item count, layer count, page scale and
  OCR index that will be removed.

### 7.8 Interoperability, later

These are additive options, not a change to the source of truth:

- export layers as real PDF optional-content groups (OCG); this is a PDF
  low-level spike, not a high-level `pdf-lib` feature;
- export markups as standard PDF annotations for review in other readers;
- make the self-contained `.gridscalr.zip` package the obvious share flow;
- search a project folder for a drawing with the expected SHA-256 before asking
  the user to relink;
- add “Compare with disk version” to the conflict dialog using the existing
  revision comparison engine;
- defer page reordering until after stable page IDs and a separate ADR.

## 8. Schema 24 sketch

Schema 24 is the first schema that should carry stable page identity.

```ts
interface Project {
  schemaVersion: 24;
  /** Optional lineage for future comparison and conflict review. */
  revisionId?: string;
  parentRevisionId?: string;
  savedAt?: string;
  pages: PageRecord[];
  // documents, layers, categories, countTypes, lineTypes, assets, ...
  // unchanged except for the page references above
}
```

Migration from schema 23:

1. Build the page list from `documents` and `excludedPages`, in document order.
2. Assign a new `PageId` to each included page.
3. Map every numeric page in `MarkupItem.page`, `Layer.homePage` and
   `Layer.pageState` to that `PageId`.
4. Move `Project.pages[number]` into the matching `PageRecord.state`.
5. Drop invalid page references into the load report rather than silently
   remapping them.
6. Write schema 24 and keep the existing migration tests for schemas 1–23.

The migration must be deterministic for a given input file and covered by a
fixture for the previous schema.

## 9. Phased plan

| Phase | Priority | Schema | Scope | Exit criteria |
| --- | --- | --- | --- | --- |
| 0 | P0 | none | ADR, this plan, invariants and issue breakdown | The team agrees on the rules before code |
| 1 | P0 | none | Conditional save, conflict dialog, backups, read-back, relative-path fix | A changed disk file cannot be overwritten without an explicit choice |
| 2 | P0/P1 | none | Autosave v2, lock hint, read-only open, file watcher, structural checkpoints | A forgotten machine cannot silently overwrite another machine's work |
| 3 | P1 | 24 | Stable `PageId`, page list, delete/import/duplicate rewrite, migration | No structural page operation can move an item to the wrong page |
| 4 | P1 | none | Integrity validator, project doctor, import preflight and provenance | A damaged or imported file cannot cause silent data loss |
| 5 | P2 | optional | OCG export, annotation export, package/share flow, relink search, page reorder ADR | Interoperability improves without changing the source of truth |
| 6 | P1 | none | Stateful tests, conflict tests, crash tests, migration corpus, CI gate | The invariants are enforced by tests, not only by review |

### Phase 0 — Decision and documentation

- Write ADR 0010: “The project file is the truth; writes are compare-and-swap
  and pages have stable identities.”
- Record the invariants from section 6.
- Resolve the #44 backup claim in the roadmap or the code.
- Create the P0/P1 issues listed in section 14.
- No production code.

### Phase 1 — Safe save

- Add `ProjectFileStamp`.
- Add a conditional write command in Rust.
- Add the conflict dialog.
- Add rolling backups and read-back verification.
- Skip no-op saves.
- Fix `saveProject()` relative-path mutation on failure.
- Add tests that simulate a file change between open and save.

### Phase 2 — Recovery and open-elsewhere

- Add autosave records per project and instance.
- Add base file stamps to autosave.
- Add the recovery chooser.
- Add the sidecar lock and read-only open.
- Add an optional file watcher banner.
- Add structural checkpoints before destructive operations.

### Phase 3 — Stable page identity

- Add `PageId` and `PageRecord`.
- Migrate items, layers, page state and page records.
- Rewrite delete, duplicate and import to use IDs.
- Update comparison to match pages by ID.
- Add schema 23 → 24 migration tests.
- Update the project file documentation.

### Phase 4 — Integrity and project doctor

- Add the validator and the load report.
- Add pre-save validation and post-save round-trip.
- Add the project doctor dialog.
- Add import preflight and provenance.
- Add explicit duplicate-ID repair.

### Phase 5 — Interoperability

- OCG export spike.
- Optional annotation export.
- Package/share flow.
- Relinking search by checksum.
- “Compare with disk version”.
- Page reorder ADR.

### Phase 6 — Test and CI gates

- Stateful and property-based sequences of add/delete/import/undo/redo/save/load.
- Concurrent-save tests with a mocked or temporary file system.
- Crash-during-save tests for the Rust command.
- A migration corpus with one fixture per schema version.
- A CI job that runs the robustness tests with the normal suite.

## 10. Testing strategy

Add tests close to the code they protect:

- `tests/projectSession.test.ts` or `tests/saveConflict.test.ts`: external file
  change between open and save; conflict copy; overwrite; reload; failed write
  restores relative paths.
- `tests/autosave.test.ts`: two projects keep separate recovery records; a
  recovery based on an older file is never auto-restored.
- `tests/documents.test.ts`: delete, duplicate and import preserve page IDs and
  leave no orphan items or layer page state.
- `tests/integrity.test.ts`: duplicate IDs, out-of-range pages, dangling
  categories/counts/line types/assets and dangling `copiedFrom`.
- `tests/projectFile.test.ts`: schema 23 → 24 migration and a round-trip of a
  project with pages, layers, items, OCR and page state.
- `tests/projectImport.test.ts`: provenance, layer policy, preflight counts and
  one-undo-step behaviour.
- Rust tests: conditional write rejects a changed file; a crash between temp
  write and rename leaves a readable previous file.
- Playwright: conflict dialog and recovery chooser in the browser fallback where
  possible; native conflict behaviour stays in the manual checklist.

The stateful test should generate a random but seeded sequence of operations and
assert the invariants after every step. This catches the remap bugs that a
single happy-path test misses.

## 11. Documentation and AGENTS changes

Update in the same change as the behaviour:

- `docs/project-file.md`: stable page IDs, revision metadata, schema 24.
- `docs/user-guide.md`: conflict dialog, conflicted copies, recovery chooser,
  read-only open and backup restore.
- `docs/limitations.md`: current last-writer-wins behaviour before Phase 1, and
  the new conflict behaviour after it.
- `docs/workflows.md`: what to do when a project is open on two machines.
- `docs/shortcuts.md` and the README shortcut table only if a shortcut changes.
- `docs/roadmap.md`: a new data-integrity milestone after agreement; do not
  claim backups before they exist.
- `README.md`: architecture map entries for the new modules.
- `AGENTS.md`: the rules below.

Proposed `AGENTS.md` addition:

> **Data integrity and concurrent editing**
>
> - Every project save is a conditional write against the file version the
>   editor loaded. Never overwrite a file that changed on disk without explicit
>   confirmation.
> - A conflict preserves both versions. The default is Save as conflicted copy,
>   never a silent overwrite.
> - Every persistent entity has a stable, unique ID. Never use array indexes or
>   display page numbers as persistent references.
> - Page identity is independent of page order. Deleting or importing a page
>   must not renumber references; it cascades by page ID.
> - Autosave is scoped to one project identity and one base file version. Never
>   restore an autosave over a changed disk file.
> - Validate project invariants before saving and after loading. Do not silently
>   drop user data.
> - Structural operations write a recovery checkpoint and stay explicit.
> - Tests are required for concurrent save, crash during save, migration from
>   the previous schema, and page delete/import invariants.

Add a robustness check to the pull-request template or the release checklist:

- Does this change write a project file? If yes, is the write conditional?
- Does this change add a persistent reference? If yes, is it a stable ID?
- Does this change delete or import pages? If yes, are the page invariants
  tested?
- Does this change load old project data? If yes, is there a migration test for
  the previous schema?

## 12. Non-goals and rejected alternatives

- **No cloud sync, accounts or collaboration.** The goal is to make local files
  safe when the operating system or a cloud client moves them, not to add a
  service.
- **No PDF-as-truth.** The project remains the source of truth for structured
  quantities.
- **No physical page ownership of layers** without a separate product decision.
  Stable page IDs solve the binding problem without removing shared layers.
- **No automatic project merge in the first phase.** Start with conflicted
  copies and comparison. A three-way merge needs a common base, stable IDs and
  semantic rules.
- **No lock file as the safety mechanism.** Locks are advisory; conditional
  writes are the guarantee.
- **No silent repair.** A damaged project opens with a report and a choice.
- **No page reorder before stable page IDs.** The current append-only rule stays
  until a separate ADR.
- **No OCG or annotation export in the first phase.** Interoperability is
  additive and can follow the integrity work.

## 13. Open questions for discussion

1. Should a conflict default to **Save as conflicted copy** or to **Compare with
   disk version** and then choose?
2. Should the sidecar lock open the project read-only automatically, or only
   warn and let the user choose?
3. Should backups live next to the project or in app data? Next to the project
   is discoverable; app data avoids cluttering shared folders.
4. Should imported pages preserve the source layer grouping, or keep one layer
   per page as today?
5. Should a deleted page remove empty layers that lose their last page, or show
   a cleanup prompt?
6. Should schema 24 store `revisionId` and `parentRevisionId`, or is a file hash
   enough for the first release?
7. When should the 1.0 schema freeze happen relative to Phase 3?
8. Should source drawings be re-hashed before every package/export, or only on
   open and on demand?

## 14. Proposed issue breakdown

Use the existing labels and milestones. These are titles, not issue numbers.

- **P0:** Detect and resolve concurrent project saves.
- **P0:** Add rolling project backups and restore.
- **P0:** Scope autosave per project and base file version.
- **P1:** Add an open-elsewhere lock hint and read-only mode.
- **P1:** Add stable page IDs and migrate the project file to schema 24.
- **P1:** Validate project integrity before save and after load.
- **P1:** Add structural-operation recovery checkpoints.
- **P1:** Add import preflight, provenance and a documented layer policy.
- **P2:** Add automatic relinking by checksum.
- **P2:** Spike PDF optional-content-group export.
- **P2:** Spike optional PDF annotation export.
- **P2:** Write the page-reorder ADR after schema 24.

## 15. Acceptance criteria for the whole plan

- A project edited on two machines never loses either version without an
  explicit user choice.
- A changed disk file cannot be overwritten by a normal Save.
- A recovery snapshot is tied to the project and base version it came from.
- A page deletion or import cannot leave an item pointing at a missing or wrong
  page.
- A damaged project opens with a report, not silent data loss.
- Every schema change has a migration fixture and a test from the previous
  schema.
- The source PDF/TIF is never written by any new path.
- The documentation and `AGENTS.md` describe the actual save and recovery
  behaviour.
