# Testing, fuzzing and visual review

GridScalr uses several test layers. Run the focused command for the area you
changed, then the full pre-commit list in `AGENTS.md` before a release.

| Command | Covers |
| --- | --- |
| `npm test -- --run` | Model, I/O, project-file, source-storage, report, PDF, geometry and package logic in Node, including `tests/robustness/`. |
| `npm run test:robustness` | The robustness gate only: seeded page and save sequences, concurrent and crash-safe writes, the schema 1–28 migration corpus, source storage and empty projects. |
| `npm run test:coverage` | The same suite with V8 coverage and the CI thresholds. |
| `npm run test:ui` | Playwright smoke flow through the browser fallback: open, measure, help, save, package menu state, and themed Layers inset surfaces (Light Green, System-light, Medium Grey and each dark palette). |
| `npm run test:import` | Playwright import flow: thumbnail picker, page-scoped layers, undo, redo and source-file immutability. |
| `npm run test:canvas` | Pointer-level canvas gestures: draw, resize, rotate, text, locks, crop and split view. |
| `npm run test:count` | Count types, placement, pieces per object, Markups filtering and quantities. |
| `npm run test:touch` | Two-finger pan, pinch zoom, pen priority, palm rejection, long-press and one-finger count placement. |
| `npm run test:a11y` | Automated axe check of the shell, the shipped dialogs and the custom-fields and placed-table inspector sections; serious and critical violations fail. |
| `npm run test:touch-targets` | Every visible control on the shell, Layers, Markups and the main dialogs is at least 24 × 24 CSS px with an emulated coarse pointer. |
| `npm run test:ui-scale` | The shell, menus and dialogs stay usable at 100 %, 150 % and 200 % UI scale. |
| `npm run check:performance` | The deterministic reference project against the budgets in [`limitations.md`](limitations.md). |
| `npm run test:visual` | Browser and dialog pixel comparison against the committed documentation screenshots. |
| `npm run check:file-budgets` | Blocking line budgets for frontend and Rust source files, with reviewed exceptions for legacy modules. |
| `npm run check:modules` | Foundation feature `index.ts` surfaces, deep-import boundaries from ADR 0013, and the Rust command cap and module wiring in `rust-commands.json`. |
| `npm run check:docs` | Links, anchors, images, tool coverage, schema references, screenshot freshness, and the shortcut tables in `docs/shortcuts.md` and `README.md` against `src/ui/shortcuts.json`. |
| `npm run test:docs-capture` | The documentation screenshot steps and locators, written to a temporary folder instead of `docs/screenshots/`. Runs in `docs-capture.yml` weekly, on demand and on a `docs-capture` label. |
| `npm run check:dependencies` | `npm audit` and `cargo audit` against the reviewed allowlist in `security/dependency-allowlist.json`; fails on a new moderate-or-higher advisory, an expired entry or a stale entry. |
| `npm run check:actions` | Every remote `uses:` reference in `.github/workflows` is a 40-character commit SHA with a `# <version>` comment, and one action release never carries two SHAs. |
| `npx vitest run tests/releaseArtifactCheck.test.ts` | The release-artifact rules: universal versus thin `lipo` output, bundle identity, `Info.plist` version, checksum listings, and the release workflow wiring that runs them. |
| `npm run check:themes` | Theme token completeness (including the Layers inset surfaces) and WCAG AA contrast checks for the five palettes. |
| `npm run theme:preview` | Captures the light and navy design previews from `docs/theme-preview/`. |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib` | Atomic saves, verified managed source copies, package create/inspect/extract, manifest limits, checksums, cancellation, ZIP traversal and symlinks. Runs on the Ubuntu `rust` job and on all three `desktop` matrix entries, Windows and macOS included. |
| `npm run bench:history` / `npm run bench:large` | Synthetic undo/history timing and the large-project reference benchmark documented in `docs/limitations.md`. |

`tests/pdfExport.test.ts` inspects the produced PDF bytes and objects for the
flattened drawing, optional-content groups (including pdf.js group resolution),
review annotation dictionaries and their off paths. `tests/saveIntegrity.test.ts`
covers conditional writes, conflicted copies, backups and the read-only
**Compare with disk version** summary, including unreadable disk data.
`tests/tiffStoragePolicy.test.ts` pins the TIF storage decision from
[ADR 0015](adr/0015-colour-scan-storage.md): every CCITT strip stays
byte-for-byte identical to the source with no raster growth, a decoded colour
page stays `/FlateDecode` rather than a JPEG re-encode, and the derived PDF is
embedded as base64. A change to the storage mode must update that test and the
ADR together.
`tests/modelBoundary.test.ts` walks `src/model` and fails, naming the file and
specifier, when an import resolves into `src/features`; it has no allowlist, and
`eslint.config.mjs` blocks the same import.

## Module boundaries and the Rust command cap

`npm run check:modules` owns two boundaries. The frontend half is ADR 0013:
every foundation feature has an `index.ts`, files outside a foundation feature
import only that surface, and a feature never reaches into another feature's
internals. The Rust half is the command cap from F-097:

- `rust-commands.json` sets `defaultMax` to 2 and records a reviewed
  `{ "max", "reason" }` count for each module above it. A module that gains a
  command over its cap fails, and so does an exception whose file no longer
  exists.
- every `.rs` file in `src-tauri/src` must be declared by another module, either
  as `mod <name>;` or through `#[path = "<name>.rs"]`, so an orphaned or renamed
  module cannot sit unreachable.

