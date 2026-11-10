# Project-file robustness and concurrent editing

**Status:** accepted 2026-11-10. The decisions are recorded in ADR 0010–0012;
implementation has not started.
**Scope:** concurrent edits on local, network and cloud-synced files; save and
recovery integrity; explicit page order and source replacement; source storage
modes; layer and markup binding; import and structural-operation safety.
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

### 1.1 Decisions from the 2026-11-10 discussion

| Question | Decision |
| --- | --- |
| Conflict default | **Save as conflicted copy** is the default. Compare with the disk version is a secondary action. |
| Live lock | Warn and let the user choose, with **Open read-only** as the default. A stale lock must never block. The lock is an advisory lease, not the safety mechanism. |
| Backup location | Automatic rolling backups and structural checkpoints live in app data. Portable backups are explicit or use `.gridscalr.zip`. No automatic `.bak` beside a cloud-synced project. |
| Imported layers | One destination layer per source layer identity, shared across pages through `PageId`. Do not match layers by display name. |
| Revision lineage | A file hash, size and mtime are enough for the first version. No revision DAG, `revisionId` or `parentRevisionId` in schema 24. |
| Append-only | Append-only is a default import behaviour, not a model law. Stable `PageId`s make insert, reorder and source replacement safe. |
| Empty project | A project with zero pages is valid for schema 24 and later. It can be filled by importing pages from PDFs or other projects. |
| Source storage | Support reference, managed copy and package modes. Do not base64-embed ordinary PDFs in `.gridscalr`. |
| 1.0 | 1.0 is a quality gate, not a schedule. Roadmap work is organised by foundation workstreams; feature details live in issues. |

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
- Pages currently append at the end and deleting a page is an explicit
  structural action. This plan keeps append as the default import behaviour but
  replaces append-only as a model rule with an explicit page list (§7.4).
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
| Pages | PDF page tree; insert, delete, move, extract | Append-only today; deletion is structural and not undoable | Stable, but built on numeric page numbers; §7.4 replaces this with an explicit page list |
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
| I10 | A project may have zero pages. Empty projects and zero-page exports are explicit states, not corruption. |
| I11 | Every document declares whether it is a reference, a managed copy or package-only. The mode is visible and never inferred silently. |

## 7. Target architecture

### 7.1 File identity and conditional writes

Add a runtime file stamp:

