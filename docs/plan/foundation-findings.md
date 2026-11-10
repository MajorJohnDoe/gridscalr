# Foundation findings

**Purpose:** a living log for larger problems discovered while implementing the
foundation phases. Fix in-scope issues immediately; use this file for risks that
are out of scope, need a product decision, or should become a separate issue.
The pre-implementation findings are in [`robustness.md`](robustness.md) §5.

**Status:** living log, started 2026-11-10.
**Related:** [`robustness.md`](robustness.md), ADR
[0010](../adr/0010-project-file-integrity.md),
[0011](../adr/0011-page-list-and-source-replacement.md),
[0012](../adr/0012-source-storage-modes.md),
[0013](../adr/0013-module-first-foundation.md).

If the code and this log disagree, stop and surface the conflict rather than
silently choosing one.

## How to use

1. Fix a problem immediately when it is small, in scope and safe to fix now.
2. Record it here when it is larger, out of scope, risky or needs a decision.
3. Give it an ID, evidence, impact and a concrete next step.
4. Triage it at the end of the phase. Convert accepted work into a GitHub issue
   and update the status with the issue number.
5. Review the log at every phase exit and before a release.

Do not use this file as a substitute for an issue when the work is already
scheduled. Do not record secrets, customer file paths, personal data or raw
project contents.

## Severity

| Level | Meaning | Action |
| --- | --- | --- |
| **P0** | Data loss, security, corruption or a broken invariant | Stop and fix now |
| **P1** | Likely user-visible bug or architecture risk | Fix in the current phase or open an issue immediately |
| **P2** | Technical debt or future risk | Log, triage and schedule separately |
| **P3** | Observation or improvement idea | Review when convenient |

## Status

| Status | Meaning |
| --- | --- |
| `open` | Recorded, not triaged |
| `triaged #N` | Converted into a GitHub issue |
| `deferred` | Deliberately not scheduled yet |
| `accepted` | Accepted as a known limitation or design choice |
| `fixed` | Resolved; keep the entry as history |

## Open findings

### F-001 — Model imports a feature module

- **Date:** 2026-11-10
- **Phase:** pre-foundation observation
- **Severity:** P2
- **Area:** architecture
- **Status:** deferred
- **Evidence:** `src/model/layers.ts` imports `features/countTypes/model`.
- **Problem:** A lower-layer model file depends on a feature module, the reverse
  of the dependency direction in ADR 0008. Shared defaults currently live inside
  the count-types feature.
- **Impact:** It makes the model layer harder to test and risks a cycle when a
  feature imports model types. It is also an example new foundation code must not
  copy.
- **Next step:** Decide whether the default count types belong in `src/model` or
  whether the feature must provide them through an explicit injection point.
  Handle this as a separate refactor, not inside Phase 1.
- **Resolution:** Phase 7 removed the unused helper from `paths.ts` and its
  re-export in `io/projectFile/index.ts`; no caller remained.