The cap is a boundary, not a cohesion proof: raising it needs a reason that says
why the module still owns one concern. `scripts/rust-module-rules.mjs` holds the
rules and `tests/rustModuleRules.test.ts` proves the default cap, a reviewed
exception, a too-short reason, a stale exception, an undeclared module, and the
shipped tree itself.

## Documentation gates

`npm run check:docs` runs the documentation half of the tooling gates. Besides
links, anchors, images and the schema reference it pins the shortcut tables
(F-100):

- `scripts/shortcut-catalogue.mjs` lists every documented shortcut row, the
  table it belongs to and the `tools`/`actions` keys it must quote.
  `src/ui/shortcuts.json` is the single source for the bindings.
- A renamed binding, a row added to one document and not the catalogue, a row
  removed from a document, a binding no table documents, a duplicate row and a
  code a cell quotes that is no longer a current binding all fail.
- The Pages, Layers and Markups keys and the `Ctrl+Y` redo alias live in code
  rather than in `shortcuts.json`, so they are listed as unbound codes and their
  documented text is pinned instead of the binding (F-112).

`tests/shortcutDocs.test.ts` proves each of those failures and checks the shipped
`docs/shortcuts.md` and `README.md` against `src/ui/shortcuts.json`.

The screenshots have a second, cheaper gate than a full recapture.
`npm run test:docs-capture` runs the same ordered steps and the same locators as
`npm run docs:capture`, but writes the PNGs to a temporary folder and leaves
`docs/screenshots/` and its manifest untouched. A renamed panel, a changed
accessible name or a removed dialog fails the run with the locator that broke,
which is the case that broke the 0.25.0 documentation pass (F-101).
`.github/workflows/docs-capture.yml` runs it weekly, on demand and on a pull
request labelled `docs-capture`; it is deliberately not part of every pull
request because it needs Chromium and takes minutes. The full capture and the
review of the changed images remain a documentation pass.

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
| `migrations.test.ts` | One committed fixture per schema 1–28. Each fixture uses that version's structure, migrates to schema 28, preserves its documents, pages, measurements, categories, assets and version-specific fields, produces deterministic page IDs, reports invalid references instead of dropping them, proves schema 24 → 25 does not move source paths, schema 25 → 26 adds no hierarchy, schema 26 → 27 keeps every TIF's embedded PDF byte for byte without adding a cache marker, and schema 27 → 28 adds only empty field/space/schedule arrays and default summary cards. `tests/schema28.test.ts` covers the new entities, custom values, placements, determinism, invalid-reference reporting and doctor repairs; `tests/derivedPdf.test.ts` covers the schema 27 cache marker, its key rule and its validation codes. |
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
| Verbatim prefix | `fs::canonicalize` returns a `\\?\` path whose `comparison_key()` equals the same path without the prefix, and `resolved_path()` reaches that key from the spelling built out of `%TEMP%` (an 8.3 short name such as `RUNNER~1`, which the canonical prefix expands). Deleting the verbatim-prefix branch in `comparison_key()` fails this test on every Windows run. |
| Case-insensitive volume | The `PLAN.PDF` spelling of an existing `Plan.pdf` is refused by the write guard. A case-sensitive NTFS folder, which stores two files, falls back to asserting the case-folded comparison key. |
| Trailing dot and space | `Plan.pdf.` and `Plan.pdf `, which Win32 resolves to `Plan.pdf` when it opens the file, are refused as the protected source. |
| Drive-relative | `C:Plan.pdf` and `C:Drawings\Plan.pdf` are rejected as `invalidPath`; a rooted `C:\…` spelling still reaches the normal source comparison. |
| UNC prefix | `\\server\share` and `//SERVER/Share` produce one case-folded key, and the `\\?\UNC\…` spelling equals the plain one. |
| Junction | A drawings folder created with `mklink /J` that points outside the project is refused by `ensure_inside_root()` and by the write guard. When the host cannot create the junction the test asserts that `mklink` recorded a reason, prints it and returns; the verbatim-prefix case above always covers canonicalization on Windows. |

