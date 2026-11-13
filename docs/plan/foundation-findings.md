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

## 0.27.0 triage (2026-11-12)

- Converted to [#240](https://github.com/MajorJohnDoe/gridscalr/issues/240):
  F-044, F-045, F-046.
- [#241](https://github.com/MajorJohnDoe/gridscalr/issues/241): F-017.
- [#236](https://github.com/MajorJohnDoe/gridscalr/issues/236): F-088, with
  F-084 and F-085.
- [#238](https://github.com/MajorJohnDoe/gridscalr/issues/238): F-091 and F-023.
- [#239](https://github.com/MajorJohnDoe/gridscalr/issues/239): F-097, F-098,
  F-100, F-101.
- [#199](https://github.com/MajorJohnDoe/gridscalr/issues/199): F-036.
  [#200](https://github.com/MajorJohnDoe/gridscalr/issues/200): F-035.
- Deferred beyond 0.27.0: F-011 (schema 27 candidate), F-054, F-056, F-057,
  F-065 and F-067.
- F-075, F-076, F-079, F-080 and F-082 stay in
  [#234](https://github.com/MajorJohnDoe/gridscalr/issues/234).

The plan is [`0.27.md`](0.27.md); the epic is
[#242](https://github.com/MajorJohnDoe/gridscalr/issues/242).

## Open findings

### F-001 — Model imports a feature module

- **Date:** 2026-11-10
- **Phase:** pre-foundation observation
- **Severity:** P2
- **Area:** architecture
- **Status:** fixed — 0.25.0 phase 15 ([#195](https://github.com/MajorJohnDoe/gridscalr/issues/195))
- **Evidence:** `src/model/layers.ts` imported `features/countTypes/model`;
  `src/model/{geometry,hitTest,snap}.ts` imported
  `features/schematics/symbols/registry`.
- **Problem:** A lower-layer model file depends on a feature module, the reverse
  of the dependency direction in ADR 0008. Shared defaults currently live inside
  the count-types feature.
- **Impact:** It makes the model layer harder to test and risks a cycle when a
  feature imports model types. It is also an example new foundation code must not
  copy.
- **Next step:** Decide whether the default count types belong in `src/model` or
  whether the feature must provide them through an explicit injection point.
  Handle this as a separate refactor, not inside Phase 1.
- **Resolution:** Phase 15 moved the shared rules into the model and made the
  feature import them. `src/model/countTypes.ts` now owns the built-in defaults,
  normalization, lookup, management and presets; `src/features/countTypes/`
  keeps only its dialog and gains an `index.ts` public surface. The pure
  sign-plus-schematic catalogue and lookup moved to
  `src/model/symbols/{catalog.ts,schematic/}`, and the schematics feature
  registry re-exports them for its localized labels, search text and render
  helpers. `tests/modelBoundary.test.ts` walks `src/model` and fails on any
  import that resolves into `src/features`, with no allowlist, and an ESLint
  `no-restricted-imports` pattern blocks the same import. The earlier "Phase 7
  removed the unused helper from `paths.ts`" note was a different change and is
  superseded.
- **Related:** ADR [0008](../adr/0008-integration-module-boundaries.md), ADR
  [0013](../adr/0013-module-first-foundation.md), issue
  [#157](https://github.com/MajorJohnDoe/gridscalr/issues/157).

### F-002 — Rust files are outside the line-budget check

- **Date:** 2026-11-10
- **Phase:** pre-foundation observation
- **Severity:** P2
- **Area:** tooling / Rust
- **Status:** fixed — 0.25.0 phase 14 ([#194](https://github.com/MajorJohnDoe/gridscalr/issues/194))
- **Evidence:** `src-tauri/src/package.rs` is about 2,150 lines and
  `src-tauri/src/commands.rs` about 540; `check:file-budgets` scans only `src/`.
- **Problem:** The frontend has a blocking file budget, but large Rust modules
  have no equivalent guard. New conditional-write and source-storage commands
  could grow the same files.
- **Impact:** Rust modules can become the next set of large, hard-to-review
  files even while the frontend stays within budget.
- **Resolution:** `npm run check:file-budgets` now scans `src-tauri/src` with a
  400-line default and reviewed `{ "max", "reason" }` exceptions for
  `commands.rs`, `package.rs`, `project_write.rs` and `source_copy.rs`.
  `--update` raises an existing exception but refuses a new oversized Rust file
  and prunes stale exceptions.
- **Next step:** A Rust module-boundary check beyond line counts is recorded as
  F-097.
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
- **Status:** fixed
- **Evidence:** `restoreProjectBackup()` called `loadProjectData(project, null,
  true)`. With a null project path, `documentFlows.ts` could not resolve
  `relativePath`, so it relied on each document's stored absolute path.
- **Problem:** A backup stayed usable only while the original drawing paths
  still existed. If the project folder and drawings moved together, a restored
  backup asked the user to relink even though the backup's relative links were
  correct for the original location.
- **Resolution:** 0.24.0 phase 10 ([#176](https://github.com/MajorJohnDoe/gridscalr/issues/176))
  adds the pure `planRestoreLinks()` model. A restored backup resolves each
  relative link against the origin path recorded in the backup manifest and
  then against the folder of the open project, so a moved project folder and a
  backup written before the manifest both resolve. A document whose relative
  link no longer resolves is reported before the load and must be located
  explicitly; the stale absolute path is never substituted silently. A document
  without a relative link still uses its stored absolute path, which is its
  only reference.
- **Related:** ADR [0010](../adr/0010-project-file-integrity.md), robustness
  §7.2, F-063.

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
- **Area:** recovery / view-only session
- **Status:** fixed
- **Evidence:** `ProjectSession.saveProject()` refused a normal save when
  `store.readOnly` was set, but the store remained editable and canvas tools
  stayed active. The banner pointed only to **Save a copy…**.
- **Problem:** The label said read-only, but the in-memory project could still be
  changed. A user may expect that taking over is required for any edit. The
  refusal was safe for the disk file, but the interaction was ambiguous.
- **Impact:** No silent overwrite was possible. Local edits in a read-only
  session survived only through **Save a copy…**, which was easy to miss.
- **Resolution:** 0.24.0 phase 11 makes read-only a true **View-only** mode. The
  store, canvas, inspectors, menus, context menus and shortcuts reject every
  project mutation. Inspection, search, reference view, export, package and
  **Save a copy…** stay available. **Take over to edit** re-checks the lease
  before editing is enabled.
- **Related:** robustness §7.3, issue
  [#154](https://github.com/MajorJohnDoe/gridscalr/issues/154), [#177](https://github.com/MajorJohnDoe/gridscalr/issues/177).

### F-008 — Recovery retention is count-based, not size-based

- **Date:** 2026-11-10
- **Phase:** 2 — recovery and open-elsewhere
- **Severity:** P2
- **Area:** recovery storage
- **Status:** fixed — 0.24.0 phase 8 ([#174](https://github.com/MajorJohnDoe/gridscalr/issues/174))
- **Evidence:** `AUTOSAVE_RECORDS_PER_PROJECT = 2` and
  `CHECKPOINTS_PER_PROJECT = 10` in `features/sessionRecovery/record.ts`. Each
  record stores a serialized project string.
- **Problem:** A large project kept two full autosaves and up to ten full
  checkpoints without a byte budget. On a quota-limited origin this could exhaust
  storage and turn autosave off exactly when the project was largest.
- **Fix:** `features/sessionRecovery/budget.ts` adds a 64 MiB per-project and
  256 MiB total budget, size-aware pruning oldest first, and protection for the
  newest autosave and newest checkpoint. The store prunes before writing, the
  recovery center and diagnostics report the footprint, and a quota failure
  names the file save and the recovery center.
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
- **Status:** triaged #241
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
- **Status:** fixed — 0.25.0 phase 7 ([#188](https://github.com/MajorJohnDoe/gridscalr/issues/188))
- **Evidence:** `PageRecord.provenance` was written by `prepareProjectImport()`
  and documented in `docs/project-file.md`, but no panel or report displayed it.
- **Problem:** A user could not see which source project revision a page came
  from without inspecting the JSON. The data is useful for support and later
  merge decisions but was invisible.
- **Impact:** Provenance was preserved and validated; only its presentation was
  missing.
- **Resolution:** Properties shows a read-only **Imported page** section for the
  current page, and the Markups table adds a compact **Imported** column only
  when a visible row has provenance. Both render shortened identifiers, the
  short revision hash, the revision time, the source page and the import time.
  Malformed records are omitted, and diagnostics stay path-free.
- **Related:** robustness §7.7, schema 25 optional fields,
  `src/features/importProvenance/`.

### F-023 — OCG groups cannot express page-scoped layer visibility

- **Date:** 2026-11-10
- **Phase:** 6 — interoperability
- **Severity:** P2
- **Area:** PDF export / OCG
- **Status:** triaged #238
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

### 0.24.0 phase 1 — security audit (2026-11-11)

Full evidence, impact and acceptance criteria are in
[`docs/security-audit.md`](../security-audit.md). No P0 was found. These entries
are `open` because the follow-up phases exist but their scope still has to be
confirmed against the audit.

#### F-028 — The shipped page has two CSP policies and keeps dev origins

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit
- **Severity:** P2
- **Area:** CSP / webview
- **Status:** fixed
- **Evidence:** `index.html` has a meta CSP with `script-src 'self'` and
  `connect-src ... ws://localhost:1420 http://localhost:1420`. Tauri adds a
  different policy as an HTML response header from `src-tauri/tauri.conf.json`.
  Both are enforced; the meta tag is never replaced.
- **Problem:** The production build still allows the page to open an HTTP or
  WebSocket connection to `localhost:1420`, and the two policies can drift. A
  main-thread WebAssembly use would fail against the meta tag while passing
  against the configured policy. `object-src`, `base-uri`, `frame-src` and
  `form-action` are missing and `freezePrototype` is off.
- **Impact:** A weaker-than-intended policy and a fragile configuration. No
  current exploit and no current user-visible break, because the bundled
  WebAssembly runs inside workers.
- **Next step:** Make one policy authoritative, keep dev origins in `devCsp`,
  add the missing directives and evaluate `freezePrototype`. Phase 2, #168.
- **Resolution:** Phase 2 removed the meta CSP from `index.html`, made `app.security.csp` the only production policy, kept the HMR origins in `devCsp`, and added `object-src`, `base-uri`, `frame-src` and `form-action`. `freezePrototype` was evaluated and kept off: pdf-lib assigns `PDFHeader.prototype.toString`, so the page throws under a frozen `Object.prototype`; the packaged WebKitGTK smoke test never left the boot screen. The value and reason are recorded in `security/policy.json`. `npm run check:security` compares the configuration with `security/policy.json`; `npm run test:csp` asserts the dev meta equals `devCsp`. See `docs/security-policy.md`.
- **Related:** `docs/security-audit.md` §4, `index.html`,
  `src-tauri/tauri.conf.json`.

#### F-029 — Worker contexts are outside the configured CSP

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit
- **Severity:** P2
- **Area:** CSP / worker
- **Status:** fixed
- **Evidence:** PDF.js and Tesseract are started as same-origin URL workers.
  Tauri attaches the CSP header only to HTML assets, and Chromium does not apply
  a page's meta CSP to a same-origin URL worker (verified with a worker that
  compiled WebAssembly under `script-src 'self'`).
- **Problem:** `script-src`, `connect-src` and `worker-src` do not constrain what
  the PDF.js and Tesseract workers can load or fetch.
- **Impact:** A compromised bundled worker could load or fetch an arbitrary
  origin without a CSP violation. No malicious worker code exists today, so this
  is containment rather than an active exploit.
- **Next step:** Give worker responses a policy (header on all assets or a
  `blob:` worker that inherits the document policy) and prove that OCR and
  scanned PDFs still work. Phase 2, #168.
- **Resolution:** `src/pdf/pdfRenderer.ts` and `src/search/ocr.ts` now start their bundled workers from blob shims so the worker inherits the document policy. `npm run test:csp` starts the real Tesseract worker, imports a same-origin module from a blob worker and proves a remote fetch is blocked.
- **Related:** `docs/security-audit.md` §4.3, `src/pdf/pdfRenderer.ts`,
  `src/search/ocr.ts`.

#### F-030 — `core:default` grants more than GridScalr uses

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit
- **Severity:** P2
- **Area:** Tauri capabilities
- **Status:** fixed
- **Evidence:** `src-tauri/capabilities/default.json` grants `core:default`,
  which expands to path, event, window, webview, app, image, resources, menu and
  tray defaults. The frontend uses only `api/core`, `api/window`, `api/webview`
  and `api/event`; it creates no native menu, tray or image and does not call
  `close()`.
- **Problem:** Every extra permission is reachable after a renderer compromise.
  `core:image:allow-from-path` and the menu/tray/devtools commands are
  unnecessary.
- **Impact:** A larger blast radius than the app needs; it also weakens the
  "capabilities are no broader than the app needs" 1.0 criterion.
- **Next step:** Replace `core:default` with `core:event:default`, the six
  explicit window permissions and `dialog:default`; drop `allow-close`. Phase 2,
  #168.
- **Resolution:** `src-tauri/capabilities/default.json` now grants `core:event:default`, six explicit window permissions and `dialog:allow-open`/`allow-save`. `core:window:allow-internal-toggle-maximize` is kept for the custom title bar double-click; `allow-close` is gone because the close flow calls `destroy()`. Every permission is justified in `security/policy.json` and checked by `npm run check:security`.
- **Related:** `docs/security-audit.md` §3.1.

#### F-031 — The write guard ignores the original path of a managed copy

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit
- **Severity:** P2
- **Area:** source storage / write guard
- **Status:** open
- **Evidence:** `sourceDocumentPaths()` adds `document.path` and the resolved
  `relativePath` only. A managed document keeps its original drawing in
  `DocumentRef.originalPath`, which is never protected.
- **Problem:** The original behind a managed copy can be overwritten if the user
  chooses it as a save or export target.
- **Impact:** Source data loss through an alternate path, which is the failure
  the guard exists to prevent.
- **Next step:** Include every `originalPath` in `sourceDocumentPaths()` and
  cover it in the write-guard and save tests. Phase 3, #169.
- **Related:** `docs/security-audit.md` §5.1, ADR
  [0012](../adr/0012-source-storage-modes.md).

#### F-032 — No byte limit on project or file reads

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit
- **Severity:** P2
- **Area:** project loading / IPC
- **Status:** open
- **Evidence:** `read_text`, `read_binary` and `file_size` read or hash the whole
  file. `parseProjectWithReport()` calls `JSON.parse()` with no size check.
  `source_find_by_hash()` hashes up to 4096 files with no total-byte budget.
- **Problem:** An oversized or crafted project can exhaust WebView memory and
  lose unsaved work; a multi-gigabyte source has the same effect.
- **Impact:** Denial of service with a possible loss of unsaved edits.
- **Next step:** Add a project-file limit before the read, a per-source read
  limit and a total budget for the checksum search; document the limit. Phase 3,
  #169.
- **Related:** `docs/security-audit.md` §6.1.

#### F-033 — Package extraction can write 16 GiB without disclosure

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit
- **Severity:** P2
- **Area:** project package
- **Status:** open
- **Evidence:** `MAX_TOTAL_BYTES = 16 GiB` and `MAX_ENTRY_BYTES = 4 GiB` in
  `src-tauri/src/package.rs`. `package_inspect` does not return the uncompressed
  total and extraction does not check free space.
- **Problem:** A malicious or corrupted package can fill the destination disk
  before checksum verification or the final rename completes.
- **Impact:** Disk exhaustion and a failed extraction; the temporary folder is
  removed but the disk can already be full.
- **Next step:** Show the uncompressed total in the open-package dialog, check
  free space and decide whether 16 GiB is the right 1.0 cap. Phase 3, #169.
- **Related:** `docs/security-audit.md` §6.2.

#### F-034 — An untrusted project can reference any local path

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit
- **Severity:** P2
- **Area:** project input / path resolution
- **Status:** open
- **Evidence:** `normalizeDocument()` accepts any absolute `path` and any
  `relativePath`; `resolveRelativePath()` resolves `..`. The existing test
  asserts that `../../drawings/a.pdf` resolves outside the project folder.
- **Problem:** Opening a project from an untrusted source can make the app read,
  hash and display any local PDF/TIF the user can access. It cannot write to the
  file and cannot send it anywhere.
- **Impact:** Local disclosure on screen and a mismatch with a naive reading of
  the `SECURITY.md` path-traversal guarantee. Reference mode intentionally
  allows drawings outside the project folder.
- **Next step:** State the trust model in `SECURITY.md` and the user guide, and
  add a project-doctor warning for references outside the project folder. Do not
  confine paths. Phase 3, #169, plus a documentation note.
- **Related:** `docs/security-audit.md` §5.5, `SECURITY.md`.

#### F-035 — GitHub Actions are referenced by mutable tags

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit
- **Severity:** P2
- **Area:** release supply chain
- **Status:** triaged #200
- **Evidence:** The workflows use `actions/checkout@v7`,
  `actions/upload-artifact@v7`, `Swatinem/rust-cache@v2`,
  `dtolnay/rust-toolchain@stable` and other major tags.
- **Problem:** A moved or compromised tag runs new code in the build that
  produces the release artifacts. Tokens are read-only but the artifacts are the
  target, and the builds are unsigned.
- **Impact:** A tampered release is hard for a user to detect.
- **Next step:** Pin every third-party action to a commit SHA with a version
  comment and let Dependabot update the pins. Phase 4, #170.
- **Related:** `docs/security-audit.md` §8.3.

#### F-036 — Windows path guarantees are built but not tested on Windows

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit
- **Severity:** P3
- **Area:** tests / filesystem
- **Status:** triaged #199
- **Evidence:** `cargo test --lib` runs only on Ubuntu. The Windows and macOS CI
  jobs build and smoke-test but do not run the Rust unit tests; the symlink and
  hard-link cases are `#[cfg(unix)]` or skipped by the filesystem.
- **Problem:** Junctions, UNC spellings, verbatim prefixes, trailing dots or
  spaces and alternate data streams are handled in the guard but never exercised
  on Windows.
- **Impact:** A regression in the source write guard could ship undetected.
- **Next step:** Run the save and package Rust test modules on Windows and add
  Windows-only junction and trailing-dot tests. Phase 3, #169.
- **Related:** `docs/security-audit.md` §5.1.

#### F-037 — Test-only IPC commands are shipped in release builds

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit
- **Severity:** P3
- **Area:** Tauri commands
- **Status:** fixed
- **Evidence:** `smoke_test_dir` and `finish_smoke_test` are registered
  unconditionally; `finish_smoke_test` calls `app.exit(code)`.
- **Problem:** A renderer script can read a path string and exit the app, a
  capability that exists only for CI.
- **Impact:** Small; no data exposure.
- **Next step:** Register the commands only when `--smoke-test` is supplied or
  behind a debug build, while keeping the packaged smoke test working. Phase 2,
  #168.
- **Resolution:** The commands moved to `src-tauri/src/smoke.rs`, which is compiled with `#[cfg(debug_assertions)]` only; the frontend asks for the smoke directory only when the `__TAURI_DEBUG__` define is true. The CI smoke test builds with `--debug`, so it keeps working. The check script rejects an unconditional registration.
- **Related:** `docs/security-audit.md` §3.2.

#### F-038 — `style-src 'unsafe-inline'` is only needed by two declarations

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit
- **Severity:** P3
- **Area:** CSP / UI markup
- **Status:** fixed
- **Evidence:** `index.html` has an inline `<style>` block for the boot fallback;
  `src/ui/statusBar.ts` builds a `style="color:..."` attribute in an `innerHTML`
  string.
- **Problem:** The inline style block and the attribute force
  `style-src 'unsafe-inline'`, although every other style change uses the CSSOM.
- **Impact:** A weaker style policy and an avoidable HTML sink. The colour is
  canonicalized, so there is no current injection.
- **Next step:** Move the boot styles to an external CSS file, set the status-bar
  colour through the CSSOM and drop `'unsafe-inline'`. Phase 2, #168.
- **Resolution:** The boot styles moved to `public/boot.css` and the status-bar layer colour is set through the CSSOM in `src/ui/statusBar.ts`. Production `style-src` is `'self'` only; the check script rejects an inline style attribute in `index.html` or `src/`.
- **Related:** `docs/security-audit.md` §4.1 and §7.

#### F-039 — Development-only npm advisory remains open

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit
- **Severity:** P3
- **Area:** dependencies
- **Status:** fixed
- **Evidence:** `npm audit` reports 10 moderate, all from `minimatch 10.2.6`
  (GHSA-g3hv-75wg-m249, Dependabot alert #4) through `eslint 10.14.0` and
  `typescript-eslint 8.72.1`. `npm audit --omit=dev` reports 0.
- **Problem:** A glob denial of service in developer tooling, not shipped.
- **Impact:** None for users; a slow lint run on hostile glob input.
- **Next step:** Update through the next eslint/typescript-eslint release or a
  scoped override; otherwise accept it explicitly in the dependency gate. Phase
  4, #170.
- **Resolution:** A scoped `overrides` entry pins `minimatch` to `^11.0.1` and
  `npm audit` is clean. The override sits outside ESLint's declared range, which
  is recorded as the accepted F-048.
- **Related:** `docs/security-audit.md` §8.1.

#### F-040 — Rust audit: one accepted advisory and four unmaintained crates

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit
- **Severity:** P3
- **Area:** dependencies
- **Status:** accepted
- **Evidence:** OSV over all 462 lockfile packages: `glib 0.18.5`
  (GHSA-wrw7-89jp-8q8g, Dependabot alert #1) plus unmaintained
  `proc-macro-error 1.0.4`, `zvariant 5.15.1`, `zbus_names 4.3.5` and
  `zvariant_derive 5.15.1`.
- **Problem:** The glib soundness bug is Linux-only and pinned by Tauri's GTK
  0.18 generation; the unmaintained crates have no known vulnerability but will
  receive no fixes.
- **Impact:** Low; Windows artifacts are unaffected. The decision is already
  tracked by #21.
- **Next step:** Add `cargo audit` or `cargo deny` with a reviewed ignore list
  and revisit at the next Tauri/GTK upgrade. Phase 4, #170.
- **Resolution:** `security/dependency-allowlist.json` accepts the glib advisory
  and the four unmaintained crates with a written reason and a 2027-02-11 review
  date; `npm run check:dependencies` fails on an expired or stale entry. glib
  stays tracked by [#21](https://github.com/MajorJohnDoe/gridscalr/issues/21).
- **Related:** `docs/security-audit.md` §8.2, issue
  [#21](https://github.com/MajorJohnDoe/gridscalr/issues/21).

#### F-041 — A crashed save leaves project data in a temporary sibling

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit
- **Severity:** P3
- **Area:** save integrity / filesystem
- **Status:** fixed
- **Evidence:** `atomic_write()` and `write_conditional()` create
  `.<name>.<pid>.<nanos>.<counter>.tmp` beside the target. The failure test
  asserts that the flushed temporary file remains after a replace failure.
- **Problem:** A crash between flush and rename leaves a full project copy beside
  the project, including in a cloud-synced folder, and it is never cleaned up.
- **Impact:** Data can be synced or seen by another person; disk usage grows.
- **Next step:** Remove stale temporary siblings for the same target on open or
  the next save, using PID plus age so a live process is never disturbed. Phase
  3, #169.
- **Resolution:** The shared path guard removes generated temporary siblings on
  the next save when they are older than ten minutes and do not carry the
  running process's id.
- **Related:** `docs/security-audit.md` §5.2.

#### F-042 — IPC error details expose absolute paths

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit
- **Severity:** P3
- **Area:** diagnostics / error reporting
- **Status:** fixed
- **Evidence:** `CommandError.detail` and `WriteError.detail` embed the full path
  and OS error; `src/io/platformError.ts` shows the detail as a technical line
  that can be copied.
- **Problem:** A screenshot or copied error can reveal a customer folder or
  drawing name.
- **Impact:** Local disclosure only; diagnostics already sanitizes paths.
- **Next step:** Offer a sanitized copy action or sanitize the path in the
  dialog while keeping the on-screen detail. Phase 2, #168, or a small
  follow-up.
- **Resolution:** `src/model/pathText.ts` holds the shared sanitizer. Error dialogs keep the raw detail on screen for troubleshooting but offer **Copy sanitized details**, which removes absolute paths and keeps a structured command code. `tests/errorDetails.test.ts` covers the sanitizer and the code-preserving copy form.
- **Related:** `docs/security-audit.md` §7.

### F-043 — PDF export embeds a wall-clock time, so byte-identical output is not guaranteed

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 1 — security audit (found during the CI run)
- **Severity:** P3
- **Area:** PDF export / tests
- **Status:** fixed
- **Evidence:** `src/pdf/pdfExport.ts` calls `PDFDocument.create()` with the
  pdf-lib default `updateMetadata: true`. pdf-lib writes
  `/ModificationDate (D:YYYYMMDDHHmmSSZ)` with second precision. The
  `pdfExport` test "leaves the flattened PDF unchanged when the option is off"
  exports the same project twice and compares the bytes; when the two exports
  straddle a second boundary the bytes differ. The 0.24.0 phase 1 PR failed
  once on exactly this assertion and passed on a local re-run.
- **Problem:** The exported content is deterministic but the file bytes are not,
  because the metadata time changes. The test is therefore flaky, and any
  byte-for-byte reproducibility claim for exports is imprecise.
- **Impact:** Test reliability only. The visual and measurement content is
  unchanged, and no security property depends on the timestamp.
- **Resolution:** `applyExportMetadata()` (`src/pdf/export/metadata.ts`) writes a
  deterministic info block from the project's `updatedAt` (falling back to
  `createdAt`, then the epoch) and a fixed producer/creator. Two exports of the
  same project are byte-identical. A dedicated test asserts the stored dates and
  reads the file back with `updateMetadata: false`, so inspecting the output no
  longer stamps a fresh `ModDate`. Shipped on `main` after the 0.25.0 tag; the
  next patch release carries it.
- **Related:** `docs/security-audit.md` §13, `tests/pdfExport.test.ts`,
  [#201](https://github.com/MajorJohnDoe/gridscalr/issues/201).

### F-044 — Package creation has no total output cap

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 3 — path and package hardening
- **Severity:** P3
- **Area:** project package / disk
- **Status:** triaged #240
- **Evidence:** `package_create` accepts a project JSON string, any number of
  `documents`/`exports`/`source_scans` sources and writes until the sources are
  exhausted. Phase 3 caps *extraction* at 2 GiB uncompressed and checks free
  space there, but the creating side has no equivalent total-byte or free-space
  check.
- **Problem:** A user can build a package larger than any extraction will accept,
  and a nearly full destination only fails part-way through the write.
- **Impact:** A failed write is cleaned up by the existing temporary-file rename
  and cancellation paths, so no partial package is left. Disk space can still be
  consumed while the write runs.
- **Next step:** Mirror `disk_space::available_bytes` and the extraction cap in
  `create_package`, and show the expected size in the package options dialog.
  Schedule with the package work in 0.25.0 or as a small follow-up.
- **Related:** `src-tauri/src/package.rs`, F-033.

### F-045 — A managed copy has no source-size cap

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 3 — path and package hardening
- **Severity:** P3
- **Area:** source storage
- **Status:** triaged #240
- **Evidence:** `copy_to_project` hashes and streams the source without a size
  limit, then verifies the copy. Phase 3 bounds *reads* at 1 GiB but the copy
  command is a separate path.
- **Problem:** Copying a multi-gigabyte PDF into `<project>.drawings/` succeeds
  and doubles the disk use of the drawing without a warning.
- **Impact:** Disk use and time only; the checksum verification still proves the
  copy matches the source.
- **Next step:** Apply `MAX_SOURCE_BYTES` to the managed-copy source and report a
  localized `fileTooLarge` before streaming. Small follow-up.
- **Related:** `src-tauri/src/source_copy.rs`, `src-tauri/src/path_guard.rs`.

### F-046 — Stale temporary cleanup runs only on save

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 3 — path and package hardening
- **Severity:** P3
- **Area:** atomic writes
- **Status:** triaged #240
- **Evidence:** `clean_stale_temporaries()` is called by `atomic_write` and
  `write_conditional_with`. Opening a project never triggers it, and package
  extraction and backup temporary folders keep their own naming and cleanup.
- **Problem:** A crash followed by an open-only session leaves a full project
  copy beside the project until the next save.
- **Impact:** Local disk use and a project-data artifact in a shared folder. The
  project file itself stays readable and the cleanup is conservative.
- **Next step:** Call the same helper after a project loads and extend it to the
  package extraction temporary folder. Small follow-up.
- **Related:** F-041, `docs/limitations.md`.

### F-047 — The browser fallback guard is textual only

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 3 — path and package hardening
- **Severity:** P3
- **Area:** write guard
- **Status:** accepted
- **Evidence:** `src/io/writeGuard.ts` compares normalised path text. The browser
  fallback has no file-system API to canonicalize a symlink or compare file
  identities, so only the Rust guard resolves real paths.
- **Problem:** In the browser fallback a case variant or an unresolved symlink
  cannot be proven different from a source path; the textual comparison is the
  conservative choice but is not a filesystem identity check.
- **Impact:** The browser fallback writes by download and cannot overwrite an
  existing file in place. The desktop app, where a save can replace a file, uses
  the full Rust guard.
- **Next step:** Keep the textual guard and the documented desktop-only
  guarantee. Revisit only if the browser fallback gains a real save target.
- **Related:** `docs/limitations.md`, `src-tauri/src/path_guard.rs`.

### F-048 — The minimatch override is outside the declared ESLint range

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 4 — dependency and advisory gate
- **Severity:** P3
- **Area:** dependency tooling
- **Status:** accepted
- **Evidence:** `package.json` has `overrides: { "minimatch": "^11.0.1" }`.
  `eslint 10.14.0` and `@typescript-eslint/typescript-estree 8.72.1` declare
  `minimatch ^10.2.x`, which is inside the advisory range. No released
  ESLint/typescript-eslint version declares minimatch 11 yet.
- **Problem:** The override forces a major version the parent tools do not
  declare. A future ESLint or typescript-eslint change that relies on a
  minimatch 10 behaviour could break linting.
- **Impact:** `npm run lint`, the full test suite, the build and the UI suites
  pass with 11.0.7. The alternative is an accepted moderate advisory in
  development tooling, which the gate would have to carry indefinitely.
- **Next step:** Remove the override as soon as both tools declare minimatch 11
  and `npm audit` stays clean without it. Re-run lint and the dependency gate
  when removing it.
- **Related:** F-039, `package.json`.

### F-049 — The dependency gate depends on live advisory databases

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 4 — dependency and advisory gate
- **Severity:** P3
- **Area:** dependency tooling
- **Status:** accepted
- **Evidence:** `npm audit` queries the npm registry and `cargo audit` fetches
  the RustSec advisory database. `scripts/check-dependencies.mjs` retries three
  times and then fails closed with an explicit message.
- **Problem:** A network outage or a registry problem blocks the gate and
  therefore a pull request or release build, even when the tree is unchanged.
  The result is only as current as the advisory source it can read.
- **Impact:** The gate never reports an unverified tree as clean. A cached
  report can reproduce a run with `--npm-report` / `--cargo-report`, but the
  real gate intentionally checks the current database.
- **Next step:** Keep the fail-closed behaviour. Revisit a pinned advisory
  snapshot only if the live source becomes unreliable, and document that choice
  before changing it.
- **Related:** `docs/security-policy.md`, `.github/workflows/ci.yml`.

### F-050 — The managed-copy command was refused once a project held a managed copy

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 5 — path, archive and project fuzzing
- **Severity:** P2
- **Area:** source storage / write guard
- **Status:** fixed
- **Evidence:** The adversarial corpus asked whether the app's own copy
  destination stays writable. `copyDocumentIntoProject()` and
  `consolidateDrawings()` pass `sourceDocumentPaths(project, projectPath)` as the
  protected list. `sourceDocumentPaths()` adds `<project>.drawings` for every
  managed document, and both guards treat a protected folder as a root:
  `path_guard::ensure_writable` and `source_copy::ensure_destination_free` refuse
  any destination inside it. The second copy in a project therefore failed with
  `sourceOverwrite`, and so did a later **Copy drawing into project** after an
  earlier **Consolidate drawings…**.
- **Problem:** The folder that exists to receive a managed copy was also listed
  as a folder that must never be written. The first copy worked because the
  project had no managed document yet; every copy after it did not.
- **Impact:** A normal, explicit source-storage workflow was broken after one
  successful copy. Nothing was written and no source was harmed, so the failure
  was visible and safe, but the feature stopped working.
- **Resolution:** `managedCopyProtectedPaths()` in `src/io/projectFile/paths.ts`
  removes only the project's own `<stem>.drawings` folder from the list handed to
  the copy command. Every document path, every managed copy and every
  `originalPath` stays protected, and the Rust guard still refuses a destination
  that resolves outside the folder, so the copy cannot escape it. Both copy call
  sites use the new helper; exports, saves, backups and packages still protect
  the folder through `sourceDocumentPaths()`.
- **Related:** F-031, `src/features/sourceStorage/copyActions.ts`,
  `tests/robustness/adversarialInputs.test.ts`.

### F-051 — Generated archive names kept DEL and C1 control characters

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 5 — path, archive and project fuzzing
- **Severity:** P3
- **Area:** project package
- **Status:** fixed
- **Evidence:** `safeArchiveBase()` replaced only characters below `0x20`. The
  Rust entry guard rejects every `char::is_control()`, which also covers DEL
  (`0x7f`) and the C1 range (`0x80`–`0x9f`). A drawing whose name contains one of
  those characters produced an archive name that the package's own validator
  refused, so creating the package failed with an unhelpful "unsafe file name"
  error. `validatePackagedProjectJson()` had the same gap for a `documents/`
  link.
- **Problem:** Two name normalisers in the same feature disagreed about what a
  control character is.
- **Impact:** Package creation failed for an unusual file name. No escape and no
  data loss; the failure happened before anything was written.
- **Resolution:** One `isControlCode()` covering C0, DEL and C1 is used by
  `safeArchiveBase()` and `hasControlCharacter()`, and
  `validatePackagedProjectJson()` now rejects a control character in a relative
  link, matching Rust `validate_archive_name`. The corpus asserts that every
  accepted entry is a single safe leaf.
- **Related:** `src/features/projectPackage/model.ts`,
  `src-tauri/src/package.rs`.

### F-052 — An empty failure value produced an empty package error message

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 5 — path, archive and project fuzzing
- **Severity:** P3
- **Area:** project package / errors
- **Status:** fixed
- **Evidence:** `normalizePackageFailure()` falls back to `describeError()` for an
  unrecognised value, and `describeError("")` returns an empty string. The
  package dialog would then render an empty message instead of a failure.
- **Problem:** The structured-error contract says every rejected operation
  describes itself; the fallback could describe nothing.
- **Impact:** A blank error dialog for an implausible thrown value. No security
  or data effect.
- **Resolution:** The fallback uses `package.errorOperationFailed` when
  `describeError()` yields nothing. The corpus asserts that every normalised
  failure has a kind and a non-empty description.
- **Related:** `src/features/projectPackage/model.ts`,
  `src/io/platformError.ts`.

### F-053 — The session pause is process memory, so a renderer reload resumes autosave

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 6 — autosave preference
- **Severity:** P3
- **Area:** session recovery / preferences
- **Status:** accepted
- **Evidence:** `pausedForSession` is module state in
  `src/features/sessionRecovery/autosavePreference.ts` and is deliberately not
  written to localStorage. A full renderer reload recreates the module, so the
  pause clears even though the operating-system process did not restart.
- **Problem:** “Pause for this session” has no durable marker that distinguishes
  a reload from a real new app start. The preference is defined to reset on a new
  start, and a reload behaves the same way.
- **Impact:** A reload silently resumes periodic snapshots. Nothing is lost and
  no file is written unexpectedly; the user simply has to pause again.
- **Next step:** If pause must survive a reload within one process, add a
  sessionStorage marker plus a process-start identifier. Do not persist it in
  `AppPreferences`.
- **Related:** `docs/user-guide.md` autosave section, #172.

### F-054 — The autosave status chip is informational only

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 6 — autosave preference
- **Severity:** P3
- **Area:** status bar / preferences
- **Status:** deferred — 0.28/backlog
- **Evidence:** The new status chip shows on/off/paused but has no menu. Every
  change goes through **Preferences → Data**.
- **Problem:** A user who notices that autosave is off cannot pause or change it
  from the status area, which is where the state is most visible.
- **Impact:** One extra dialog step; the state is always visible and the setting
  is discoverable from the guide.
- **Next step:** Give the chip a popover with pause/resume, interval and a link
  to Preferences as part of the save/backup/autosave status popover in
  [#178](https://github.com/MajorJohnDoe/gridscalr/issues/178).
- **Related:** #178, #172.

### F-055 — The recovery center re-encodes every snapshot to show its size

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 7 — recovery center
- **Severity:** P3
- **Area:** session recovery / performance
- **Status:** fixed — 0.24.0 phase 8 ([#174](https://github.com/MajorJohnDoe/gridscalr/issues/174))
- **Evidence:** `serializedBytes()` in
  `src/features/sessionRecovery/centerModel.ts` ran
  `new TextEncoder().encode(record.serialized)` for every record each time the
  center opened.
- **Problem:** The store did not persist the serialized byte size, so the
  dialog allocated a second copy of every snapshot string to measure it.
- **Fix:** `RecoveryRecord.serializedBytes` is written with every new record
  (including the legacy migration), and `serializedBytes()` in `budget.ts` reads
  it. Only records written before the change are encoded once, when they are
  listed or pruned.
- **Related:** #173, #174, F-008.

### F-057 — The recovery byte budget does not consult the browser quota estimate

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 8 — recovery byte budget
- **Severity:** P3
- **Area:** recovery storage
- **Status:** deferred — 0.28/backlog
- **Evidence:** `RECOVERY_BUDGET` in `src/features/sessionRecovery/budget.ts` is a
  fixed 64 MiB per project and 256 MiB total. Nothing calls
  `navigator.storage.estimate()`.
- **Problem:** An origin with a small quota, or one that already stores a large
  amount of other site data, can hit the browser limit below 256 MiB.
- **Impact:** Pruning still runs, the newest autosave and newest checkpoint are
  kept, and the quota path reports the actionable message. A user cannot tell
  from the center how much of the *browser* quota remains, only how much of the
  GridScalr budget is used.
- **Next step:** Read `navigator.storage.estimate()` when the store opens, cache
  it, and lower the effective total budget to a fraction of the reported quota.
  Show the effective figure in the recovery center instead of the fixed value.
  Keep the fixed budget when the estimate is unavailable.
- **Related:** #174, F-008.

### F-058 — Pruning counts serialized snapshot bytes only

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 8 — recovery byte budget
- **Severity:** P3
- **Area:** recovery storage
- **Status:** accepted
- **Evidence:** `serializedBytes()` measures `record.serialized`, not the record
  object with its id, project name, path, label and instance ID.
- **Problem:** The reported total is slightly below the bytes IndexedDB actually
  stores.
- **Impact:** The metadata is a few hundred bytes per record and bounded by the
  twelve-record count limit, so it cannot meaningfully change the budget
  behaviour. Reporting the snapshot size keeps one number for the center, the
  budget and diagnostics.
- **Next step:** If a future store adds long metadata such as a host label or
  note, include the JSON envelope overhead in the measurement.
- **Related:** #174, F-055.

### F-059 — The localStorage fallback cannot hold a large project

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 8 — recovery byte budget
- **Severity:** P3
- **Area:** recovery storage
- **Status:** accepted
- **Evidence:** `writeFallback()` in `recoveryStore.ts` serializes every record
  into one `localStorage` key, and the browser quota for that storage is about
  5 MB.
- **Problem:** When IndexedDB is unavailable, a large project cannot be stored at
  any reasonable budget.
- **Impact:** The write fails with the quota message naming **File → Save** and
  the recovery center, and the project stays open. Recovery is unavailable in
  that environment rather than silently truncated.
- **Next step:** None planned. IndexedDB is the supported store; the fallback is
  a small-store convenience.
- **Related:** #174, F-008.

### F-060 — The localStorage fallback is budgeted separately from IndexedDB

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 8 — recovery byte budget
- **Severity:** P3
- **Area:** recovery storage
- **Status:** accepted
- **Evidence:** `writeRecord()` prunes the records it reads from IndexedDB and
  `writeFallback()` prunes the records in the localStorage key. A successful
  IndexedDB write does not re-import fallback records, so both stores can hold
  records at the same time.
- **Problem:** The reported total comes from the merged read, but each store is
  pruned against its own contents. The merged footprint can therefore exceed the
  total budget by the fallback's small contents.
- **Impact:** The fallback only appears when IndexedDB is unavailable and is
  capped at roughly 5 MB by the browser. The newest autosave and checkpoint are
  still protected and the quota path stays actionable.
- **Next step:** On the first successful IndexedDB write, merge fallback records
  into IndexedDB, prune the merged set, and clear the fallback key.
- **Related:** #174, F-009, F-059.

### F-056 — Recovery instances have no human-readable label

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 7 — recovery center
- **Severity:** P3
- **Area:** session recovery / usability
- **Status:** deferred — 0.28/backlog
- **Evidence:** `RecoveryRecord` stores `instanceId` and `appVersion`, but no
  host label or session start time. The center shows the first eight characters
  of the instance ID.
- **Problem:** A record written by an earlier app session is identified by a
  random ID that means nothing to the user, so two machines or two windows are
  hard to tell apart after a restart.
- **Impact:** The user can still see the project, save time, label and base
  version, but the instance grouping is less useful than the lease's
  `Desktop · Windows` label.
- **Next step:** Add an optional, non-personal host label to the recovery record
  in a future store migration. Do not block phase 7 on it.
- **Related:** #173, `src/features/sessionRecovery/instance.ts`.

### F-061 — Backup origin path lives in an optional manifest

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 9 — backup manager
- **Severity:** P3
- **Area:** backup
- **Status:** accepted
- **Evidence:** `save_project_backup` writes `manifest.json` beside the rolling
  files to record the project path each backup came from. The manifest is read
  best-effort; a missing or corrupt file is treated as empty.
- **Problem:** The list still shows every backup file from the folder, but a
  file whose manifest entry is missing shows no origin path.
- **Impact:** Time, size, restore and delete remain correct. Only the origin
  path and the manager's moved-folder warning are unavailable until the next
  save writes a fresh manifest.
- **Next step:** None planned. Keeping the manifest as enrichment means a
  corrupt metadata file can never hide or block a backup.
- **Related:** #175, F-005, F-006.

### F-062 — Delete-all can leave an unreferenced trash folder

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 9 — backup manager
- **Severity:** P3
- **Area:** backup
- **Status:** accepted
- **Evidence:** `delete_all_in()` renames the project folder to a unique
  `.deleted` sibling before removing it. Renaming is the all-or-nothing step;
  `remove_dir_all()` is then best effort.
- **Problem:** If removal fails after the rename, the hidden trash folder stays
  in the app-data `backups/` root. It is no longer listed for the project.
- **Impact:** No backup is half-listed and no project data is affected. The
  leftover folder only consumes disk space until it is removed manually.
- **Next step:** If this is seen in practice, add a startup sweep for old
  `.deleted` siblings, bounded like the existing stale-temporary cleanup.
- **Related:** #175, F-041.

### F-063 — Restore-as-copy still resolves relative links from the recorded path

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 9 — backup manager
- **Severity:** P2
- **Area:** backup / document loading
- **Status:** fixed
- **Evidence:** `restoreBackup()` passed `null` as the project path for
  restore-as-copy, so `loadProjectData()` resolved relative drawing links only
  from each document's stored absolute path. The manager warned when the
  selected backup came from another path.
- **Problem:** This was the user-visible half of F-005. The warning made the
  limitation explicit but did not resolve the link.
- **Resolution:** 0.24.0 phase 10 resolves the restored project before it is
  loaded: the recorded origin first, the open project's folder second, and an
  explicit locate step for anything left. Restore-as-copy still keeps the
  project unsaved and writes neither a drawing nor a project file.
- **Related:** #175, [#176](https://github.com/MajorJohnDoe/gridscalr/issues/176), F-005.

### F-064 — A drawing located during restore is stored as an absolute reference

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 10 — backup restore links
- **Severity:** P3
- **Area:** backup / document loading
- **Status:** accepted
- **Evidence:** `applyRestoreRelink()` sets the picked path, clears
  `relativePath` and stores the document as `reference`.
- **Problem:** The new location's relative link is unknown while the restored
  project is unsaved, so the relinked drawing cannot be made portable within
  this restore. The same backup restored again needs the same drawing located
  again.
- **Impact:** The restored project works and can be saved; **Save as…** / **Save
  a copy…** then recompute relative links from the chosen folder.
- **Next step:** None planned. A folder-level picker would make a better
  relative link available; see F-065.
- **Related:** #176, F-005.

### F-065 — Restore locates unresolved drawings one file at a time

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 10 — backup restore links
- **Severity:** P3
- **Area:** backup / document loading
- **Status:** deferred — 0.28/backlog
- **Evidence:** `showRestoreLinkReport()` lists every unresolved drawing, and
  the confirm loop then calls `locateDrawing()` once per document.
- **Problem:** When a whole drawings folder moved to a known new location, the
  user picks each drawing separately. There is no single "the drawings folder is
  here now" action.
- **Impact:** Correct but repetitive for a project with many drawings. Nothing
  is guessed or scanned automatically.
- **Next step:** Consider a folder picker that resolves the remaining relative
  links against one chosen folder, with the same checksum verification.
- **Related:** #176, F-064.

### F-066 — A project still cannot open with a missing source drawing

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 10 — backup restore links
- **Severity:** P3
- **Area:** project loading / renderer
- **Status:** accepted
- **Evidence:** `loadProjectData()` requires a `PDFDocumentProxy` for every
  external document and aborts when the picker is cancelled. The restore flow
  therefore cancels the whole restore instead of opening a partial project.
- **Problem:** Opening a project with a known-missing drawing would need a
  placeholder document and a page-rendering path for it. That is a larger
  renderer change than a restore fix.
- **Impact:** Cancelling **Locate drawings…** leaves the open project unchanged,
  which is safe but means no partial restore. The source-changed banner already
  reports a missing source after a normal open.
- **Next step:** None planned for 0.24.0. Revisit with the source-replacement
  and placeholder work if partial opening is requested.
- **Related:** #176, F-005.

### F-067 — View-only cannot change the active layer

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 11 — view-only mode
- **Severity:** P3
- **Area:** view-only / layers
- **Status:** deferred — 0.28/backlog
- **Evidence:** `project.activeLayerId` is serialized project data, so the
  view-only store guard blocks `setActiveLayer()`. The context-bar layer picker
  is hidden in view-only and layer rows only expand.
- **Problem:** A user who wants to browse a different layer's items cannot make
  that layer active. Items remain reachable from the Layers list and Markups
  table, which navigate and select without changing the project.
- **Impact:** Inspection still works through existing lists. Only the
  "which layer receives next item" concept is unavailable, and there is no next
  item in view-only.
- **Next step:** If an inspection-only layer focus is wanted, keep it in UI
  state rather than in `Project.activeLayerId`.
- **Related:** #177.

### F-068 — View-only screenshots are deferred

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 11 — view-only mode
- **Severity:** P3
- **Area:** documentation / screenshots
- **Status:** accepted
- **Evidence:** The banner and status chip change the visible shell, but the
  capture manifest does not currently include a view-only session.
- **Problem:** The user guide describes the banner without a matching committed
  screenshot.
- **Impact:** No functional gap. The strict screenshot check runs in the 0.24.0
  documentation pass, which can add the capture then.
- **Next step:** Add a view-only banner capture to `docs/screenshots/manifest.json`
  during phase 14.
- **Related:** #177, #180.

### F-069 — A failed backup-list read looks like no backup

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 12 — status popover
- **Severity:** P3
- **Area:** save integrity / status overview
- **Status:** accepted
- **Evidence:** `collectStatusOverview()` catches a `listProjectBackups()`
  rejection and passes `lastBackupAt: null`, which the popover renders as
  **No automatic backup yet**.
- **Problem:** A transient app-data read failure is indistinguishable from a
  project that has never been backed up.
- **Impact:** No data loss and the popover still opens. The user may believe a
  backup does not exist while it does; the backup manager and **Backup now**
  remain available and would show the real list.
- **Next step:** If this proves confusing, carry a `backupReadFailed` flag
  through the model and show a distinct unavailable message. It needs no new
  storage or API.
- **Related:** #178, #175.

### F-070 — Last save time is the file modification time

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 12 — status popover
- **Severity:** P3
- **Area:** status overview
- **Status:** accepted
- **Evidence:** The popover uses `store.fileStamp.modifiedAt` as the last save
  time. The browser fallback has no stamp and therefore shows **Not available**.
- **Problem:** For a project opened from disk the time is the previous save,
  possibly written by another application or computer. The browser download is
  a save the popover cannot date.
- **Impact:** The value is honest about the file, not about this session. It
  needs no extra runtime state and cannot drift from the file on disk.
- **Next step:** If a session-relative save time is wanted, record a runtime
  `lastSavedAt` on `Store.markSaved()` rather than persisting it in the project.
- **Related:** #178.

### F-071 — Conflicted-copy discovery is limited to the current folder and name

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 13 — conflicted-copy manager
- **Severity:** P3
- **Area:** save integrity / conflicted copies
- **Status:** accepted
- **Evidence:** `list_conflicted_copies` scans the parent folder of the open
  project and matches only the documented name for its current stem.
- **Problem:** A project renamed or moved after a conflict leaves its copies
  under the old name in the old folder, where the manager no longer sees them.
- **Impact:** No data loss and no silent deletion. The copies remain ordinary
  files that can be opened from **File → Open project…**.
- **Next step:** If users ask for it, add an explicit **Choose folder…** scan
  that lists matches for a picked stem. It must keep the strict name, no-symlink
  and single-file-delete rules.
- **Related:** #179, #169.

### F-072 — Conflicted copies are not part of the recovery center

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 13 — conflicted-copy manager
- **Severity:** P3
- **Area:** recovery / conflicted copies
- **Status:** accepted
- **Evidence:** The recovery center lists IndexedDB autosaves and checkpoints
  only. Conflicted copies are opened from **File** and the status popover.
- **Problem:** There are two places to look for unsaved or conflicting work,
  each with a different origin and lifetime.
- **Impact:** The popover names the copy count and links to the manager, so a
  user who starts at recovery still finds the path. No storage is duplicated.
- **Next step:** Merge the two lists only if the recovery center becomes a
  general "my project's versions" surface; that needs a product decision.
- **Related:** #179, #173.

### F-073 — A listed copy is identified by name, not by content

- **Date:** 2026-11-11
- **Phase:** 0.24.0 phase 13 — conflicted-copy manager
- **Severity:** P3
- **Area:** save integrity / conflicted copies
- **Status:** accepted
- **Evidence:** The list shows file name, time and size. The copy is parsed only
  when it is opened or compared.
- **Problem:** A file renamed to exactly the conflicted-copy pattern but with
  unrelated content is listed. Deleting it is still explicit and single-file.
- **Impact:** A misleading row at most; opening it reports a parse failure, and
  comparing reports the unreadable-copy state instead of a diff.
- **Next step:** Reuse `buildConflictComparison` to show the project name in the
  row if list-time parsing proves cheap enough for large projects.
- **Related:** #179.

### F-088 — Replacing a managed-copy source leaves the old copy and original provenance

- **Date:** 2026-11-12
- **Phase:** 11 — TIF replacement and raw-byte provenance
- **Severity:** P3
- **Area:** source replacement / source storage
- **Status:** triaged #236
- **Evidence:** `applySourceReplacement()` merges the picked `DocumentRef` over the
  old document. A picked file is always built as `storage: "reference"`, so a
  managed document loses its managed mode, while `originalPath` and
  `originalSha256` from the previous copy can remain. The old file in
  `<project>.drawings/` is not removed.
- **Problem:** A replacement of a managed-copy PDF or TIF can leave a stale
  original-path provenance value and an unreferenced managed file.
- **Impact:** No data loss and the new source is correct. The leftover copy is
  reported by the project doctor's unreferenced-copy list, and the new document
  points at the picked file as a reference.
- **Next step:** Decide whether replacement should preserve managed storage by
  copying the new source into the project, and clear `originalPath` /
  `originalSha256` explicitly when it does not. Keep cleanup explicit.
- **Related:** ADR [0012](../adr/0012-source-storage-modes.md), F-017, #189.

### F-102 — A background source check waits for the focused field to lose focus

- **Date:** 2026-11-13
- **Phase:** 0.27.0 phase 8 — edit-safe shell rendering
- **Severity:** P3
- **Area:** shell / source status
- **Status:** fixed by #243
- **Evidence:** `requestShellRender()` defers a `"save"` render while an editable
  field inside the shell has focus and repaints on the field's `blur`. The
  source chips and page badges read the source summary during that render.
- **Problem:** A source that turns missing or changed during a check is not shown
  in the chips and badges until the user leaves the field they are typing in.
- **Impact:** The warning was delayed, never lost, and the panel the user was
  editing stayed intact. The project-dirty state and the save path were
  unaffected.
- **Next step:** Done in phase 9. The monitor no longer emits a store event; one
  subscription refreshes only the status chips and the mounted Pages badges, so
  the warning appears immediately and no whole-shell render is requested.
- **Related:** #243, `src/source/sourceStatus.ts`, `src/ui/sidebar.ts`.

### F-103 — Focus restore depends on the rebuilt field keeping a stable key

- **Date:** 2026-11-13
- **Phase:** 0.27.0 phase 8 — edit-safe shell rendering
- **Severity:** P3
- **Area:** shell / focus handling
- **Status:** deferred
- **Evidence:** `restoreField()` matches the rebuilt field by `id`, then
  `data-role`, then by its structural path and tag/type. Only an id or role match
  also restores the typed value and caret; a structural match restores focus
  alone.
- **Problem:** A Properties-style field without an id, a `data-role` or a name is
  rebuilt in the same place but its caret and any uncommitted text are not
  written back. Today only `#selection-label-input` (id plus `data-role`) and the
  symbol tag field are covered by a stable key.
- **Impact:** Focus survives every immediate render, but a field without a stable
  key can lose the caret. No user data is lost because the value is committed by
  the same `change` that requested the render.
- **Next step:** Add a `data-role` to the remaining shell inputs the next time the
  Properties content is touched, or generalise the match to the field's label
  text. Do not restore a value on a structural match alone.
- **Related:** F-102, `src/ui/editFieldSnapshot.ts`.

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
| F-002 | fixed | 0.25.0 phase 14 (#194) extends `check:file-budgets` to `src-tauri/src` with a 400-line default, reviewed Rust exceptions and a refusal to record a new oversized file. |
| F-003 | fixed | The unused `remapPageItems()` helper was removed in Phase 7; no production or test caller existed. |
| F-005 | fixed | 0.24.0 phase 10 resolves a restored backup's relative drawing links from the recorded origin and then from the open project's folder, reports what cannot be resolved, and requires an explicit relink instead of a stale absolute path. |
| F-006 | accepted | Backups are a local convenience keyed by project ID, not a portable archive; that is documented in `docs/limitations.md`. |
| F-007 | fixed | 0.24.0 phase 11 makes read-only a true **View-only** mode: no mutation path can change the project, and **Take over to edit** re-checks the lease. |
| F-008 | fixed | 0.24.0 phase 8 added a 64 MiB per-project and 256 MiB total byte budget with size-aware pruning, kept the newest autosave and checkpoint, and reports recovery storage size in the center and diagnostics. |
| F-009 | accepted | The lease is advisory by decision; the conditional write is the actual protection. |
| F-010 | accepted | The metadata watcher is a banner optimisation; the conditional save still detects the hash change at write time. |
| F-011 | deferred | Template fields remain document-owned by the Phase 3 decision; moving them into page state is a later schema change. |
| F-012 | fixed | 0.25.0 phase 16 derives the renderer page order from the store listener, with a registration deferral for new documents and a development invariant. |
| F-013 | fixed | 0.25.0 phase 11 extends **Replace source…** to TIF through the derived PDF and raw scan checksum, with the same mapping, superseded pages and warnings. |
| F-014 | accepted | The fixed sibling `<project>.drawings/` folder is a documented storage choice and keeps packages simple. |
| F-015 | accepted | Cloud/network detection only recommends a managed copy; it never blocks or rewrites a reference. |
| F-016 | accepted | Same-size source polling is a documented trade-off; open and explicit reload still hash the file. |
| F-017 | deferred | Garbage collection needs an explicit review-and-confirm action; automatic deletion is intentionally forbidden. |
| F-018 | accepted | A failed consolidation leaves only unreferenced copies; the project and every original remain valid and a retry reuses the content hash. |
| F-019 | accepted | The validator proves internal references; external source truth stays with the source-status checks and user review. |
| F-020 | accepted | Duplicate-ID repair cannot attribute ambiguous references; keeping the first occurrence is the documented safe choice. |
| F-021 | deferred | Provenance is preserved and validated; showing it in Properties or Markups is a presentation change, not an integrity gap. |
| F-022 | fixed | 0.25.0 phase 11 adds a raw-byte SHA-256 to the project picker and records it in provenance; older values stay as historical data. |
| F-023 | deferred | Per-page OCG design is an interoperability trade-off; hidden content is still excluded and the flattened default is unchanged. |
| F-024 | accepted | Review annotations are deliberately approximate and reader-dependent; they are not project data. |
| F-025 | accepted | Conflict comparison is read-only and heuristic; a merge would need a common base and semantic IDs. |
| F-026 | accepted | The share flow writes a local package through the save dialog; no OS share sheet or network dependency is planned. |
| F-027 | fixed | Source replacement now clears undo/redo at the structural boundary so an older snapshot cannot restore a superseded source reference. |
| F-067 | deferred | View-only blocks the context-bar layer picker because the active layer is persisted project data; an inspection-only layer focus would need session state. |
| F-068 | accepted | The view-only banner is a visible shell change; screenshot recapture is deferred to the 0.24.0 documentation pass. |
| F-074 | fixed | The release workflow no longer launches a release binary with the debug-only smoke flag; it verifies the staged artifacts and checksums instead. |
| F-102 | fixed #243 | A background source check no longer renders the shell; only the status chips and page badges refresh, and only when the status set changed. |
| F-103 | deferred | A rebuilt field without an id or `data-role` keeps focus but not the caret; add stable keys when Properties is next touched. |


### F-011 — Template sheet fields still belong to a document, not a page

- **Date:** 2026-11-10
- **Phase:** 3 — page list and document model
- **Severity:** P2
- **Area:** template sheets / page identity
- **Status:** deferred — schema 27 candidate, not planned for 0.27.0
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

### F-099 — Document registration is still ordered after the store emit

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 16 — renderer page order
- **Severity:** P3
- **Area:** canvas / renderer
- **Evidence:** `store.addDocument()` and the import and duplicate flows emit
  `"project"` before the new PDF proxies are registered with the renderer.
  `RendererDocumentRegistry.syncPageOrder()` therefore defers an order whose
  document indices are not yet available and applies it from `addImported()`
  after registration.
- **Problem:** A future flow that adds a project document without calling the
  registration helper leaves the renderer on the previous order. The deferral
  keeps that mistake from throwing, so it is silent until the next structural
  change.
- **Impact:** No data loss; a stale visible page until the next structural
  change. The regression suite covers the flows that exist today.
- **Next step:** Decide whether document registration belongs in the store (one
  call that adds the record and supplies the proxy) so the ordering constraint
  disappears. Do not add a per-frame production comparison.
- **Related:** F-012, ADR [0011](../adr/0011-page-list-and-source-replacement.md).

## Fixed

### F-012 — Renderer page order is synchronized manually

- **Date:** 2026-11-10
- **Phase:** 3 — page list and document model
- **Severity:** P2
- **Area:** canvas / renderer
- **Status:** fixed
- **Evidence:** `PdfRenderer.setPageOrder()` had to be called after insert,
  reorder, delete, import and source replacement. `App.afterStructuralPageChange`
  centralized most paths; `pageFlows` and import flows called it separately.
- **Problem:** A future structural operation that forgot to resync the renderer
  would render the previous page order while the project data was correct.
- **Impact:** No data loss; the visible page could be stale until the next
  reload.
- **Resolution:** 0.25.0 phase 16 moves the derivation into one store listener
  (`RendererStoreSync.handle`). `RendererDocumentRegistry.syncPageOrder()` applies
  the order only when its signature changes and never before every referenced
  document is registered; document registration derives the order itself. Every
  scattered `setPageOrder()` call is gone except the initial constructor
  argument. A development-only invariant reports a mismatch after each handled
  change, and `tests/rendererPageOrder.test.ts` drives insert, reorder with
  undo/redo, delete and source replacement through the real store.
- **Related:** ADR [0011](../adr/0011-page-list-and-source-replacement.md),
  §7.4.

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

### F-013 — Replace source supports PDF documents only

- **Date:** 2026-11-10
- **Phase:** 3 — page list and document model
- **Severity:** P3
- **Area:** source replacement
- **Status:** fixed — 0.25.0 phase 11 ([#191](https://github.com/MajorJohnDoe/gridscalr/issues/191))
- **Evidence:** `app/replacementFlows.ts` returned the localized **PDF only**
  warning for TIF and template documents.
- **Problem:** A reissued scan could not be mapped in place. The user had to add
  the new TIF as a document and delete the old pages explicitly.
- **Impact:** No data loss; the workflow was manual for scans.
- **Resolution:** **Replace source…** accepts a TIF as well as a PDF. The picked
  scan is converted through the existing derived-PDF path, the document keeps the
  raw TIF checksum, and the same page-identity mapping, superseded pages and
  size/scale warnings apply. The page menu offers the action for a TIF source
  while the PDF-only reload, relink and managed-copy actions stay hidden.
- **Related:** ADR [0011](../adr/0011-page-list-and-source-replacement.md),
  schema 26 source storage.

### F-022 — Import revision hash is computed from decoded text

- **Date:** 2026-11-10
- **Phase:** 5 — integrity and project doctor
- **Severity:** P3
- **Area:** import provenance
- **Status:** fixed — 0.25.0 phase 11 ([#191](https://github.com/MajorJohnDoe/gridscalr/issues/191))
- **Evidence:** `sourceProvenance()` in `src/app/projectImportFlows.ts` hashed the
  UTF-8 encoding of the text returned by `pickProject()`.
- **Problem:** A BOM, newline normalization or a different read path could make
  the provenance hash differ from a raw file hash computed elsewhere.
- **Impact:** Provenance was a useful revision identity inside GridScalr, but not
  a byte-for-byte file hash for external verification.
- **Resolution:** `projectFileIdentity()` reads the project bytes once, decodes
  the text and hashes the raw bytes; `PickedProject` carries that SHA-256 and the
  byte size, and provenance records them. Packages, backups and provenance now
  agree. Existing stored values are left untouched and documented as historical.
- **Related:** F-021, robustness §7.7, `src/io/platform.ts`.

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

### F-074 — The release workflow ran the debug-only smoke harness

- **Date:** 2026-11-11
- **Phase:** 14 — 0.24.0 release preparation
- **Severity:** P1
- **Area:** release workflow / desktop shell
- **Status:** fixed — 0.24.0 release preparation
- **Evidence:** `.github/workflows/release.yml` ran
  `gridscalr --smoke-test <dir>` against the **release** binaries on all three
  platforms. `src-tauri/src/lib.rs` declares `mod smoke` behind
  `#[cfg(debug_assertions)]`, and `App.bindSmokeTest()` returns early unless
  `__TAURI_DEBUG__` is set, so the release binary ignores the flag. It opens a
  window and waits for a close that never comes.
- **Problem:** The `v0.24.0` tag build hung in "Smoke test the packaged app" on
  Linux, macOS and Windows for about two hours before the run was cancelled.
  Phase 2 introduced this when it gated the smoke commands to debug builds
  (F-037) without revisiting the release workflow, so no ordinary CI run could
  see it: `ci.yml` builds `--debug` for its smoke test.
- **Fix:** The release workflow no longer launches the application. It verifies
  that the staging step produced the expected artifacts and a checksum file per
  platform. The smoke harness stays in `ci.yml`, where the debug build supports
  it, and the release notes list the artifacts rather than a GUI run.
- **Related:** F-037, phase 2, `docs/releasing.md`.

### F-075 — The Pages panel stops rendering at 400 cards

- **Date:** 2026-11-11
- **Phase:** 0.25.0 phase 1 — page drag-and-drop
- **Severity:** P3
- **Area:** pages panel
- **Status:** accepted — next step is a decoupled list, not a larger cap
- **Evidence:** `renderPages()` in `src/ui/pageList.ts` computes
  `const max = Math.min(total, 400)` and renders a note "Showing the first
  {shown} of {total} pages" past that limit. Every page card, and therefore every
  drag, keyboard reorder and multi-page selection, only exists for the rendered
  pages.
- **Problem:** A project with more than 400 pages can select, drag and keyboard
  reorder only the first 400. Pages past the cap keep their IDs and data but are
  unreachable from the panel, and a selection cannot span the cap.
- **Impact:** No data loss: the model already handles arbitrary page counts and
  reorder is pure array ordering by `PageId`. The gap is discoverability and
  reach for unusually large projects, and it is unchanged by the 0.25.0 reorder
  polish because the cap predates it.
- **Next step:** Virtualise the page list, or add a jump-to-page control that
  extends the rendered window around the target. Triage with the page status and
  filter work in #185 and the context-menu work in #186 rather than raising the
  fixed cap.
- **Phase 4 note:** status filters now narrow the list before the cap, so a page
  past position 400 becomes reachable when it matches the active filter. The cap
  itself is unchanged and the panel still says when it is showing the first cards
  of a longer list.
- **Related:** robustness §7.4, ADR 0011, #185, #186.

### F-076 — A managed copy after a Pages-panel drop is a second history boundary

- **Date:** 2026-11-11
- **Phase:** 0.25.0 phase 2 — Pages-panel file drop
- **Severity:** P2
- **Area:** pages panel / source storage
- **Status:** accepted — the ordinary import is still one undo step
- **Evidence:** `importDroppedDrawing()` commits the pages with one
  `store.mutate`. If the user accepts the managed-copy recommendation for a
  cloud or network drawing, `SourceStorageController.applyImportChoice()` runs
  afterwards and `applySourceStorageChange()` calls `store.clearHistory()`.
- **Problem:** A drawing imported from OneDrive, a UNC path or another
  recommended location cannot be removed with one Undo after the managed copy is
  accepted. The import and the copy are two structural operations, and the copy
  deliberately clears history so an older snapshot cannot restore the previous
  source path.
- **Impact:** No data loss, and the source file is still never modified. The
  acceptance rule holds for ordinary reference imports; the exception is the
  opt-in copy mode, which is already documented as a separate source change.
- **Next step:** Fold the managed-copy choice into the import transaction, or
  provide an explicit “Remove imported pages and copy” action, when source
  storage and history are revisited in phase 11 (#191).
- **Related:** ADR 0012, phase 2 #183, phase 11 #191, `docs/limitations.md`.

### F-077 — An aliased re-export can resolve to the wrong function under Vitest

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 3 — undoable page reorder and insert
- **Severity:** P3
- **Area:** feature module surface / test tooling
- **Status:** accepted — the phase 3 collision is removed, the general rule is not enforced yet
- **Evidence:** `src/features/pageModel/index.ts` exported `insertPage` from
  `./pageList` and `insertPage as insertProjectPage` from `./appActions`. In a
  Vitest test, a named import of `insertPage as insertProjectPage` from
  `../src/features/pageModel` resolved to the **pageList** function (arity 2),
  while `import * as pageModel` exposed the correct `appActions` function
  (arity 3) and a direct import from `./appActions` was also correct. The esbuild
  transform of `index.ts` is correct (`insertPage2 as insertProjectPage`), so the
  production build is not implicated; the module runner is.
- **Problem:** A test that imports an aliased re-export whose original name is
  also exported from another module in the same index can silently exercise a
  different function with a compatible-looking signature. The first run of
  `tests/pageHistory.test.ts` called the model function with an app-action host
  and failed with a confusing `undefined` project.
- **Impact:** A false green or a misleading red is possible for any feature index
  that aliases a same-named export. No user-facing effect was found: the Pages
  context-menu insert action resolves correctly in the esbuild output.
- **Fix in scope:** `appActions.ts` now exports `insertProjectPage` and
  `reorderProjectPage` directly, so the index re-exports them without an alias.
  `tests/pageHistory.test.ts` calls the public name.
- **Next step:** audit the other `src/features/*/index.ts` alias re-exports
  (`reorderPages as reorderProjectPages`, `openRecoveryCenter as
  showRecoveryCenter`) and either rename the source functions or add a
  module-surface test that asserts each public alias is the expected function.
  Triage with the module-boundary gate work in #194/#195.
- **Related:** ADR 0013, `scripts/check-module-boundaries.mjs`, #184.

### F-078 — A scanned PDF page cannot be badged as missing OCR without reading it

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 4 — page status badges and filters
- **Severity:** P3
- **Area:** pages panel / OCR
- **Status:** accepted — the badge is limited to states the project can prove
- **Evidence:** `pageStatusBadges()` in `src/features/pageStatus/model.ts` emits
  **OCR missing** only when the page's document is a TIF with no stored OCR.
  Whether a PDF page is a scan is only known after `PdfTextIndex.page()` extracts
  its text layer, which the search index does lazily and only for pages the user
  searches or OCR runs on.
- **Problem:** A scanned PDF page with no OCR yet shows no OCR badge. Detecting it
  at render time would mean extracting the text layer of every rendered card,
  which defeats the on-demand thumbnail and page-size design.
- **Impact:** No false positives: a badge is only shown when the state is provable.
  The gap is discoverability for scanned PDFs until Search has visited the page.
- **Next step:** If the search index already knows a page's extracted text is
  empty, persist that as a rebuildable per-page hint (in the same shape as the OCR
  index) and let the badge read it. Triage with the search and OCR work, not with
  the page list.
- **Related:** #185, `src/search/ocr.ts`, `src/search/textIndex.ts`,
  `docs/limitations.md`.

### F-079 — Page keyboard commands cannot target the Pages-panel multi-selection

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 5 — page context menu and keyboard operations
- **Severity:** P3
- **Area:** pages panel / keyboard
- **Status:** accepted — the current page is unambiguous, the multi-selection is not
- **Evidence:** `PageMenuController.handleKey()` resolves the command target with
  `currentPageId(project, store.ui.page)`. The Pages-panel multi-selection lives
  in `PageReorderController.selection` and is deliberately session-only UI state;
  the store keeps the page order and the visible page, not the selected cards.
- **Problem:** `Alt+Shift+M`, `Alt+Shift+D` and `Alt+Shift+Delete` act on the page
  on screen. A user who selected five cards with `Ctrl`-click and presses a page
  shortcut edits only the current page. Dragging the same selection moves all
  five, so mouse and keyboard differ for the multi-selection case.
- **Impact:** No wrong page is edited: the command names and targets the current
  page, and the page menu is per card. The gap is only that a multi-selection has
  no keyboard equivalent for duplicate or delete, which neither action supported
  before this phase.
- **Next step:** Move the page selection into shared page-list state and let the
  page menu and shortcuts read it. Phase 6 (#187) unifies the Page, Layer and
  Markups list interactions and is the natural place for that decision.
- **Related:** #186, #187, ADR 0011, `src/features/pageReorder/controller.ts`.

### F-080 — Bulk duplicate and delete still act on one page

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 6 — unify Page, Layer and Markups list interactions
- **Severity:** P3
- **Area:** pages panel / structural edits
- **Status:** accepted — bulk structural page actions are deferred
- **Evidence:** `PageMenuController.handleKey()` now moves the whole Pages-panel
  selection through `moveTargets()`, but `Alt+Shift+D` and `Alt+Shift+Delete`
  still pass the current `PageId` to `actions.duplicatePage` and
  `actions.deletePage`. Both flows own a confirmation and a recovery checkpoint
  and delete/duplicate are explicit, non-undoable structural boundaries
  (ADR 0011).
- **Problem:** A user who selected several cards can move them together with the
  keyboard but cannot duplicate or delete them together. Mouse and keyboard are
  aligned for reorder only.
- **Impact:** No data is lost or mis-targeted: duplicate and delete name and act
  on the current page. The gap is convenience, not correctness.
- **Next step:** Add an explicit bulk duplicate/delete operation with one
  confirmation, one checkpoint and per-page ID cascades, plus invariant tests for
  items, layer page state, layer membership and the visible page. Do not fold it
  into the existing single-page flows without those tests.
- **Related:** #187, F-079, ADR 0011, `src/app/pageFlows.ts`,
  `src/features/pageModel/pageList.ts`.

### F-081 — Markups view favourites are local to one machine

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 6 — unify Page, Layer and Markups list interactions
- **Severity:** P4
- **Area:** Markups views / storage
- **Status:** accepted — schema 25 stays unchanged in this phase
- **Evidence:** `src/ui/markups/state.ts` stores pinned view IDs in
  `localStorage` under `gridscalr.ui.markups.pinned-views.v1.<projectId>`.
  `normalizePinnedViewIds()` drops IDs whose view no longer exists, and the
  project file is never written when a view is pinned.
- **Problem:** A favourite does not travel with a `.gridscalr` package or to
  another machine, unlike the saved view itself, which is project data.
- **Impact:** Pinning is a per-user convenience with no effect on the saved view,
  its filters or the table order. Two machines that pin the same views show the
  same list because the picker follows project order.
- **Next step:** If favourites should travel, add an optional `favourite` flag to
  `MarkupsView` in a schema-26 change with a deterministic migration and
  round-trip tests. Until then, keep the local store and document the difference.
- **Related:** #187, schema 25, `src/model/markups.ts`,
  `docs/project-file.md`.

### F-082 — Layer rows have no list or tree semantics

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 6 — unify Page, Layer and Markups list interactions
- **Severity:** P3
- **Area:** layers panel / accessibility
- **Status:** partly resolved in 10b — depth and expansion are exposed, full tree roles are deferred
- **Evidence:** `src/ui/layerList.ts` renders `.layer-group` containers with
  visible kind headings, `.layer-row` elements with `tabIndex = 0` and an item
  list below each expanded layer. No `role="tree"`, `role="treeitem"`,
  `aria-level` or `aria-setsize` is set, so assistive technology hears a sequence
  of buttons and inputs rather than a hierarchy.
- **Problem:** The keyboard and focus model now matches the other lists, but the
  layer/item hierarchy is not announced as a hierarchy. The later layer-folder
  work (#193) will deepen it.
- **Impact:** All controls remain reachable and labelled, and disclosure buttons
  expose `aria-expanded`. The gap is structural semantics, not operability.
- **10b update:** the panel now renders a real tree. Each row carries
  `data-layer-depth`, the visible indent, `aria-expanded` on a group and an
  accessible disclosure label that names the nested-layer and item counts; an
  inherited hidden or locked state is a visible text chip whose title names the
  ancestor, and the eye and lock buttons repeat that reason as their accessible
  name. `role="tree"` / `role="treeitem"`, `aria-level`, `aria-setsize` and a
  roving tabindex are still not set: every row keeps `tabIndex = 0` so `Tab`
  reaches each row, which is not the ARIA tree pattern. Adding the roles without
  the roving focus model would be a half-step, so it is deferred.
- **Next step:** Give the Layers panel the ARIA tree pattern in one change —
  `role="tree"`/`treeitem`, `aria-level`, `aria-setsize`/`aria-posinset` and a
  roving tabindex with `Home`/`End`/`ArrowLeft`/`ArrowRight` following the same
  rules as the existing row keys.
- **Related:** #187, #193, `src/ui/layerList.ts`, `src/ui/layers/layerRow.ts`,
  `src/ui/layers/rows.ts`.

### F-083 — Import provenance stores the source project ID, not its name

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 7 — import provenance in Properties and Markups
- **Severity:** P3
- **Area:** import provenance
- **Status:** deferred — schema 25 stays unchanged in this phase
- **Evidence:** `PageProvenance.sourceProjectId` is written from `source.id` in
  `src/app/projectImportFlows.ts` (`project_<uuid>`). The source project's
  `Project.name` is shown in the import picker and preflight but is not stored
  with the page.
- **Problem:** Properties and Markups can show a shortened stable identifier but
  not the human-readable source project name that the phase issue asked for.
- **Impact:** The revision, source page and import time remain unambiguous, and
  the identifier is stable across renames. A user must compare the ID with the
  source file, not the name.
- **Next step:** Decide whether to add an optional `sourceProjectName` to
  `PageRecord.provenance` (an additive field with normalization and
  round-trip tests) or wait for the schema-26 phase ([#193](https://github.com/MajorJohnDoe/gridscalr/issues/193)).
  Do not infer a name from the document name: it is the drawing, not the project.
- **Related:** #188, `src/features/importProvenance/`, `docs/project-file.md`,
  `docs/limitations.md`.

### F-084 — Unused-copy cleanup only inventories the top level of the drawings folder

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 8 — source availability and managed-copy cleanup
- **Severity:** P3
- **Area:** source storage / project doctor
- **Status:** accepted — a nested layout does not exist yet
- **Evidence:** `src-tauri/src/source_cleanup.rs` reads `<project>.drawings/`
  non-recursively and lists only regular `.pdf` files directly inside it.
  `classifyManagedCopies()` in `src/features/projectIntegrity/sourceModel.ts`
  protects a nested relative path if one is handed to it, but the listing never
  produces one.
- **Problem:** If a later change organises managed copies into subfolders, or a
  user moves a copy into one, those files are invisible to the cleanup list and
  cannot be deleted from the doctor.
- **Impact:** No deletion risk and no project corruption; only disk usage. The
  conservative listing is deliberate: a recursive walk could offer a file from
  an unrelated folder for deletion.
- **Next step:** If a nested managed-copy layout is introduced, list only the
  exact subfolders that layout defines and keep canonical path protection for
  the reference set. Do not replace this with a recursive walk of the folder.
- **Related:** #189, F-017, `docs/limitations.md`, `src-tauri/src/source_cleanup.rs`.

### F-085 — Repair availability comes from issue codes, not from a repair plan

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 9 — repair preview and filters in the project doctor
- **Severity:** P3
- **Area:** project integrity / project doctor
- **Status:** accepted — the dialog blocks the no-op
- **Evidence:** `availableRepairs()` in
  `src/features/projectIntegrity/repairPlan.ts` maps validator codes to a repair
  kind and does not see the project. A repairable code can therefore be offered
  while its repair plans zero changes, for example `missingActiveLayer` when the
  project has no layer that could become the fallback.
- **Problem:** The repair checkbox stays selectable with a `0` count, and the
  issue remains after the copy is saved. The dialog disables **Apply selected
  repairs** while the plan is empty, so nothing false is written, but the
  availability list itself is optimistic.
- **Impact:** No data loss and no misleading preview: counts come from the plan
  and the apply button refuses an empty plan. Only the offered control is noisy.
- **Next step:** If this becomes confusing on real damaged files, pass the planned
  change count into the dialog state and hide kinds with no planned changes.
  Do not reintroduce a per-kind clone on every render just to compute it.
- **Related:** #190, `src/features/projectIntegrity/repairPlan.ts`,
  `src/features/projectIntegrity/repairUi.ts`.

### F-086 — Duplicating a group does not copy its subtree

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 10a — layer hierarchy model
- **Severity:** P3
- **Area:** layers / layer hierarchy
- **Status:** resolved in 10b — `duplicateLayerSubtree()` copies the subtree
- **Evidence:** `duplicateLayer()` in `src/model/layers.ts` copies one layer,
  its `pageState` and its items, keeps the source `parentId`, and inserts the
  copy directly after the source in `project.layers`. It never copies children.
- **Problem:** With a hierarchy, duplicating a group produces an empty duplicate
  sitting beside the original while the original keeps its children. In a tree
  panel that reads as a broken copy, and a later drag of the copy cannot recover
  the lost children.
- **Impact:** No data loss: the source subtree is untouched and every ID stays
  valid. The result is only surprising, and phase 10a has no UI that can create a
  group, so no user can reach it yet.
- **Resolution:** phase 10b adds `duplicateLayerSubtree()` in
  `src/features/layerTree/operations.ts`. A layer without children still uses
  `duplicateLayer()`; a group copies every descendant, mints one fresh layer ID
  per copied layer and one fresh item ID per copied item, remaps the parent links
  inside the copy so nothing points at the source, inserts the copies directly
  after the source subtree and makes the copied root the active layer. The menu
  names the nested count and `tests/layerTreeOperations.test.ts` covers the IDs,
  the links, the item copies and the source subtree.
- **Related:** #193, ADR [0014](../adr/0014-layer-hierarchy.md),
  `src/model/layers.ts`, `src/features/layerTree/operations.ts`.

### F-087 — pdf.js reads named optional-content groups from the array form only

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 10b — Layers panel tree and nested OCG export
- **Severity:** P3
- **Area:** PDF export / optional content
- **Status:** accepted — documented limitation
- **Evidence:** Nested groups are written as heading dictionaries with `/Name`
  and a nested `/Order` in `/OCProperties /D /Order`, per ADR 0014 and ISO
  32000. pdf.js `parseNestedOrder` in `pdf.worker.mjs` only accepts an array
  whose first element is the group name, so a dictionary heading is skipped and
  the groups it contains are shown flat. Acrobat and most desktop readers read
  the dictionary form.
- **Problem:** In Firefox's built-in viewer the groups are all present and
  toggleable, but they are not nested with their parent group's heading.
- **Impact:** No content, toggle or determinism difference; only the presentation
  of the layer list in pdf.js-based viewers.
- **Next step:** Decide whether to emit the array form instead of, or in addition
  to, the heading dictionary when a reader-compatibility audit is paid for.
  Keep the nested structure test on the raw `/Order` tree either way.
- **Related:** #193, ADR [0014](../adr/0014-layer-hierarchy.md),
  `src/pdf/export/ocg.ts`, `tests/pdfExport.test.ts`.

### F-089 — RGBA TIFF transparency is flattened over white

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 12a — TIF decoding beyond CCITT G3/G4
- **Severity:** P3
- **Area:** TIF import / raster decoding
- **Status:** accepted — documented limitation
- **Evidence:** `compositeOverWhite()` in `src/io/tiff/decode.ts` composites the
  fourth sample onto white and emits `DeviceRGB`. A PDF image XObject has no
  alpha channel unless a separate `/SMask` is written.
- **Problem:** A greyscale or colour scan whose transparent areas are meant to
  show a page background is rendered on white instead. For drawing scans, which
  are opaque, the result is identical.
- **Impact:** No data loss for ordinary scans; a transparent overlay loses its
  alpha. The page never renders black, which was the AGENTS.md rule.
- **Next step:** If a real RGBA drawing appears, write an `/SMask` with the alpha
  sample and a `DeviceRGB` image, and test that the PDF viewer honours it.
  Prefer that over adding a new file format.

### F-090 — 16-bit TIFF samples are reduced to 8 bits

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 12a — TIF decoding beyond CCITT G3/G4
- **Severity:** P3
- **Area:** TIF import / raster decoding
- **Status:** accepted — documented limitation
- **Evidence:** `decodeStrip()` in `src/io/tiff/decode.ts` keeps the high byte of
  every 16-bit sample so a page becomes an 8-bit PDF image.
- **Problem:** A 16-bit greyscale or colour scan is displayed and exported with
  8 bits per component. For line drawings and scanned plans this is visually
  identical, but it is not a lossless copy of the source depth.
- **Impact:** The source TIF is never modified and the raw checksum stays on the
  document reference, so the original can be reopened elsewhere.
- **Next step:** Only if a measured requirement appears, emit 16-bit PDF image
  samples (big-endian) and keep the predictor in 16-bit sample space. The
  current decoder already handles the predictor at that width.

### F-091 — A decoded colour TIFF is stored as an embedded PDF and grows the project

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 12a — TIF decoding beyond CCITT G3/G4
- **Severity:** P2
- **Area:** TIF import / project file size
- **Status:** triaged #238
- **Evidence:** `createTiffDocumentRef()` base64-encodes the derived PDF into
  `DocumentRef.embeddedPdf`. CCITT scans stay near the source size, but a colour
  raster is Flate-compressed into one image per strip. A 25 megapixel RGB sheet
  at 300 DPI can still produce tens of megabytes of base64 in the project JSON.
- **Problem:** A project with several colour scans may approach the 256 MB
  project limit, and every save rewrites that base64. The 256 MB decoded-raster
  guard bounds memory during import, not the saved project size.
- **Impact:** No corruption: the write is validated and a project that is too
  large fails with the existing size message. The cost is disk size, save time
  and a lower practical page count for colour sets.
- **Next step:** Decide whether colour TIF sources should use reference storage
  (keep the TIF and render it at open time), a downsampled image, or JPEG
  compression for the derived PDF. Do not change the source-storage modes
  without an ADR; this phase keeps the existing embedded-PDF shape.

### F-092 — Horizontal differencing is refused below 8 bits

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 12a — TIF decoding beyond CCITT G3/G4
- **Severity:** P3
- **Area:** TIF import / raster decoding
- **Status:** accepted — explicit rejection
- **Evidence:** `assertDecodablePage()` rejects predictor 2 with 1-, 2- or
  4-bit samples through `tiff.predictorBits`, and `undoHorizontalPredictor()`
  implements 8- and 16-bit rows only.
- **Problem:** libtiff can write horizontal differencing for packed 2- and
  4-bit greyscale, so such a file is refused even though its uncompressed or
  LZW counterpart would import.
- **Impact:** The scan fails with an actionable message instead of producing a
  wrong image. No partial or black page is written.
- **Next step:** Add packed-sample predictor decoding if a real file appears;
  unpack the row to samples, add the left neighbour modulo `2^bits`, repack.
  Keep the 8/16-bit fast paths.

### F-093 — Tiled JPEG-in-TIFF needs a JPEG decoder

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 12b — JPEG-in-TIFF and tiled layouts
- **Severity:** P3
- **Area:** TIF import / JPEG decoding
- **Status:** accepted — explicit rejection
- **Evidence:** `assertJpegPage()` in `src/io/tiff/jpeg.ts` rejects a tiled page
  through `tiff.tiledJpegUnsupported`, while the tiled raster path in
  `src/io/tiff/tiles.ts` composes uncompressed, PackBits, LZW and Deflate tiles.
- **Problem:** A tiled JPEG TIFF stores one JPEG per tile, so composing the page
  needs a JPEG decoder. Passthrough per tile is not correct: each tile is a
  separate MCU grid and the PDF image must cover the whole page or band.
- **Impact:** Tiled JPEG scans are refused with an actionable message instead
  of rendering a partial or colour-shifted page. Stripped JPEG-in-TIFF and
  tiled non-JPEG TIFF both import.
- **Next step:** Only if a real tiled JPEG scan appears, add a bounded baseline
  JPEG decoder, compose tiles into bands, and re-encode each band with a fixed
  quality. That is a new codec family and needs its own issue and fixtures.

### F-094 — Old-style JPEG is supported only through a complete interchange stream

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 12b — JPEG-in-TIFF and tiled layouts
- **Severity:** P3
- **Area:** TIF import / JPEG decoding
- **Status:** accepted — explicit rejection
- **Evidence:** `pageRegions()` in `src/io/tiff/jpeg.ts` uses
  `JPEGInterchangeFormat` (tag 513) when it holds a complete stream, or full
  JPEG strips; otherwise it throws `tiff.jpegOldStyle`.
- **Problem:** The TIFF 6.0 old-style JPEG variant can also store abbreviated
  strips described by `JPEGQTables` (519), `JPEGDCTables` (520) and
  `JPEGACTables` (521). Those table references are not composed.
- **Impact:** A writer that emits only abbreviated old-style strips is refused
  with a message that asks for a new-style JPEG TIFF. The source file is never
  modified.
- **Next step:** If a real file appears, read the three table offsets, build the
  complete table set once, and join it to each strip like `JPEGTables`. Test it
  with a committed old-style fixture.

### F-095 — CMYK JPEG passthrough follows the stored sample convention

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 12b — JPEG-in-TIFF and tiled layouts
- **Severity:** P3
- **Area:** TIF import / colour
- **Status:** accepted — documented decision
- **Evidence:** `colorSpaceFor()` in `src/io/tiff/jpeg.ts` emits
  `DeviceCMYK` with no decode array when the stream has no Adobe APP14 marker,
  and the inverted `[1 0 1 0 1 0 1 0]` decode array when a plain Adobe CMYK
  marker (transform 0) is present. YCCK (transform 1 or 2) is rejected.
- **Problem:** The inversion convention is carried by the Adobe marker, not by
  the TIFF photometric tag. A writer that stores inverted CMYK without an Adobe
  marker cannot be told apart from a writer that stores plain CMYK.
- **Impact:** The committed CMYK fixture (Pillow, no marker) renders with its
  stored samples. A marker-carrying Adobe stream is inverted once. No re-encode
  or colour conversion is attempted, so a wrong source convention stays a
  source problem rather than a decoder guess.
- **Next step:** If a user reports inverted CMYK output, capture that file and
  decide whether to trust the photometric tag, the marker, or both, with a new
  fixture. Do not add a heuristic without a sample.

### F-096 — The import picker hides missing-source pages before the preflight can offer a relink

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 13 — Relink missing sources in import preflight
- **Severity:** P3
- **Area:** Project import / picker
- **Status:** triaged #237
- **Evidence:** `projectImportDialog()` disables a page checkbox when
  `available` is false, and `ProjectImportSource.checkAvailability()` marks a
  PDF unavailable when no candidate path exists. The preflight relink added in
  this phase therefore only appears when a file becomes unreadable between the
  picker check and `ensure()`, or when every page is skipped by the loader.
- **Problem:** A source project whose PDF was moved cannot put its pages into
  the selection at all, so the user never reaches the preflight that now offers
  **Relink…**. The picker's own **Locate…** button is the only path for that
  case.
- **Impact:** No data is lost and the existing picker locate still works. The
  preflight relink is a second safety net rather than the primary recovery
  path, which is narrower than the phase description suggests.
- **Next step:** Decide whether the picker should allow selecting pages from a
  missing document and defer the file to the preflight. That changes the
  picker's "select only available pages" rule and needs its own UI test and a
  user-guide update; do not change it as part of a relink fix.

### F-097 — The Rust budget gates file size, not module boundaries

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 14 — Rust source budget
- **Severity:** P3
- **Area:** tooling / Rust
- **Status:** triaged #239
- **Evidence:** `npm run check:file-budgets` now scans `src-tauri/src`, but it
  compares line counts only. `npm run check:modules` covers foundation feature
  `index.ts` surfaces in `src` and does not inspect Rust.
- **Problem:** A 399-line Rust module can still mix unrelated commands, and
  nothing mechanically proves that a new Tauri command lives in its own module
  rather than in an existing one that happens to be under budget.
- **Impact:** Size growth is blocked; module separation stays a review rule
  supported by `AGENTS.md` and the phase issue template.
- **Next step:** Decide whether a Rust module-boundary check is worth the
  maintenance, for example a `#[tauri::command]` inventory proving each command
  has its own module, or a reviewed clippy restriction lint. Do not add it
  silently inside a feature phase.

### F-098 — The schematics feature is outside the foundation boundary check

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 15 — model to feature boundary
- **Severity:** P3
- **Area:** architecture / tooling
- **Status:** triaged #239
- **Evidence:** `scripts/check-module-boundaries.mjs` lists only the foundation
  feature directories. `src/features/schematics/` has no `index.ts`, and about
  twenty modules (canvas, UI, PDF export, report and app flows) import
  `features/schematics/symbols/registry`, `model/fitDrawing`, `model/sheetTemplate`
  or `ui/*Dialog` directly.
- **Problem:** The pure symbol catalogue now lives in `src/model`, so the
  reversed dependency is gone, but the schematics feature still has no single
  public surface. A later change can rename or split its internals and break
  callers without `npm run check:modules` noticing.
- **Impact:** None today: the imports resolve and the feature is an upper layer.
  It is a consistency gap with ADR 0013, not a cycle.
- **Next step:** Give the schematics feature an `index.ts` surface, move the
  operation-card and sheet-rendering call sites to it, then add the directory to
  `FOUNDATION_FEATURES`. That is a refactor of its own because its modules are
  imported by PDF export and the canvas painter; do not fold it into a feature
  phase.
- **Related:** ADR [0013](../adr/0013-module-first-foundation.md).

### F-100 — The docs gate checks tool shortcuts only, not the action or workspace key tables

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 17 — documentation pass
- **Severity:** P3
- **Area:** tooling / documentation
- **Status:** triaged #239
- **Evidence:** `scripts/check-docs.mjs` compares `shortcuts.tools` from
  `src/ui/shortcuts.json` with `docs/shortcuts.md`. The `actions` map, the page,
  layer and Markups key tables, the in-app shortcut reference and the README
  shortcut table are not compared with the data file.
- **Problem:** A renamed or removed action key can leave the documentation
  describing a shortcut that no longer exists, and `check:docs` still passes.
- **Impact:** Documentation drift is caught only by review. The 0.25.0 pass
  checked the page, layer and list keys by hand.
- **Next step:** Extend the gate to read `shortcuts.actions` and a documented
  list-row expectation, or generate the shortcut tables from `shortcuts.json`.
  Generating the tables needs a stable grouping and a decision about the README
  copy before it can be automated.

### F-101 — The screenshot capture script is not exercised until a docs pass

- **Date:** 2026-11-12
- **Phase:** 0.25.0 phase 17 — documentation pass
- **Severity:** P3
- **Area:** tooling / documentation
- **Status:** triaged #239
- **Evidence:** CI runs `npm run check:docs` but never `npm run docs:capture`.
  The 0.25.0 layer tree changed the accessible names of the layer disclosure
  buttons to include "nested layers", so the capture script's
  `getByRole("button", { name: "Layers" })` locator became ambiguous and the
  capture failed until it was made exact.
- **Problem:** A UI change can break the screenshot capture weeks before the next
  documentation pass, and the failure is discovered only when someone needs the
  screenshots.
- **Impact:** The fix was two characters, but the same class of breakage can
  require a real rewrite of a capture step under release pressure.
- **Next step:** Decide whether to run `docs:capture` (or a screenshot dry run
  that writes to a temporary folder) in CI on a label or a scheduled job. It is a
  browser and font dependency that the current gate deliberately avoids.