- **Related:** ADR [0008](../adr/0008-integration-module-boundaries.md), ADR
  [0013](../adr/0013-module-first-foundation.md), issue
  [#157](https://github.com/MajorJohnDoe/gridscalr/issues/157).

### F-002 — Rust files are outside the line-budget check

- **Date:** 2026-11-10
- **Phase:** pre-foundation observation
- **Severity:** P2
- **Area:** tooling / Rust
- **Status:** deferred
- **Evidence:** `src-tauri/src/package.rs` is about 2,150 lines and
  `src-tauri/src/commands.rs` about 540; `check:file-budgets` scans only `src/`.
- **Problem:** The frontend has a blocking file budget, but large Rust modules
  have no equivalent guard. New conditional-write and source-storage commands
  could grow the same files.
- **Impact:** Rust modules can become the next set of large, hard-to-review
  files even while the frontend stays within budget.
- **Next step:** Add a small Rust source budget check or extend the existing
  budget script to `src-tauri/src`, with an explicit legacy exception list.
  Until then, keep new Rust commands in separate modules.
- **Related:** ADR [0013](../adr/0013-module-first-foundation.md).

### F-003 — Unused page remap helper

- **Date:** 2026-11-10
- **Phase:** pre-foundation observation
- **Severity:** P3
- **Area:** page model
- **Status:** fixed
- **Evidence:** `remapPageItems()` is exported from `src/io/projectFile/paths.ts`
  but has no call site in `src/`.
- **Problem:** It looks like a general page-remap helper, but it only filters
  items beyond the page count. Leaving it in place suggests a second, incomplete
  remap path beside `deletePageFromProject()`.
- **Impact:** Low today; it can confuse the Phase 3 migration and future page
  operations.
- **Next step:** Remove it when Phase 3 replaces numeric remapping, or document
  why it must stay. Confirm with a search before deleting.
- **Related:** issue [#155](https://github.com/MajorJohnDoe/gridscalr/issues/155).

### F-005 — Restored backups cannot resolve relative drawing links

- **Date:** 2026-11-10
- **Phase:** 1 — safe save
- **Severity:** P2
- **Area:** backup / document loading
- **Status:** deferred
- **Evidence:** `restoreProjectBackup()` calls `loadProjectData(project, null,
  true)`. With a null project path, `documentFlows.ts` cannot resolve
  `relativePath`, so it relies on each document's stored absolute path.
- **Problem:** A backup stays usable only while the original drawing paths still
  exist. If the project folder and drawings moved together, a restored backup
  asks the user to relink even though the backup's relative links were correct
  for the original location.
- **Impact:** Restore is reliable for local projects whose drawings stay in
  place; it is weaker after a folder move or on another computer.
- **Next step:** Separate the document-resolution base path from the project's
  save path, so an unsaved copy can resolve relative links without becoming
  bound to the original file.
- **Related:** ADR [0010](../adr/0010-project-file-integrity.md), robustness
  §7.2.

### F-006 — Backup history is keyed only by project ID

- **Date:** 2026-11-10
- **Phase:** 1 — safe save
- **Severity:** P3
- **Area:** backup
- **Status:** accepted
- **Evidence:** `project_write.rs` stores backups under
  `backups/<safe-project-id>/`, and restore lists only the open project's ID.
- **Problem:** A duplicated project file keeps the same project ID and shares
  the backup history. A project whose ID was repaired, or a new unsaved project
  after a restart, has no discoverable list. A backup that should travel with a
  project is invisible outside the original computer.
- **Impact:** Low today; restore remains a local convenience, and **Save a
  copy…** / **Package project…** are the portable paths.
- **Next step:** Decide whether backups need a small manifest with project name,
  path and ID, or whether the project ID alone is enough for the 1.0 scope.
- **Related:** ADR [0010](../adr/0010-project-file-integrity.md), robustness
  §7.2.

### F-007 — Read-only mode blocks saving, not editing

- **Date:** 2026-11-10
- **Phase:** 2 — recovery and open-elsewhere
- **Severity:** P2
- **Area:** recovery / read-only session
- **Status:** accepted
- **Evidence:** `ProjectSession.saveProject()` refuses a normal save when
  `store.readOnly` is set, but the store remains editable and canvas tools stay
  active. The read-only banner points to **Save a copy…**.
- **Problem:** The label says read-only, but the in-memory project can still be
  changed. A user may expect that taking over is required for any edit. The
  refusal is safe for the disk file, but the interaction is ambiguous.
- **Impact:** No silent overwrite is possible. Local edits in a read-only
  session survive only through **Save a copy…**, which is easy to miss.
- **Next step:** Decide whether a read-only session should also disable
  mutations and tools, or be named **View only** with the copy flow made
  explicit. Do not silently enable Save.
- **Related:** robustness §7.3, issue
  [#154](https://github.com/MajorJohnDoe/gridscalr/issues/154).

### F-008 — Recovery retention is count-based, not size-based

- **Date:** 2026-11-10
- **Phase:** 2 — recovery and open-elsewhere
- **Severity:** P2
- **Area:** recovery storage
- **Status:** deferred
- **Evidence:** `AUTOSAVE_RECORDS_PER_PROJECT = 2` and
  `CHECKPOINTS_PER_PROJECT = 10` in `features/sessionRecovery/record.ts`. Each
  record stores a serialized project string.
- **Problem:** A large project keeps two full autosaves and up to ten full
  checkpoints without a byte budget. On a quota-limited origin this can exhaust
  storage and turn autosave off exactly when the project is largest.
- **Impact:** The status bar warns on quota failure, and saving to a file still
  works, but recovery may stop earlier than expected.
- **Next step:** Add a byte budget or age-based pruning for checkpoints, and
  report recovery storage size in Preferences or diagnostics.
- **Related:** robustness §7.2, `docs/limitations.md`.

### F-009 — Lease instance identity is session-scoped and coarse

- **Date:** 2026-11-10
- **Phase:** 2 — recovery and open-elsewhere
- **Severity:** P3
- **Area:** lease
- **Status:** accepted
- **Evidence:** `features/sessionRecovery/instance.ts` stores the instance ID in
  `sessionStorage` and derives the host label from the user-agent family only.
- **Problem:** A window opened with `window.open` can inherit sessionStorage and
  therefore the same instance ID. The host label cannot distinguish two
  computers of the same operating system. Neither is used as identity for
  access control; the lease only warns.
- **Impact:** In a rare duplicate-instance case the app may treat another live
  session as its own. The conditional write still prevents silent overwrite.
- **Next step:** Add a per-window random suffix and, if useful, an optional
  user-set non-personal machine label. Keep the lease advisory.
- **Related:** ADR [0010](../adr/0010-project-file-integrity.md), robustness
  §7.3.

### F-010 — Metadata watcher can miss a same-size, same-mtime change

- **Date:** 2026-11-10
- **Phase:** 2 — recovery and open-elsewhere
- **Severity:** P3
- **Area:** open-elsewhere watcher
- **Status:** accepted
- **Evidence:** `features/sessionRecovery/watch.ts` checks size and mtime first,
  then hashes only when either changed.
- **Problem:** A tool that replaces the file and preserves both size and mtime
  is not noticed by the banner. The conditional save still detects the hash
  mismatch on the next save.
- **Impact:** Only the non-blocking banner is affected; no data is overwritten.
- **Next step:** Leave as designed unless banner accuracy becomes important, or
  add an occasional full hash while the window is idle.
- **Related:** robustness §7.3, ADR
  [0010](../adr/0010-project-file-integrity.md).

### F-014 — Managed drawings folder is fixed, not user-selectable

- **Date:** 2026-11-10
- **Phase:** 4 — source storage
- **Severity:** P2
- **Area:** source storage
- **Status:** accepted
- **Evidence:** `src-tauri/src/source_copy.rs` always derives
  `<project stem>.drawings` next to the project file. ADR 0012 says “a sibling
  folder such as”; robustness §13 open question 5 asked whether the folder should
  be selectable.
- **Problem:** A team cannot choose a shared drawings folder, and renaming the
  project file leaves an older drawings folder name. Relative links keep working,
  but a second consolidation creates a new folder.
- **Impact:** Self-contained projects work as designed; storage layout is not
  configurable.
- **Next step:** Decide whether a project-level drawings-folder preference is
  worth a schema field and a migration, or keep the fixed sibling folder and
  document it as a design choice.
- **Related:** ADR [0012](../adr/0012-source-storage-modes.md), robustness
  §7.9 and §13.

### F-015 — Cloud/network detection is a path-segment heuristic

- **Date:** 2026-11-10
- **Phase:** 4 — source storage
- **Severity:** P3
- **Area:** import recommendation
- **Status:** accepted
- **Evidence:** `src/features/sourceStorage/mode.ts` matches UNC prefixes and a
  short list of cloud-client folder names.
- **Problem:** A renamed client folder is not recognised, and an unrelated folder
  called `Box` or `Sync` could be flagged. The recommendation can therefore be
  absent or unnecessary.
- **Impact:** Only the non-blocking recommendation is affected. Reference stays
  valid and **Use managed copy** is always available.
- **Next step:** Leave as accepted unless users report missed cloud clients; keep
  the list in one module and document it in `docs/limitations.md`.
- **Related:** ADR [0012](../adr/0012-source-storage-modes.md).

### F-016 — Same-size source changes can be missed between status polls

- **Date:** 2026-11-10
- **Phase:** 4 — source storage
- **Severity:** P3
- **Area:** source status
- **Status:** accepted
- **Evidence:** `src/source/sourceStatus.ts` caches a hash by path, byte size and
  stored checksum. A replacement that preserves the byte size between polls
  reuses the cached hash until the app restarts or the document reloads.
- **Problem:** The banner can lag behind a same-size replacement. The next open
  and any explicit Reload still perform a full checksum check.
- **Impact:** No data loss; the working drawing stays on the old bytes until the
  user reloads. This is the same class as F-010 for the project file.
- **Next step:** Add an occasional forced hash while the window is idle, or
  accept it as the documented polling trade-off.
- **Related:** F-010, robustness §7.9.

### F-017 — Managed copies are not garbage-collected

- **Date:** 2026-11-10
- **Phase:** 4 — source storage
- **Severity:** P2
- **Area:** source storage
- **Status:** deferred
- **Evidence:** `detachManagedCopy()` and page/document removal change the
  project only. `source_copy.rs` never deletes a drawing.
- **Problem:** Detaching, deleting a page or replacing a source leaves the managed
  copy on disk. Over time the drawings folder can contain files no document
  references.
- **Impact:** No data loss and no project corruption; only disk usage grows. A
  package includes only referenced documents, so unreferenced copies do not
  travel.
- **Next step:** Add an explicit **Remove unused drawings** action that lists
  unreferenced files and moves them to the trash only after confirmation. Never
  delete a file automatically.
- **Related:** robustness §7.9, `docs/limitations.md`.

### F-018 — Consolidation failure can leave unreferenced copies

- **Date:** 2026-11-10
- **Phase:** 4 — source storage
- **Severity:** P3
- **Area:** source storage
- **Status:** accepted
- **Evidence:** `copyActions.ts` copies each drawing before it mutates the
  project. If a later copy fails, earlier copied files remain on disk while the
  project is unchanged.
- **Problem:** A failed consolidation can leave stray files beside the project.
- **Impact:** The project and every original stay valid. The user can delete the
  stray files or run consolidation again; the content-hash name makes the second
  run reuse an identical copy.
- **Next step:** Optionally track partial copies in the failure dialog. Do not
  delete files automatically.
- **Related:** F-017.

### F-019 — The validator proves internal references, not external truth

- **Date:** 2026-11-10
- **Phase:** 5 — integrity and project doctor
- **Severity:** P2
- **Area:** project integrity
- **Status:** accepted
- **Evidence:** `src/model/integrity.ts` checks IDs, references, page ranges, OCR
  checksums against stored data, asset MIME/data and geometry. It does not read
  source files, managed-copy folders or package contents.
- **Problem:** A structurally valid project can still point at a missing,
  replaced or wrong source PDF. The doctor cannot prove that a drawing is the
  right revision or that quantities are commercially correct.
- **Impact:** The save is safe against internal data loss, but external source
  truth still depends on the source-status banner, checksum checks on open and
  the user's review.
- **Next step:** Consider a source-availability section in the doctor that uses
  the existing source-status checks without making file existence a save error.
- **Related:** `docs/limitations.md`, robustness §7.6 and §7.9.

### F-020 — Duplicate-ID repair keeps the first occurrence

- **Date:** 2026-11-10
- **Phase:** 5 — integrity and project doctor
- **Severity:** P2
- **Area:** project integrity / repairs
- **Status:** accepted
- **Evidence:** `src/features/projectIntegrity/repair.ts` renames later
  duplicates and leaves the first ID in place. References that used the
  duplicated ID cannot identify which occurrence they meant.
- **Problem:** Items and page state that logically belonged to the renamed
  duplicate stay attached to the first occurrence. The repair preserves every
  entity but can associate references with the wrong page, layer or category.
- **Impact:** No data is deleted, but a repaired copy may need a manual review of
  affected pages and markups.
- **Next step:** If a future import or sync path can produce duplicate IDs with
  distinguishable references, add a mapping-aware repair with a review step.
  Do not guess from array order without evidence.
- **Related:** `docs/limitations.md`, `tests/projectDoctor.test.ts`.

### F-021 — Import provenance is stored but not shown in the interface

- **Date:** 2026-11-10
- **Phase:** 5 — integrity and project doctor
- **Severity:** P2
- **Area:** import provenance
- **Status:** deferred
- **Evidence:** `PageRecord.provenance` is written by
  `prepareProjectImport()` and documented in `docs/project-file.md`, but no panel
  or report displays it.
- **Problem:** A user cannot see which source project revision a page came from
  without inspecting the JSON. The data is useful for support and later merge
  decisions but currently invisible.
- **Impact:** Provenance is still preserved and validated; only its presentation
  is missing.
- **Next step:** Add a read-only source line to Properties or the Markups detail
  for imported pages, and include it in diagnostics only when it contains no
  paths or personal data.
- **Related:** robustness §7.7, schema 25 optional fields.

### F-022 — Import revision hash is computed from decoded text

- **Date:** 2026-11-10
- **Phase:** 5 — integrity and project doctor
- **Severity:** P3
- **Area:** import provenance
- **Status:** deferred
- **Evidence:** `sourceProvenance()` in `src/app/projectImportFlows.ts` hashes the
  UTF-8 encoding of the text returned by `pickProject()`. Size and mtime come
  from the file metadata when Tauri provides it.
- **Problem:** A BOM, newline normalization or a different read path could make
  the provenance hash differ from a raw file hash computed elsewhere. It is still
  deterministic for the same decoded content.
- **Impact:** Provenance remains a useful revision identity inside GridScalr, but
  it is not a byte-for-byte file hash for external verification.
- **Next step:** Add a raw-byte file hash to `PickedProject` if provenance needs
  to match package or backup checksums exactly.
- **Related:** F-021, robustness §7.7.

### F-023 — OCG groups cannot express page-scoped layer visibility

- **Date:** 2026-11-10
- **Phase:** 6 — interoperability
- **Severity:** P2
- **Area:** PDF export / OCG
- **Status:** deferred
- **Evidence:** `src/pdf/export/ocg.ts` creates one OCG per exported visible
  layer. Marked content is written only on pages where the layer is visible, but
  the reader toggles the group for the whole document.
- **Problem:** A layer that is visible on one page and hidden on another cannot
  be represented faithfully. Turning the group off hides the layer on every
  exported page where it was visible.
- **Impact:** The flattened default is unchanged and hidden content never
  exports. Only the optional reader-side toggle is coarser than the canvas rule.
- **Next step:** Decide whether per-page OCGs (`Layer — Page 3`) or one group
  per layer with per-page marked content and a documented trade-off is the right
  long-term model. Keep hidden layers excluded either way.
- **Related:** robustness §7.8, `docs/limitations.md`.

### F-024 — Review annotations have approximate geometry and reader-dependent appearance

- **Date:** 2026-11-10
- **Phase:** 6 — interoperability
- **Severity:** P2
- **Area:** PDF export / annotations
- **Status:** accepted
- **Evidence:** `src/pdf/export/annotations.ts` writes `Square`, `Circle`, `Line`,
  `PolyLine`, `Polygon` and `Text` dictionaries with no appearance stream.
- **Problem:** A reader draws its own appearance for these dictionaries. Item
  labels, leaders and measurement values are not reproduced, and a rotated or
  complex item is represented by its bounding box or vertex list. The
  annotations are not a project and cannot be imported back.
- **Impact:** They are useful for review, filtering and comments in another
  reader but must not be presented as an editable or measurement-exact output.
- **Next step:** Leave as the documented review artifact. If appearance fidelity
  becomes a requirement, add generated appearance streams behind a separate
  decision and keep the flattened page unchanged.
- **Related:** `docs/limitations.md`, robustness §7.8.

### F-025 — Conflict comparison is heuristic and project-data only

- **Date:** 2026-11-10
- **Phase:** 6 — interoperability
- **Severity:** P2
- **Area:** save integrity / compare
- **Status:** accepted
- **Evidence:** `buildConflictComparison()` calls `compareRevisions()`, which
  matches items by id, then geometry, then the nearest same-kind item inside a
  12 pt move tolerance. It never reads source drawing bytes.
- **Problem:** A heavily reworked item can appear as removed plus added rather
  than changed. A source PDF that changed outside GridScalr is not part of the
  conflict comparison, because the project stores the source checksum
  separately.
- **Impact:** The summary is read-only and the safe default still preserves both
  versions, but the diff is not a formal three-way merge base.
- **Next step:** Keep comparison read-only. A future merge would need a common
  base and stable semantic IDs, as recorded in robustness §12.
- **Related:** F-004, ADR [0010](../adr/0010-project-file-integrity.md).

### F-026 — Share package has no operating-system share sheet

- **Date:** 2026-11-10
- **Phase:** 6 — interoperability
- **Severity:** P3
- **Area:** package / share flow
- **Status:** accepted
- **Evidence:** **File → Share project package…** opens the normal save dialog
  and writes a local `.gridscalr.zip`. There is no email, upload or OS share
  integration.
- **Problem:** The action is the obvious in-app share path but does not hand the
  file to another application automatically.
- **Impact:** The user still chooses where the package is written and sends it
  through their own channel. This keeps the app local-first with no network
  dependency.
- **Next step:** Add an OS share integration only with an explicit product
  decision; it must not introduce a network dependency or bypass the source
  write guard.
- **Related:** ADR [0002](../adr/0002-project-package.md), robustness §7.8.

## Triaged or deferred

### Phase 7 triage

Triaged at the final foundation phase exit (2026-11-10). `fixed` means the
Phase 7 change closed it; `deferred` means it is recorded but not scheduled for
the 1.0 quality gate; `accepted` means it is a documented design trade-off or
known limitation. No deferred entry silently disappears, and none needs a new
issue while the foundation epic [#59](https://github.com/MajorJohnDoe/gridscalr/issues/59)
remains the scheduling home.

| Finding | Decision | Rationale |
| --- | --- | --- |
| F-001 | deferred | Moving default count types out of the feature module is a separate model refactor; the current direction is documented and not a data-integrity risk. |
| F-002 | deferred | New Rust commands already live in separate modules; a Rust line-budget gate is tooling work for after the foundation freeze. |
| F-003 | fixed | The unused `remapPageItems()` helper was removed in Phase 7; no production or test caller existed. |
| F-005 | deferred | Restoring a backup after a folder move is a portability improvement; **Save a copy…** and packages are the portable paths today. |
| F-006 | accepted | Backups are a local convenience keyed by project ID, not a portable archive; that is documented in `docs/limitations.md`. |
| F-007 | accepted | Read-only blocks disk writes while keeping inspection and export available; **Save a copy…** is the explicit output path. |
| F-008 | deferred | A byte budget needs a quota and pruning design; count-based retention is documented and warns when storage fails. |
| F-009 | accepted | The lease is advisory by decision; the conditional write is the actual protection. |
| F-010 | accepted | The metadata watcher is a banner optimisation; the conditional save still detects the hash change at write time. |
| F-011 | deferred | Template fields remain document-owned by the Phase 3 decision; moving them into page state is a later schema change. |
| F-012 | deferred | Manual renderer resynchronisation is covered by the structural paths; deriving it from the store is a follow-up refactor. |
| F-013 | deferred | TIF source replacement waits for the derived-PDF lifetime and checksum rules; the manual path is documented. |
| F-014 | accepted | The fixed sibling `<project>.drawings/` folder is a documented storage choice and keeps packages simple. |
| F-015 | accepted | Cloud/network detection only recommends a managed copy; it never blocks or rewrites a reference. |
| F-016 | accepted | Same-size source polling is a documented trade-off; open and explicit reload still hash the file. |
| F-017 | deferred | Garbage collection needs an explicit review-and-confirm action; automatic deletion is intentionally forbidden. |
| F-018 | accepted | A failed consolidation leaves only unreferenced copies; the project and every original remain valid and a retry reuses the content hash. |
| F-019 | accepted | The validator proves internal references; external source truth stays with the source-status checks and user review. |
| F-020 | accepted | Duplicate-ID repair cannot attribute ambiguous references; keeping the first occurrence is the documented safe choice. |
| F-021 | deferred | Provenance is preserved and validated; showing it in Properties or Markups is a presentation change, not an integrity gap. |
| F-022 | deferred | A raw-byte hash needs a picker API change; the current provenance hash is deterministic for decoded content. |
| F-023 | deferred | Per-page OCG design is an interoperability trade-off; hidden content is still excluded and the flattened default is unchanged. |
| F-024 | accepted | Review annotations are deliberately approximate and reader-dependent; they are not project data. |
| F-025 | accepted | Conflict comparison is read-only and heuristic; a merge would need a common base and semantic IDs. |
| F-026 | accepted | The share flow writes a local package through the save dialog; no OS share sheet or network dependency is planned. |
| F-027 | fixed | Source replacement now clears undo/redo at the structural boundary so an older snapshot cannot restore a superseded source reference. |


### F-011 — Template sheet fields still belong to a document, not a page

- **Date:** 2026-11-10
- **Phase:** 3 — page list and document model
- **Severity:** P2
- **Area:** template sheets / page identity
- **Status:** deferred
- **Evidence:** `DocumentRef.template.fields` stores title-block values. Page
  duplication and insertion clone the template document in
  `features/pageModel/pageList.ts` so the copies do not share field objects.
- **Problem:** A template sheet is one document containing one page. Stable page
  IDs remove the need for that coupling for PDF pages, but sheet fields remain
  document-owned. A future page-owned sheet state would simplify duplication and
  remove one document per sheet.
- **Impact:** Duplicate/insert works correctly, but the project grows one
  `DocumentRef` per duplicated template sheet.
- **Next step:** Decide whether sheet fields should move into `PageRecord.state`
  in a later schema, with a migration from template documents.
- **Related:** schema 23 template sheets, ADR
  [0011](../adr/0011-page-list-and-source-replacement.md).

### F-012 — Renderer page order is synchronized manually

- **Date:** 2026-11-10
- **Phase:** 3 — page list and document model
- **Severity:** P2
- **Area:** canvas / renderer
- **Status:** deferred
- **Evidence:** `PdfRenderer.setPageOrder()` must be called after insert,
  reorder, delete, import and source replacement. `App.afterStructuralPageChange`
  centralizes most paths; `pageFlows` and import flows call it separately.
- **Problem:** A future structural operation that forgets to resync the renderer
  will render the previous page order while the project data is correct.
- **Impact:** No data loss; the visible page can be stale until the next reload.
- **Next step:** Derive the renderer order from the store subscription in one
  place, or add a debug invariant that compares the renderer order with
  `documentPageOrder(project)` after every structural change.
- **Related:** ADR [0011](../adr/0011-page-list-and-source-replacement.md),
  §7.4.

### F-013 — Replace source supports PDF documents only

- **Date:** 2026-11-10
- **Phase:** 3 — page list and document model
- **Severity:** P3
- **Area:** source replacement
- **Status:** deferred
- **Evidence:** `app/replacementFlows.ts` returns the localized **PDF only**
  warning for TIF and template documents.
- **Problem:** A reissued scan cannot be mapped in place. The user must add the
  new TIF as a document and delete the old pages explicitly.
- **Impact:** No data loss; the workflow is manual for scans.
- **Next step:** Add TIF replacement once the derived-PDF lifetime and checksum
  rules are covered, or document the manual path in the user guide.
- **Related:** ADR [0011](../adr/0011-page-list-and-source-replacement.md),
  schema 25 source storage.

No entries yet.

## Fixed

### F-004 — Conflict comparison is metadata-only

- **Date:** 2026-11-10
- **Phase:** 1 — safe save
- **Severity:** P2
- **Area:** save integrity / compare
- **Status:** fixed
- **Evidence:** The Phase 1 dialog showed only the local and disk page and item
  counts, size, time and hash. It did not open the revision comparison engine.
- **Problem:** **Compare with disk version** answers “which file is newer and
  how large is it”, not “which markups differ”. The visual comparison from a
  conflict dialog is listed in robustness §7.8 and belongs to Phase 6.
- **Impact:** The safe default still preserves both versions, but the user must
  save the conflicted copy and open a revision comparison to see item changes.
- **Resolution:** Phase 6 reads the disk project through the save-integrity
  port and runs `compareRevisions()` on the local and disk projects. The
  conflict dialog shows a read-only summary. The metadata fallback remains for
  an unreadable disk file.
- **Related:** robustness §7.8, Phase 6 interoperability.

### F-027 — Source replacement did not clear undo history

- **Date:** 2026-11-10
- **Phase:** 7 — robustness gates
- **Severity:** P2
- **Area:** page model / source replacement
- **Status:** fixed
- **Evidence:** `src/app/replacementFlows.ts` recorded a structural checkpoint
  and applied `applySourceReplacement()` but left the existing undo and redo
  stacks in `state/store.ts`.
- **Problem:** A snapshot taken before the replacement could still be undone
  after the document reference changed. The renderer was resynchronised, but an
  older snapshot could restore a superseded source path that the new structure
  no longer described.
- **Resolution:** Phase 7 adds `Store.clearHistory()` and calls it immediately
  after a successful source replacement. The structural checkpoint remains in
  the recovery store; only the in-memory undo/redo history is discarded.
- **Related:** ADR [0011](../adr/0011-page-list-and-source-replacement.md),
  robustness §6 I7 and §7.4.