Running the suite on the other two platforms found three Linux-only assumptions,
all fixed here:

- `source_copy.rs` and `source_cleanup_tests.rs` compared a native path with a
  `/`-separated literal. They now compare whole path components.
- A protected source spelled with a `..` component was only refused when the
  process directory needed no symlink resolution. The macOS temporary folder is
  behind `/var` → `/private/var`, so `resolved_path()` skipped the canonical
  prefix for that spelling and the guard allowed the write. `resolved_path()`
  now resolves `.` and `..` before the file system is asked, and
  `rejects_a_traversal_spelling_that_crosses_a_symbolic_link` builds the
  symlinked root itself so the case is covered on every Unix host.
- A `source_copy` assertion compared two spellings of one path as strings; it
  now compares them as paths.

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

## Accessibility, touch-target, UI-scale and performance gates

These four gates turn the 1.0 quality items that used to be manual review into
CI steps. They run in the `frontend` job of `.github/workflows/ci.yml`, after
Chromium is installed, and each one is a separate named step so a failure is
visible without reading the full log. Their baseline results are recorded in the
release pull request and the release notes; they are part of the release
checklist in [`releasing.md`](releasing.md).

### Automated accessibility check

`npm run test:a11y` opens the demo project in the browser fallback, injects
`axe-core` through `@axe-core/playwright` and analyses fifteen surfaces:

| Surface | What is opened |
| --- | --- |
| Main shell | The shell with the demo project, without a dialog |
| Project settings dialog | `Ctrl/Cmd+,` |
| Preferences dialog | **Settings → Preferences…** |
| Quantities dialog | `Ctrl/Cmd+Alt+Q` |
| Drawing export dialog | **File → Export → Drawing PDF…** |
| Spaces register dialog | **View → Spaces…** |
| Help dialog | `F1` |
| Custom fields dialog | **Project settings → Fields → Manage fields…** |
| Custom fields inspector section | Select a measurement; the **Fields** section in Properties |
| Summary dock tab | `Ctrl/Cmd+Alt+S`, with seeded roles and schedules |
| Place schedule dialog | **Place on drawing…** with a stored schedule selected |
| Placed table inspector section | Select the seeded placed table; its section in Properties |
| Schedule builder dialog | **New schedule…** in the Summary tab |
| Schedule CSV import dialog | **Import CSV…** with a stored one-row-per-item schedule selected |
| Summary roles dialog | **Summary roles…** in the Summary tab |

A **serious** or **critical** axe violation fails the run. Moderate, minor and
best-practice findings are printed with their target and are not hidden: there is
no allowlist, so a new serious rule fails immediately. The script also asserts
that each dialog receives focus when it opens, that every palette/surface pair
ran, and that the run raises no page errors.

