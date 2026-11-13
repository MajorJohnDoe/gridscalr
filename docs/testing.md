# Testing, fuzzing and visual review

GridScalr uses several test layers. Run the focused command for the area you
changed, then the full pre-commit list in `AGENTS.md` before a release.

| Command | Covers |
| --- | --- |
| `npm test -- --run` | Model, I/O, project-file, source-storage, report, PDF, geometry and package logic in Node, including `tests/robustness/`. |
| `npm run test:robustness` | The robustness gate only: seeded page and save sequences, concurrent and crash-safe writes, the schema 1–26 migration corpus, source storage and empty projects. |
| `npm run test:coverage` | The same suite with V8 coverage and the CI thresholds. |
| `npm run test:ui` | Playwright smoke flow through the browser fallback: open, measure, help, save, package menu state, and themed Layers inset surfaces (Light Green, System-light, Medium Grey and each dark palette). |
| `npm run test:import` | Playwright import flow: thumbnail picker, page-scoped layers, undo, redo and source-file immutability. |
| `npm run test:canvas` | Pointer-level canvas gestures: draw, resize, rotate, text, locks, crop and split view. |
| `npm run test:count` | Count types, placement, pieces per object, Markups filtering and quantities. |
| `npm run test:touch` | Two-finger pan, pinch zoom, pen priority, palm rejection, long-press and one-finger count placement. |
| `npm run test:visual` | Browser and dialog pixel comparison against the committed documentation screenshots. |
| `npm run check:file-budgets` | Blocking line budgets for frontend and Rust source files, with reviewed exceptions for legacy modules. |
| `npm run check:modules` | Foundation feature `index.ts` surfaces and deep-import boundaries from ADR 0013. |
| `npm run check:dependencies` | `npm audit` and `cargo audit` against the reviewed allowlist in `security/dependency-allowlist.json`; fails on a new moderate-or-higher advisory, an expired entry or a stale entry. |
| `npm run check:themes` | Theme token completeness (including the Layers inset surfaces) and WCAG AA contrast checks for the five palettes. |
| `npm run theme:preview` | Captures the light and navy design previews from `docs/theme-preview/`. |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib` | Atomic saves, verified managed source copies, package create/inspect/extract, manifest limits, checksums, cancellation, ZIP traversal and symlinks. Runs on the Ubuntu `rust` job and on all three `desktop` matrix entries, Windows and macOS included. |
| `npm run bench:history` / `npm run bench:large` | Synthetic undo/history timing and the large-project reference benchmark documented in `docs/limitations.md`. |

`tests/pdfExport.test.ts` inspects the produced PDF bytes and objects for the
flattened drawing, optional-content groups (including pdf.js group resolution),
review annotation dictionaries and their off paths. `tests/saveIntegrity.test.ts`
covers conditional writes, conflicted copies, backups and the read-only
**Compare with disk version** summary, including unreadable disk data.
`tests/modelBoundary.test.ts` walks `src/model` and fails, naming the file and
specifier, when an import resolves into `src/features`; it has no allowlist, and
`eslint.config.mjs` blocks the same import.

## File budgets

`npm run check:file-budgets` scans two independent scopes from one
`file-budgets.json` and fails on any file above its budget:

- the frontend: every `.ts` and `.css` file under `src`, default 700 lines, with
  tighter directory limits and per-file caps for legacy modules;
- the Rust shell: every `.rs` file under `src-tauri/src`, default 400 lines,
  target 300. `*_tests.rs` modules count because they belong to the same module
  surface. `target/`, `node_modules/`, `dist/` and generated files such as
  `src/i18n/types.generated.ts` are not counted.

New files must stay within the target and may never be added to an exception
list. An existing legacy module may keep a per-file exception, which is a cap:
the file may shrink but grows only through a reviewed change. Rust exceptions
must use the object form `{ "max": 2289, "reason": "…" }` so the review reason
is recorded next to the limit; a missing or too-short reason fails the check.
The committed Rust exceptions are `commands.rs`, `package.rs`,
`project_write.rs` and `source_copy.rs`.

`npm run check:file-budgets -- --update` raises an existing exception to the
current line count and prunes an exception whose file no longer exists (a stale
exception also fails a normal run). It refuses to create a new exception for a
file that is over budget, so a new Rust command must live in its own module
rather than growing `commands.rs` or `package.rs`. See ADR
[0013](adr/0013-module-first-foundation.md).

`tests/fileBudgetRules.test.ts` proves the pure rules in
`scripts/file-budget-rules.mjs`: a file within budget passes, a new oversized
file fails, `--update` may raise an existing exception, `--update` refuses a
new oversized file, a removed exception is stale, and every Rust exception
records a reason.

## Dependency gate

`tests/dependencyGate.test.ts` feeds synthetic npm and cargo reports to the pure
rules in `scripts/dependency-gate.mjs`: a new moderate, high or critical advisory
blocks, an accepted entry passes, an expired or stale allowlist entry fails, a
low finding is reported only, and an unreadable report fails closed.
`npm run check:dependencies` runs the same rules against the live npm registry
and RustSec advisory database.

## Autosave preference

`tests/appPreferences.test.ts` covers the stored shape: defaults, malformed and
per-field invalid input, migration from the pre-autosave shape without losing
language, CSV format or theme, and a round trip with the interval and enabled
flag. `tests/autosavePreference.test.ts` covers the session pause, the supported
interval choices and a fresh module start. `tests/sessionRecoveryController.test.ts`
drives the loop with fake timers and fake IndexedDB: enabled writes after the
debounce, the interval throttles repeated changes, turning autosave off or
pausing cancels a pending write, resuming writes the current revision, and an
explicit structural checkpoint is still written when autosave is off.

`tests/recoveryCenter.test.ts` covers the recovery center: grouping per project
and app instance, newest-first ordering, UTF-8 serialized size, preferred and
fallback selection, older/unknown/missing base-version labels, deletion of only
the selected record from the local store, and the empty-state dialog.

## Recovery byte budget

`tests/recoveryBudget.test.ts` covers retention under a byte budget. It asserts
the documented defaults are a multiple of the 8 MB reference snapshot, that a
persisted `serializedBytes` is used (and corrupt metadata is re-measured), and
that usage reports total and per-project bytes largest first. The pruning order
is tested directly: count overflow oldest first, oldest-first byte pruning,
checkpoints before an autosave at the same timestamp, cross-project pruning when
the origin budget is exceeded, per-project isolation, the newest-autosave and
newest-checkpoint guarantee, the record being written never being pruned, and a
project that alone exceeds the budget keeping its two newest records. The store
tests write large synthetic records through `writeRecord` with a small injected
budget, prove the pruning happens before the write completes, and mock a quota
failure on both `IDBObjectStore.put` and `localStorage.setItem` to prove the
write rejects with an `AutosaveError` whose message names the file save and the
recovery center.

## Project status popover

`tests/statusOverview.test.ts` covers the pure model and the rendered popover.
The model tests assert the save state (saved, unsaved, not saved to a file), the
available actions for clean, view-only, paused-autosave, disabled-autosave,
pending-warning and empty-recovery states, the desktop-only backup rule, and the
newest-backup and time-formatting helpers. The DOM tests render each combination
and check the localized rows, the disabled action with a tooltip, the action
routing and Escape dismissal. The controller tests prove the model reads the live
store, autosave preference and validation result, that the recovery summary
updates after a save, that the backup list is read exactly once per open, that
the browser fallback never reads it, and that a failed read still opens the
popover.

## Conflicted copies

`tests/conflictedCopies.test.ts` covers the strict file-name rule, the
folder-scoped entry filter, newest-first ordering, the total size and the delete
guards. It also drives the dialog and the full flow: opening a copy as its own
project without writing the original, comparing through the revision engine,
reporting an unreadable copy, the confirmed single-file delete, a cancelled
confirmation, the only-surviving-copy guard when the project file is missing, a
look-alike dropped from the desktop result, and a delete that leaves the file in
place. The Rust module has its own tests for the name parser, the folder scan,
the symlink refusal and the single-file delete.

## Robustness gate

`npm run test:robustness` runs only `tests/robustness/`. The normal
`npm test -- --run` suite includes the same files, and CI runs the focused
command as a named step so a robustness failure is visible without reading the
full Vitest log.

| Suite | Protects |
| --- | --- |
| `pageIdentity.test.ts` | A seeded sequence of insert, reorder, duplicate, delete, import, source replacement, bulk edit, undo/redo, save and load. After every step it checks unique IDs, live item, layer-home and layer-page-state references, display page numbers, stable `PageId` bindings, operation-accounted counts and `validateProject()` errors. One import, one reorder, one insert and one bulk edit are each one undo step; delete and duplicate clear history and write checkpoints. |
| `saveConflict.test.ts` | Two writers against one project path. A stale stamp conflicts, the default conflicted copy preserves both versions, overwrite requires an explicit choice, a failed write keeps the previous file and the in-memory project valid, a deleted target is not recreated, and a no-op save does not rewrite. |
| `migrations.test.ts` | One committed fixture per schema 1–26. Each fixture uses that version's structure, migrates to schema 26, preserves its documents, pages, measurements, categories, assets and version-specific fields, produces deterministic page IDs, reports invalid references instead of dropping them, proves schema 24 → 25 does not move source paths and schema 25 → 26 adds no hierarchy, and proves a schema-26 layer tree round-trips. |
| `sourceStorage.test.ts` | Reference versus managed mode, managed-copy identity, consolidation leaving the original bytes untouched, a changed reference being reported and never auto-accepted, a managed drawing included once in a package, empty project save/load/import, and page identity through reorder, delete and source replacement. |
| `adversarialInputs.test.ts` | The seeded path, archive, project and source-storage corpus described under [Adversarial path, archive and project corpus](#adversarial-path-archive-and-project-corpus): spelling variants, UNC, drive-relative and traversal names, case-variant duplicates, oversized and truncated input, managed-copy destinations, structured errors and the Rust guard inventory. |

The Rust `project_write` tests prove the conditional write rejects a changed
file, keeps the previous file when the replace step fails between the flushed
temporary file and the rename, treats a missing/empty expected hash as the
explicit overwrite path, ignores hash case, and rejects a second writer that
still holds the loaded stamp. It also proves a stale generated temporary sibling
is removed on the next save and that a fresh one is kept. The `source_copy` tests
prove the source bytes are unchanged after a verified copy, that a drawings
folder symlinked outside the project is refused, and that nothing is written
outside the project.

## Path and package hardening tests

`src-tauri/src/path_guard_tests.rs` covers the shared guard: protected source
paths and case variants, Windows drive case and UNC spellings, the `\\?\`
verbatim prefix, relative-path anchoring, distinct case-variant files, managed
folder containment, traversal spellings, a symlink escape, a symlinked project
folder that stays inside, empty and drive-relative targets, the bounded-read
boundary and stale temporary cleanup. `tests/writeGuard.test.ts` covers the
frontend counterpart, including `originalPath` protection and the managed-copy
folder as a protected root. `tests/sourceStorage.test.ts` covers the
out-of-folder warning and its doctor issue without rejecting a legitimate
reference. `package.rs` tests reject traversal, absolute, drive, UNC, backslash
and control-character entry names, an over-limit manifest total, and a
destination volume without free space.

The gate cannot prove a real cloud client racing between the final hash check
and the rename, or a process kill at every possible instruction. Those remain
documented limitations; the tests prove the application-level compare-and-swap
and the readable previous file.

### Rust tests on every desktop platform

The `rust` job runs `cargo fmt --check`, `cargo check` and `cargo test --lib` on
Ubuntu for fast feedback. The `desktop` job repeats `cargo test --lib` on
Ubuntu, Windows and macOS before it builds the shell, and its Windows and macOS
entries then run the packaged `--smoke-test`. The path guard encodes Windows and
macOS file-system rules, so it has to be exercised on those platforms rather
than inferred from a POSIX run.

`src-tauri/src/path_guard_windows_tests.rs` is compiled on Windows only (the
module is skipped elsewhere, so it may not depend on a POSIX path) and adds the
cases a Linux host cannot express. Every case works in its own
`std::env::temp_dir()` folder named with the process id and a counter, so a
parallel run and a rerun cannot collide:

| Case | Asserts |
| --- | --- |
| Verbatim prefix | `fs::canonicalize` returns a `\\?\` path and its `comparison_key()` equals the plain spelling of the same file, so a protected source stays protected. Deleting the verbatim-prefix branch in `comparison_key()` fails this test on every Windows run. |
| Case-insensitive volume | The `PLAN.PDF` spelling of an existing `Plan.pdf` is refused by the write guard. A case-sensitive NTFS folder, which stores two files, falls back to asserting the case-folded comparison key. |
| Trailing dot and space | `Plan.pdf.` and `Plan.pdf `, which Win32 resolves to `Plan.pdf` when it opens the file, are refused as the protected source. |
| Drive-relative | `C:Plan.pdf` and `C:Drawings\Plan.pdf` are rejected as `invalidPath`; a rooted `C:\…` spelling still reaches the normal source comparison. |
| UNC prefix | `\\server\share` and `//SERVER/Share` produce one case-folded key, and the `\\?\UNC\…` spelling equals the plain one. |
| Junction | A drawings folder created with `mklink /J` that points outside the project is refused by `ensure_inside_root()` and by the write guard. When the host cannot create the junction the test asserts that `mklink` recorded a reason, prints it and returns; the verbatim-prefix case above always covers canonicalization on Windows. |