```ts
interface ProjectFileStamp {
  sha256: string;
  sizeBytes: number;
  modifiedAt: number;
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
  (time, size and file hash if known).
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

A sidecar lease is useful as a warning, not as a safety mechanism:

```text
<project>.gridscalr.lock
```

Contents: instance ID, project ID, opened time, last heartbeat, project hash,
app version and an optional machine label. Refresh the heartbeat every 30
seconds while the project is open and remove the lease on a clean close. Treat a
lease without a heartbeat for five minutes as stale.

On open:

- a live lease from another instance offers **Open read-only** (the default),
  **Take over** or **Cancel**;
- a stale lease is shown as information, not a block;
- a corrupt or unsynchronised lease is ignored;
- **Take over** writes a new lease atomically; the old instance sees a save
  conflict on its next write;
- a read-only session can export, package and **Save a copy**, but cannot save
  over the project;
- a file watcher may show a non-blocking banner when the project file changes
  outside the app;
- never delete a lease owned by another instance automatically. Offer an explicit
  **Clear stale lock** action.

Cloud clients and sleeping laptops make leases unreliable. Invariant I1 remains
the real protection.

### 7.4 Page list and document model

The current model derives pages from the document array and stores page
references as numbers. That is why append-only exists: every insertion or
reorder would invalidate item and layer references. The replacement is an
explicit page list with stable IDs.

#### Stable page records

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

`Project.pages` becomes an ordered `PageRecord[]`. Page numbers are derived from
the array order. UI, reports and exports keep showing numbers, but persistent
references use IDs. Documents remain the source-file records; the page list is
the project's own order.

#### Empty projects

A project with zero pages is valid for schema 24 and later:

- `documents: []`, `pages: []`;
- settings, categories, count types, line types and default layers still exist;
- the welcome screen offers **Blank project** beside the PDF and sheet flows;
- pages can be imported from PDFs or another project at any time;
- exports, reports and the canvas show an empty state instead of failing;
- older schemas still require at least one page, but the new project flow does
  not.

#### Insert, reorder and delete

- **Import pages** appends by default. The import dialog can insert at a chosen
  position.
- **Reorder pages** by drag and drop. The page list changes; every `PageId`,
  item and layer stays attached to its page.
- **Delete page** removes the page record, its items and its layer page state.
  No later page is renumbered in stored data.
- **Duplicate page** creates a new `PageId` and copies the source state and
  items to it.
- **Insert page** adds a `PageRecord` at the chosen index. A page from an
  existing document can be inserted without duplicating the document.
- **Document removal** must not leave page records pointing at a deleted
  document. The user chooses whether to remove those pages or move them to
  another source first.
- **Layer cleanup:** a page deletion must not leave an empty layer pointing at a
  different page. Either remove the layer when it loses its last page, or offer
  an explicit cleanup action.

Append remains the default for import because it gives stable, predictable page
numbers. It is no longer a model law.

#### Replace a source document

A new revision PDF can swap pages, add a page or omit one. The project must keep
the markup attached to the right page without inventing a revision DAG.

Flow:

1. Choose the document and **Replace source…**.
2. Read the new PDF page count, checksum and page sizes.
3. Show a mapping of old page → new page with previews.
4. Default to the same page index; allow manual mapping when pages moved.
5. Keep `PageId`, items and page state for mapped pages.
6. Pages that cannot be mapped stay on the old `DocumentRef` as **superseded**
   until the user reviews them. This preserves items instead of deleting them.
7. Add the new `DocumentRef`, or update the old one when every page is mapped.
8. Warn when page size, calibration or drawing scale changes.

The superseded-document approach avoids a revision tree while still preserving
unmatched pages. Removing superseded pages is an explicit cleanup action.

#### Comparison and migration

Revision comparison matches pages by `PageId` first, then by document and local
page. This keeps comparison reliable when pages are inserted or deleted.

Schema 24 migration builds the page list from the document order and existing
`excludedPages`, assigns page IDs, and maps every numeric item, layer home page
and page-state key. Invalid references are reported, not silently remapped.

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
- one destination layer per source layer identity, shared across imported pages
  through `PageId`; never merge layers by display name without an explicit user
  choice;
- an optional merge choice when the same source project is imported again, or
  when the user explicitly wants to reuse an existing layer;
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
- page reordering, insert and source replacement are part of §7.4 and schema 24,
  not a later interoperability spike.

### 7.9 Source storage modes

A referenced PDF can move or change outside GridScalr. SHA-256 detects the
change, but detection is not protection. The project needs an explicit storage
mode.

| Mode | What is stored | Best for | Risk |
| --- | --- | --- | --- |
| **Reference** | Path plus SHA-256 | Local, stable files | The file can move or change |
| **Managed copy** | A copy inside the project folder, relative path plus SHA-256 | Shared cloud folders, network shares, unstable sources | The project folder grows; the copy can still be edited, but the checksum warns |
| **Package** | `.gridscalr.zip` with its drawings | Transport and archive | Not the live editing file |

Rules:

- Reference is the default for a local file that is unlikely to change.
- If the source is in a known cloud folder or on a network share, the import
  dialog recommends **Copy drawing into project** and explains why.
- A managed copy lives in a sibling folder such as
  `Project.drawings/<safe-name>-<hash8>.pdf` and is referenced relatively.
- `DocumentRef.storage` makes the mode explicit. Keep an optional
  `originalPath`/`originalSha256` for provenance and relinking.
- **Consolidate drawings…** copies every referenced PDF into the project folder
  and rewrites the paths. The originals are untouched.
- **Use managed copy** and **Detach from source** are explicit document actions.
- **Source changed on disk** appears as a banner in reference mode, with
  **Reload**, **Use current**, **Relink** and **Copy into project**.
- A package includes managed copies once; it never duplicates them.
- Do not base64-embed ordinary PDFs in `.gridscalr`. The project file would grow
  into a save, autosave and undo problem. The existing TIF embedded-PDF exception
  stays because it is a derived document format.
- A managed copy protects against the original moving or changing; it does not
  protect against someone editing the copy. The checksum remains authoritative.

### 7.10 Module-first implementation

The foundation phases follow [ADR 0013](../adr/0013-module-first-foundation.md).
The short version:

- each new foundation feature has `index.ts`, pure model, controller, UI and IO
  files as needed;
- other modules import only the feature's `index.ts`;
- new files target 300 lines and must not exceed 400;
- new foundation feature directories use a 400-line file budget;
- new files must not enter the legacy budget exception list;
- `npm run check:modules` enforces the public surface and deep-import rule;
- each phase issue records its module map before production code is written;
- `App.ts` and `CanvasView.ts` stay wiring-only.

The concrete module maps are in the phase issues and in ADR 0013. The main
expected directories are `features/saveIntegrity`, `features/sessionRecovery`,
`features/pageModel`, `features/sourceStorage` and
`features/projectIntegrity`.

## 8. Schema 24 and 25 sketch

Schema 24 carries the explicit page list. It deliberately adds no revision
lineage: the file hash is enough for conflict detection in the first version.

```ts
interface Project {
  schemaVersion: 24;
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
5. Report invalid page references instead of silently remapping them.
6. Write schema 24 and keep the existing migration tests for schemas 1–23.

Schema 25 adds the source storage mode:

```ts
interface DocumentRef {
  storage?: "reference" | "managed";
  /** Original source path when storage is "managed". */
  originalPath?: string | null;
  /** Checksum of the original source at copy time. */
  originalSha256?: string;
}
```

Migration from schema 24 sets `storage: "reference"` for every existing
document. A separate schema keeps each migration small and testable.

Both migrations must be deterministic for a given input file and covered by a
fixture for the previous schema.

## 9. Phased plan

| Phase | Priority | Schema | Scope | Exit criteria |
| --- | --- | --- | --- | --- |
| 0 | P0 | none | ADRs, this plan, invariants and issue breakdown | Complete 2026-11-10: ADRs 0010–0012 accepted and this plan recorded |
| 1 | P0 | none | Conditional save, conflict dialog, backups, read-back, relative-path fix | A changed disk file cannot be overwritten without an explicit choice |
| 2 | P0/P1 | none | Autosave v2, lock lease, read-only open, file watcher, structural checkpoints | A forgotten machine cannot silently overwrite another machine's work |
| 3 | P1 | 24 | Explicit page list, empty projects, insert/reorder/delete, source replacement | No page operation can move an item to the wrong page |
| 4 | P1 | 25 | Reference/managed-copy storage, consolidate, source-changed flow | A shared or cloud source cannot change the working drawing silently |
| 5 | P1 | none | Integrity validator, project doctor, import preflight and provenance | A damaged or imported file cannot cause silent data loss |
| 6 | P2 | optional | OCG export, annotation export, package/share flow, relink search | Interoperability improves without changing the source of truth |
| 7 | P1 | none | Stateful tests, conflict tests, crash tests, migration corpus, CI gate | The invariants are enforced by tests, not only by review |

### Phase 0 — Decision and documentation

Complete 2026-11-10.

- ADR 0010: project-file integrity and concurrent editing.
- ADR 0011: explicit page order and source replacement.
- ADR 0012: source storage modes.
- ADR 0013: module-first foundation work.
- The invariants from section 6 are recorded in `AGENTS.md`.
- The #44 backup claim is surfaced in this plan and in `docs/limitations.md`.
- The phase issues are created as #153–#159.
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

### Phase 3 — Page list and document model

- Add `PageId` and `PageRecord[]` as the canonical page order.
- Migrate items, layers, page state and page records.
- Allow empty projects with zero pages.
- Implement insert, reorder, delete and duplicate by page ID.
- Implement **Replace source…** with page mapping and superseded documents.
- Rewrite import to preserve one layer per source layer identity.
- Update comparison to match pages by ID.
- Add schema 23 → 24 migration tests.
- Update the project file documentation and the user guide.

### Phase 4 — Source storage and managed copies

- Add `DocumentRef.storage` and optional `originalPath`/`originalSha256`.
- Add reference and managed-copy import modes.
- Add **Consolidate drawings…**, **Use managed copy** and **Detach from source**.
- Add the source-changed banner and the reload/relink/copy actions.
- Add schema 24 → 25 migration tests.
- Update packaging so managed copies are included once.

### Phase 5 — Integrity and project doctor

- Add the validator and the load report.
- Add pre-save validation and post-save round-trip.
- Add the project doctor dialog.
- Add import preflight and provenance.
- Add explicit duplicate-ID repair.

### Phase 6 — Interoperability

- OCG export spike.
- Optional annotation export.
- Package/share flow.
- Relinking search by checksum.
- “Compare with disk version”.

### Phase 7 — Test and CI gates

- Stateful and property-based sequences of add/delete/import/reorder/replace/
  undo/redo/save/load.
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
- `tests/documents.test.ts`: delete, duplicate, insert, reorder and import
  preserve page IDs and leave no orphan items or layer page state.
- `tests/documents.test.ts`: empty projects with zero pages save, reload and
  accept imported pages.
- `tests/documents.test.ts`: source replacement keeps mapped page IDs and leaves
  unmatched pages on the superseded document.
- `tests/integrity.test.ts`: duplicate IDs, out-of-range pages, dangling
  categories/counts/line types/assets and dangling `copiedFrom`.
- `tests/projectFile.test.ts`: schema 23 → 24 and 24 → 25 migrations and a
  round-trip of a project with pages, layers, items, OCR and page state.
- `tests/projectImport.test.ts`: provenance, one layer per source layer
  identity, preflight counts and one-undo-step behaviour.
- `tests/sourceStorage.test.ts`: reference and managed-copy modes, consolidate,
  source-changed flow and package inclusion.
- Rust tests: conditional write rejects a changed file; a crash between temp
  write and rename leaves a readable previous file.
- Playwright: conflict dialog and recovery chooser in the browser fallback where
  possible; native conflict behaviour stays in the manual checklist.

The stateful test should generate a random but seeded sequence of operations and
assert the invariants after every step. This catches the remap bugs that a
single happy-path test misses.

## 11. Documentation and AGENTS changes

Update in the same change as the behaviour:

- `docs/project-file.md`: stable page IDs, explicit page order, empty projects,
  source storage modes and schemas 24–25.
- `docs/user-guide.md`: conflict dialog, conflicted copies, recovery chooser,
  read-only open, backup restore, page reorder/insert/replace and managed copies.
- `docs/limitations.md`: current last-writer-wins behaviour before Phase 1, the
  new conflict behaviour after it, and the current append-only limitation until
  Phase 3.
- `docs/workflows.md`: what to do when a project is open on two machines, and
  when a shared drawing changes.
- `docs/shortcuts.md` and the README shortcut table only if a shortcut changes.
- `docs/roadmap.md`: foundation workstreams and the 1.0 quality gate; no
  version-numbered schedule.
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
> - Page identity is independent of page order. Imports append by default, but
>   insert, reorder and source replacement are explicit, tested operations that
>   cascade by page ID.
> - A project may have zero pages. Empty is a valid state, not a corrupt file.
> - Autosave is scoped to one project identity and one base file version. Never
>   restore an autosave over a changed disk file.
> - Validate project invariants before saving and after loading. Do not silently
>   drop user data.
> - Structural operations write a recovery checkpoint and stay explicit.
> - Source storage is explicit: reference, managed copy or package. Never
>   base64-embed ordinary PDFs in the project JSON.
> - Tests are required for concurrent save, crash during save, migration from
>   the previous schema, and page delete/import/reorder/replace invariants.

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
- **No page reorder before the explicit page list exists.** It is part of Phase
  3, not a later spike.
- **No automatic `.bak` beside a cloud-synced project.** Automatic backups live
  in app data; portable copies are explicit.
- **No OCG or annotation export in the first phase.** Interoperability is
  additive and can follow the integrity work.

## 13. Remaining questions

These are the questions that still need a decision. The 2026-11-10 decisions are
recorded in §1.1.

1. Should a deleted page remove empty layers that lose their last page, or show
   a cleanup prompt?
2. Should cross-document page reorder be allowed in the first UI, or only
   reorder inside a document block until the interaction is proven?
3. How long should unmatched superseded pages remain in a project after source
   replacement before the user is prompted to archive or remove them?
4. Should source drawings be re-hashed before every package/export, or only on
   open and on demand?
5. Should schema 25's managed-copy folder be user-selectable, or always a
   sibling folder named after the project?

## 14. Issue breakdown

Created 2026-11-10 as sub-issues of the roadmap epic #59:

- [#153](https://github.com/MajorJohnDoe/gridscalr/issues/153) — Phase 1: harden project saves against concurrent edits.
- [#154](https://github.com/MajorJohnDoe/gridscalr/issues/154) — Phase 2: scope autosave and add advisory project leases.
- [#155](https://github.com/MajorJohnDoe/gridscalr/issues/155) — Phase 3: explicit page list and stable page IDs (schema 24).
- [#156](https://github.com/MajorJohnDoe/gridscalr/issues/156) — Phase 4: managed source copies and relinking (schema 25).
- [#157](https://github.com/MajorJohnDoe/gridscalr/issues/157) — Phase 5: project integrity validation and project doctor.
- [#158](https://github.com/MajorJohnDoe/gridscalr/issues/158) — Phase 6: optional OCG and annotation export.
- [#159](https://github.com/MajorJohnDoe/gridscalr/issues/159) — Phase 7: robustness, concurrency and migration gates.

Each issue carries the phase scope, non-goals and acceptance criteria. Split a
phase into smaller issues only when parallel work needs it; keep the phase issue
as the acceptance gate.

## 15. Acceptance criteria for the whole plan

- A project edited on two machines never loses either version without an
  explicit user choice.
- A changed disk file cannot be overwritten by a normal Save.
- A recovery snapshot is tied to the project and base version it came from.
- A project can start with zero pages and be filled by importing pages later.
- Inserting, deleting, reordering or replacing a page cannot leave an item
  pointing at a missing or wrong page.
- A shared or cloud source can be protected by a managed copy, and a changed
  reference is reported with an explicit choice.
- A damaged project opens with a report, not silent data loss.
- Every schema change has a migration fixture and a test from the previous
  schema.
- The source PDF/TIF is never written by any new path.
- The documentation and `AGENTS.md` describe the actual save, recovery, page and
  source-storage behaviour.