Each of the 5 palettes — **Medium Gray**, **Light Green**, **Dark Gray**, **Jade**
and **Navy** — runs the same fifteen surfaces, so the gate records 75 palette/surface
checks. The palette is chosen through **Settings → Preferences…**, which is
itself one of the checked surfaces. A contrast regression in any palette fails the
run, and `check:themes` pins the same text-on-surface pairs at the token level.

The freehand canvas has no DOM model for axe to inspect. It is covered by the
manual checklist below, not by this gate; full screen-reader support for freehand
drawing is an explicit non-goal for 1.0.

`tests/accessibilityGate.test.ts` proves the impact split, the no-allowlist rule,
the documented surface list and the theme × surface matrix.

### Touch-target check

`npm run test:touch-targets` creates a Playwright Chromium context with
`hasTouch: true`. That is the stable way to make the browser report
`(pointer: coarse)`; the script asserts that the media query matches and measures
the layout the real CSS produces instead of overriding `matchMedia`.

Every visible control on the shell, the expanded Layers panel, the Markups panel,
the Project settings, Preferences and Quantities dialogs, and the Custom fields,
Spaces register and Custom fields inspector sections must measure at least
**24 × 24 CSS px**, the WCAG 2.2 AA Success Criterion 2.5.8 minimum:

- a checkbox or radio is measured through its wrapping label, because the label
  is the clickable target;
- the layer colour swatch is measured as the button it exposes, not the
  `aria-hidden` colour input behind it;
- the coarse-pointer rules live in `src/styles/responsive.css`. The mouse layout
  is deliberately denser and is unchanged, so the visual baselines do not move.

A failure prints the surface, control, measured size and the minimum. Raise the
control in the `(pointer: coarse)` block; do not lower
`TOUCH_TARGET_MIN_PX` in `scripts/accessibility-rules.mjs`.

### UI-scale check

`npm run test:ui-scale` emulates OS scaling as the CSS viewport a 1920 × 1080
window leaves at each scale:

| OS scale | CSS viewport | What is asserted |
| --- | --- | --- |
| 100 % | 1920 × 1080 | No shell overflow, menus and dialogs inside the window, canvas at least 240 px |
| 150 % | 1280 × 720 | The same |
| 200 % | 960 × 540 | The same, including the File menu and its Export submenu |

At each scale the check asserts that the document does not scroll horizontally,
the top bar, context bar, Pages/Layers panel, Properties panel and status bar do
not clip their content, the canvas keeps at least 240 CSS px, every menu item
stays inside the window, and the Project settings, Custom fields, Spaces, Help,
Schedule builder, Place schedule and Schedule CSV import dialogs open entirely
inside the viewport. It also opens the Summary tab with a seeded room and
measurement schedule and checks the placed-table inspector section for
horizontal overflow. A menu that is taller than the window scrolls inside its
panel (`max-height: calc(100vh - 16px)`), which keeps its last item reachable at
200 %.

Fractional device scaling, mixed-DPI monitors and real OS text scaling are not
observable in the browser fallback; they stay in the manual review list below.

### Performance budget check

`npm run check:performance` runs the large-project harness against the budgets in
[`limitations.md`](limitations.md):

```bash
GRIDSCALR_PERF_PROFILE=reference npm run check:performance   # 150 pages, 15 000 items
npm run check:performance                                    # CI profile: 40 pages, 4 000 items
```

Both profiles use the same absolute budgets: p95 edit latency under 100 ms,
project open under 10 s, autosave under 2 s, page switch under 100 ms and UI
freeze (Markups open) under 2 s. The CI profile is a quarter of the reference
project so the step stays under a minute; it still exercises the same store,
history, serialization and virtualised panel paths. Autosave is measured end to
end against the stored recovery record, so the 900 ms debounce and the IndexedDB
write are both included. A missing measurement fails: an unmeasured budget is not
a passed budget.

The 2 GB desktop working set is not measurable from the browser fallback. It
stays a manual check on the packaged app and is recorded in the release pull
request. `tests/performanceBudget.test.ts` pins the numbers in this section to the
table in `limitations.md`.