Two existing Rust assertions compared a native path with a `/`-separated
literal, which only held on Linux. They now compare whole path components, so
the Windows and macOS entries test the same behavior as the Linux one.

## Fuzzing

`tests/fuzz.test.ts` uses a deterministic, seeded PRNG with no external
dependency. It covers:

- arbitrary JSON passed to `parseProject`;
- randomly mutated valid projects, including document, asset, layer, page and
  metadata fields;
- arbitrary and mutated package manifests;
- unsafe archive file names, duplicate entries and reserved names;
- extracted-project document links;
- generated archive names and document paths for random names.

A failure is reproducible from the seed constants in the file (`0x5eed1` and
following). Add a seed or a focused regression case when a new parser branch is
introduced. The Rust package tests cover archive-level traversal, symlinks,
encrypted entries, duplicate names, entry-count limits, oversized entries,
checksum mismatch and cancellation.

### Adversarial path, archive and project corpus

`tests/robustness/adversarialInputs.test.ts` is the file-safety corpus. It runs
in the normal suite and in `npm run test:robustness`, takes about one second and
uses the seeded generators in `tests/helpers/fuzz.ts`; no external dependency and
no new runner. A failure names the seed and case, so it reproduces from the
constants alone.

| Seeded from | Covers |
| --- | --- |
| fixed corpus | Every spelling of a protected source: stored form, both separator directions, trailing separator, upper/lower case, the `\\?\` verbatim prefix and the verbatim UNC prefix. Each must be refused, and a sibling file must stay writable. |
| `0x17101` | Every destination inside a `<project>.drawings` folder, including generated leaves and all their spellings. |
| `0x17102` | Generated reference/managed document mixes: every document `path`, every managed copy and every `originalPath` is refused, the protected list has no duplicates or blank entries, and the copy command's own drawings folder is writable. |
| `0x17201` | Package manifest entries generated from traversal, absolute, UNC, drive, backslash, control-character and oversized fragments. Accepted entries must be exactly one safe leaf inside their `documents/`, `exports/` or `source-scans/` prefix. |
| `0x17202` | `documentArchivePaths()` for adversarial drawing names: one `documents/<leaf>` per archive entry, no separators, no traversal segment, no control character. |
| `0x17301` | `portableProjectJson()`: no absolute path, no `originalPath` and no sender-relative path travels inside a package, and the packaged project re-validates. |
| `0x17302` | `validatePackagedProjectJson()`: an accepted `relativePath` is a single `documents/<leaf>` link. |
| `0x17401` | Save → load round trips of generated documents with adversarial `path`, `relativePath`, `originalPath`, `sha256` and storage mode: unique IDs, no dangling page references, no `validateProject()` error, and every parsed source path stayed protected. |

The corpus asserts the invariants, not that parsing succeeds:

- **No write escapes the roots the app owns.** Archive paths are one leaf under
  `documents/`, the extracted project may only link to `documents/<leaf>`, and
  the copy destination stays inside `<project>.drawings`.
- **A source PDF/TIF is never modified.** Every spelling of a document path, a
  managed copy and its `originalPath` is refused by the write guard; drive
  relative targets are rejected instead of guessed.
- **A managed copy is only written inside its drawings folder.** Every other
  protected source is refused for the copy command and the folder itself stays
  the only writable root.
- **Rejected input is a structured error.** A rejected manifest or project is a
  plain `Error` with a catalog message, never a `TypeError`, a stack-shaped
  internal message or an empty description; `normalizePackageFailure()` and
  `describeCommandError()` handle every structured and unstructured value
  without throwing.
- **Oversized and truncated input fails closed.** Truncated project JSON is
  reported as an invalid file, and the frontend limits in `src/io/limits.ts` are
  compared with the Rust `path_guard.rs` and `package.rs` constants so the two
  boundaries cannot drift.

The Rust-only boundary is covered by `cargo test`: symlink rejection during
inspection and extraction, a symlinked drawings folder that resolves outside the
project, traversal entry names, the per-entry and total size caps, and stale
temporary cleanup. The corpus also asserts that those guard calls are still
wired (`ensure_inside_root` for the drawings folder, `validate_entry_name` before
both inspection and writing, `is_symlink()` in both loops, and the shared size
constants), so deleting one fails a normal-suite test.

Deliberately not covered: the frontend guard is textual (F-047), so a `..`
spelling is resolved only by the canonicalising Rust guard; the browser fallback
cannot compare file identities; and Windows 8.3 short-name aliases and alternate
data streams are not exercised (F-036 covered the junction and verbatim-prefix
cases in 0.27.0 phase 4, #199).

## Visual regression

`npm run test:visual` captures four stable screens from the demo project:

- the main shell with a selected markup (`hero.png`);
- the Markups and Layers panels (`markups.png`);
- the Quantities dialog (`quantities.png`);
- the Count types dialog (`count-types.png`).

The baselines live in `tests/visual/`. The script loads the bundled Liberation
Sans regular, bold and italic faces as the UI `Inter` family, so font
rasterisation is stable between CI and a developer machine. It waits for fonts
and finite animations before capture, then compares via a canvas in Chromium.
Default tolerance is 300 differing pixels and a maximum channel delta of 12,
which absorbs sub-pixel antialiasing but fails on layout, colour and label
changes. Override only for diagnosis:

```bash
GRIDSCALR_VISUAL_MAX_PIXELS=500 GRIDSCALR_VISUAL_MAX_DELTA=16 npm run test:visual
```

On failure, `visual-regression-failures/` receives the actual and diff PNGs and
CI publishes them as an artifact. Do not raise the tolerance to make a real
change pass.

### Updating baselines

An intentional UI change updates the visual baselines explicitly:

```bash
npm run test:visual -- --update
```

Review every changed baseline before committing it. A change that differs from the
previous commit should be explained in the pull request. Documentation
screenshots are separate and are refreshed with `npm run docs:capture`; the final
release pass uses `GRIDSCALR_DOCS_STRICT=1 npm run check:docs`.

## What still needs manual visual review

The browser fallback cannot cover everything. Check these by hand on the desktop
build, ideally on Windows, macOS and Linux:

- native file dialogs, recent-file menus, drag-and-drop and file association;
- password prompts, Tauri window chrome and single-instance behaviour;
- OS display scaling at 125–200 %, mixed-DPI monitors and system font
  differences;
- pen and touch hardware, palm rejection and long-press menus;
- canvas rendering near the minimum and maximum zoom, very large pages and
  progressive PDF page loading;
- PDF, PNG, CSV and XLSX outputs opened in their target applications;
- project packages extracted manually with the system archive tool;
- English and Swedish UI at narrow and wide window sizes.

If a change affects one of these paths, record the device, OS, scale and result in
the pull request.
