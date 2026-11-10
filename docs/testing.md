# Testing, fuzzing and visual review

GridScalr uses several test layers. Run the focused command for the area you
changed, then the full pre-commit list in `AGENTS.md` before a release.

| Command | Covers |
| --- | --- |
| `npm test -- --run` | Model, I/O, project-file, source-storage, report, PDF, geometry and package logic in Node, including `tests/robustness/`. |
| `npm run test:robustness` | The robustness gate only: seeded page and save sequences, concurrent and crash-safe writes, the schema 1–25 migration corpus, source storage and empty projects. |
| `npm run test:coverage` | The same suite with V8 coverage and the CI thresholds. |
| `npm run test:ui` | Playwright smoke flow through the browser fallback: open, measure, help, save and package menu state. |
| `npm run test:import` | Playwright import flow: thumbnail picker, page-scoped layers, undo, redo and source-file immutability. |
| `npm run test:canvas` | Pointer-level canvas gestures: draw, resize, rotate, text, locks, crop and split view. |
| `npm run test:count` | Count types, placement, pieces per object, Markups filtering and quantities. |
| `npm run test:touch` | Two-finger pan, pinch zoom, pen priority, palm rejection, long-press and one-finger count placement. |
| `npm run test:visual` | Browser and dialog pixel comparison against the committed documentation screenshots. |
| `npm run check:file-budgets` | Blocking line budgets for source files and the new foundation feature directories. |
| `npm run check:modules` | Foundation feature `index.ts` surfaces and deep-import boundaries from ADR 0013. |
| `npm run check:themes` | Theme token completeness and WCAG AA contrast checks for the five palettes. |
| `npm run theme:preview` | Captures the light and navy design previews from `docs/theme-preview/`. |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib` | Atomic saves, verified managed source copies, package create/inspect/extract, manifest limits, checksums, cancellation, ZIP traversal and symlinks. |
| `npm run bench:history` / `npm run bench:large` | Synthetic undo/history timing and the large-project reference benchmark documented in `docs/limitations.md`. |

`tests/pdfExport.test.ts` inspects the produced PDF bytes and objects for the
flattened drawing, optional-content groups (including pdf.js group resolution),
review annotation dictionaries and their off paths. `tests/saveIntegrity.test.ts`
covers conditional writes, conflicted copies, backups and the read-only
**Compare with disk version** summary, including unreadable disk data.

## Robustness gate

`npm run test:robustness` runs only `tests/robustness/`. The normal
`npm test -- --run` suite includes the same files, and CI runs the focused
command as a named step so a robustness failure is visible without reading the
full Vitest log.

| Suite | Protects |
| --- | --- |
| `pageIdentity.test.ts` | A seeded sequence of insert, reorder, duplicate, delete, import, source replacement, bulk edit, undo/redo, save and load. After every step it checks unique IDs, live item, layer-home and layer-page-state references, display page numbers, stable `PageId` bindings, operation-accounted counts and `validateProject()` errors. One import and one bulk edit are one undo step; structural page actions clear history and write checkpoints. |
| `saveConflict.test.ts` | Two writers against one project path. A stale stamp conflicts, the default conflicted copy preserves both versions, overwrite requires an explicit choice, a failed write keeps the previous file and the in-memory project valid, a deleted target is not recreated, and a no-op save does not rewrite. |
| `migrations.test.ts` | One committed fixture per schema 1–25. Each fixture uses that version's structure, migrates to schema 25, preserves its documents, pages, measurements, categories, assets and version-specific fields, produces deterministic page IDs, reports invalid references instead of dropping them, and proves schema 24 → 25 does not move source paths. |
| `sourceStorage.test.ts` | Reference versus managed mode, managed-copy identity, consolidation leaving the original bytes untouched, a changed reference being reported and never auto-accepted, a managed drawing included once in a package, empty project save/load/import, and page identity through reorder, delete and source replacement. |

The Rust `project_write` tests prove the conditional write rejects a changed
file, keeps the previous file when the replace step fails between the flushed
temporary file and the rename, treats a missing/empty expected hash as the
explicit overwrite path, ignores hash case, and rejects a second writer that
still holds the loaded stamp. The `source_copy` tests prove the source bytes
are unchanged after a verified copy.

The gate cannot prove a real cloud client racing between the final hash check
and the rename, or a process kill at every possible instruction. Those remain
documented limitations; the tests prove the application-level compare-and-swap
and the readable previous file.

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