### Release artifact verification

The `Release build` workflow verifies the artifacts it produces, because the
release binary cannot run the debug-only smoke harness (F-037, F-074):

- `scripts/verify-macos-bundle.mjs` runs on the macOS runner after staging. It
  mounts the DMG with `hdiutil attach`, inspects `GridScalr.app` and
  `Contents/MacOS/gridscalr`, requires `lipo -info` to report `x86_64` and
  `arm64`, matches `CFBundleShortVersionString` to `package.json`, checks
  `SHA256SUMS-macos.txt` against both staged files, repeats the bundle checks on
  the extracted `.app.zip`, and detaches the image even when a check fails.
- `scripts/verify-release-checksums.mjs` runs in the `checksums` job. It
  recomputes every downloaded artifact's SHA-256 and requires the merged
  `SHA256SUMS.txt` to list each file once with the matching hash, including the
  DMG and `.app.zip`.

Both CLIs are thin wrappers over `scripts/release-artifact-rules.mjs`, so the
decisions are testable without macOS: `tests/releaseArtifactCheck.test.ts`
proves that a thin binary, a missing bundle, a wrong bundle identity, a stale
version, a missing macOS artifact, a wrong hash and an unlisted file are all
rejected, and that the release workflow keeps the two checks and never runs
`--smoke-test` against a release binary. The tool calls themselves only run in
the release workflow. A physical macOS install stays unverified; see
[`limitations.md`](limitations.md).

### Manual accessibility checklist (canvas and keyboard)

Run this by hand on the desktop build for a release candidate, ideally once with
a screen reader enabled, and record the result in the release pull request.
Check each row in both English and Swedish, and at 100 % and 200 % UI scale.

| Area | Check |
| --- | --- |
| Keyboard reaches the chrome | `Alt` or `F10` opens the menu bar, arrow keys move between menus and items, `Escape` closes without losing focus. Every top-bar button, tool-rail button, dock tab and status-bar control is reachable with `Tab` in a sensible order. |
| Focus is always visible | The focus ring is visible on the menu bar, tool rail, dock tabs, page cards, layer rows, Markups rows, inspector fields, status chips and dialog buttons in all five themes. Zooming the canvas does not hide the ring. |
| Dialog focus contract | A dialog moves focus inside on open, `Tab` and `Shift+Tab` stay inside it, `Escape` closes it and focus returns to the control that opened it. The safe action is focused by default where one exists (for example **Save** in the unsaved-changes prompt). |
| Shortcuts do not trap typing | Shortcuts fire on the canvas and in the Markups and Layers lists, but typing in a text field, the inline editor, a rename field or a number input never triggers a tool or command. `Delete` and `Ctrl/Cmd+Z` act on the focused list. |
| Canvas landmarks | The canvas exposes a name and role, the reference pane and the split divider are announced, and the split divider is keyboard-adjustable. A screen reader can find the canvas and its page context even though it cannot describe freehand geometry. |
| Draft and selection feedback | The draft preview, snap indicator, selection outline, resize/rotate handles and marquee are visible against both light and dark drawings and are not conveyed by colour alone. Selection and hover states survive at 200 % zoom. |
| Hidden and locked items | Hidden items and layers cannot be selected with the keyboard, the hit test or the marquee, and locked items stay visible but refuse move, edit and delete. Hidden and locked layer rows announce their state. |
| Text and labels | Measurement labels, callout text, stamp text and layer names stay legible at the smallest allowed zoom and at 200 % UI scale; user-chosen item colours are allowed to fall below 4.5:1 because they are drawing content, but the label plate keeps its own contrast. |
| Touch and pen | Long-press opens the item menu, two-finger pan and pinch zoom work on both canvases, a pen hit suppresses a following palm touch, and every control meets the 24 × 24 target from the automated check. |
| Canvas non-goals | Freehand geometry, measurement values and drawing content are not announced node by node. The status bar position and the Markups table are the accessible readouts; do not file the lack of a geometry screen reader as a bug. |


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
