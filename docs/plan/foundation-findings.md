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
- **Status:** open
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
- **Related:** ADR [0008](../adr/0008-integration-module-boundaries.md), ADR
  [0013](../adr/0013-module-first-foundation.md), issue
  [#157](https://github.com/MajorJohnDoe/gridscalr/issues/157).

### F-002 — Rust files are outside the line-budget check

- **Date:** 2026-11-10
- **Phase:** pre-foundation observation
- **Severity:** P2
- **Area:** tooling / Rust
- **Status:** open
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
- **Status:** open
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

### F-004 — Conflict comparison is metadata-only

- **Date:** 2026-11-10
- **Phase:** 1 — safe save
- **Severity:** P2
- **Area:** save integrity / compare
- **Status:** deferred
- **Evidence:** `src/features/saveIntegrity/ui.ts` shows the local and disk page
  and item counts, size, time and hash. It does not open the revision
  comparison engine.
- **Problem:** **Compare with disk version** answers “which file is newer and
  how large is it”, not “which markups differ”. The visual comparison from a
  conflict dialog is listed in robustness §7.8 and belongs to Phase 6.
- **Impact:** The safe default still preserves both versions, but the user must
  save the conflicted copy and open a revision comparison to see item changes.
- **Next step:** Reuse the existing revision comparison session with a
  disk-project source when Phase 6 adds conflict comparison.
- **Related:** robustness §7.8, Phase 6 interoperability.

### F-005 — Restored backups cannot resolve relative drawing links

- **Date:** 2026-11-10
- **Phase:** 1 — safe save
- **Severity:** P2
- **Area:** backup / document loading
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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
- **Status:** open
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

## Triaged or deferred

No entries yet.

## Fixed

No entries yet.

### F-011 — Template sheet fields still belong to a document, not a page

- **Date:** 2026-11-10
- **Phase:** 3 — page list and document model
- **Severity:** P2
- **Area:** template sheets / page identity
- **Status:** open
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
- **Status:** open
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
- **Status:** open
- **Evidence:** `app/replacementFlows.ts` returns the localized **PDF only**
  warning for TIF and template documents.
- **Problem:** A reissued scan cannot be mapped in place. The user must add the
  new TIF as a document and delete the old pages explicitly.
- **Impact:** No data loss; the workflow is manual for scans.
- **Next step:** Add TIF replacement once the derived-PDF lifetime and checksum
  rules are covered, or document the manual path in the user guide.
- **Related:** ADR [0011](../adr/0011-page-list-and-source-replacement.md),
  schema 25 source storage.
