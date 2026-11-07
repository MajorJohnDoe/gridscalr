# Refactor follow-ups and themes after 0.20

**Status:** proposed 2026-11-07. Reviewed against the codebase after the 0.20
pointer, item-renderer and integration-module work.
**Scope:** behaviour-preserving splits of the PDF exporter, inline editors and the
remaining `App.ts` flows, plus the deferred light, grey and navy theme
implementation.
**Related:** [#126](https://github.com/MajorJohnDoe/gridscalr/issues/126),
[#127](https://github.com/MajorJohnDoe/gridscalr/issues/127),
[#128](https://github.com/MajorJohnDoe/gridscalr/issues/128),
[#129](https://github.com/MajorJohnDoe/gridscalr/issues/129),
[#52](https://github.com/MajorJohnDoe/gridscalr/issues/52),
[#23](https://github.com/MajorJohnDoe/gridscalr/issues/23),
[#63](https://github.com/MajorJohnDoe/gridscalr/issues/63),
[#62](https://github.com/MajorJohnDoe/gridscalr/issues/62),
ADR [0008](../adr/0008-integration-module-boundaries.md),
ADR [0009](../adr/0009-canvas-pointer-and-item-modules.md).

If the code and this plan disagree, stop and surface the conflict rather than
silently choosing one.

## 1. Goal

Continue the module-boundary work without changing user behaviour:

- make the PDF exporter reviewable by item family instead of one 1,885-line file;
- separate the inline editor sessions so text, labels and annotations can be
  tested and changed independently;
- finish the `App.ts` extraction so it only wires, dispatches and exposes the test
  bridge;
- ship the prepared themes without changing drawing content or exports;
- keep the 0.20 safety net: file budgets, coverage thresholds, fuzzing, browser
  regressions and the visual gate.

There is no release commitment. These land opportunistically before 1.0, or as
part of the feature work that touches the same files.

## 2. Current state

| File | Lines | Main problem |
| --- | ---: | --- |
| `src/pdf/pdfExport.ts` | 1,885 | Export orchestration, fonts, images, legend, labels, annotations and every item family in one file |
| `src/canvas/editors.ts` | 1,153 | Text, textbox, rich text, measurement labels and cloud/callout editing share one controller |
| `src/app/App.ts` | 1,684 | Sheet, image, document/page, package/export and diagnostics flows remain in the integration file |
| `src/state/store.ts` | 933 | History, autosave and UI state; handled with #52 rather than this plan |
| `src/canvas/CanvasView.ts` | 1,493 | Scene, rendering orchestration, labels and sheet fields; no longer urgent |
| `src/styles/tokens.css` | 86 | Semantic token contract; theme files do not exist yet |

The 0.20 work already removed pointer, drag, creation, touch, context-menu, item
rendering and draft lifecycle code from `CanvasView.ts`. Every new module is
covered by `file-budgets.json`.

## 3. Workstream A — PDF export (#126)

### Target layout

```text
src/pdf/export/
  index.ts          public exportProjectPdf entry point and page orchestration
  options.ts        page ranges, crop normalization and output bounds
  fonts.ts          embedded font set and run selection
  images.ts         image asset embedding
  legend.ts         legend page and count glyphs
  labels.ts         measurement labels, leaders and panels
  geometry.ts       PDF/PDF-point transforms and colour helpers
  items/
    dispatch.ts     item-family switch
    measurement.ts  length, angle, slope, radius, diameter, arc, area, volume
    shapes.ts       pen, line, arrow, rect, ellipse, highlight, polyline, rail, cloud
    text.ts         text, textbox and rich text
    symbols.ts      symbol artwork and tags
    counts.ts       count symbols and glyphs
    annotations.ts  callout, stamp, delta, cloud labels
```

`src/pdf/pdfExport.ts` keeps the public `exportProjectPdf` export and delegates.
The item-family split mirrors `src/canvas/items/` so canvas/PDF parity is obvious.

### Staged PRs

| PR | Scope | Regression gate |
| --- | --- | --- |
| A0 | Add `pdf/export/` scaffold, options, fonts, images, geometry and the dispatcher; move orchestration only. | `pdfExport`, `sheetPdf`, build |
| A1 | Move measurement families. | `pdfExport`, visual, exported content |
| A2 | Move shapes, lines, rails and clouds. | `pdfExport`, visual |
| A3 | Move text, textbox and rich text. | `pdfExport`, text units, visual |
| A4 | Move symbols, tags and counts. | `pdfExport`, symbols, visual |
| A5 | Move callouts, stamps, deltas, cloud labels and legend. | `pdfExport`, annotations, visual |
| A6 | Delete leftovers, remove the old switch and ratchet the budget. | Full export suite, screenshots |

### Acceptance

- `pdfExport.ts` is a dispatcher under 300 lines.
- Every `src/pdf/export/` module is under 400 lines.
- Existing content-stream assertions, hidden/locked rules and legend/label cases
  stay green.
- The drawing export dialog and visual screenshots do not change.

## 4. Workstream B — Inline editors (#127)

### Target layout

```text
src/canvas/editors/
  index.ts          CanvasEditorController public surface
  shared.ts         positioning, document pointer-down, commit/cancel helpers
  text.ts           new text, text editing, textbox and rich text
  labels.ts         measurement-label editing and resizing
  annotations.ts    cloud, callout, stamp and delta text editing
```

### Staged PRs

| PR | Scope | Regression gate |
| --- | --- | --- |
| B0 | Add the module surface and move shared positioning/commit helpers. | `test:canvas`, `test:ui` |
| B1 | Move text, textbox and rich-text sessions. | rich-text/text units, `test:ui` |
| B2 | Move measurement-label editing. | label units, `test:canvas` |
| B3 | Move cloud, callout, stamp and delta editing. | annotation units, `test:canvas` |
| B4 | Delete leftovers and ratchet the budget. | full canvas/UI suite, visual |

### Acceptance

- `editors.ts` is a dispatcher under 200 lines.
- Every `src/canvas/editors/` module is under 400 lines.
- Focus, inline styles, overflow warnings, label resize and commit/cancel semantics
  are unchanged.

## 5. Workstream C — App flows (#128)

### Target layout

```text
src/app/
  sheetFlows.ts       operation-card sheet creation, paper changes and byte cache
  imageFlows.ts       image insertion and target-layer selection
  documentFlows.ts    page/document lifecycle not owned by projectSession/documentImport
  diagnosticsFlows.ts diagnostics copy and report-a-problem flow
```

Package and export orchestration should move only where it is more than wiring;
`packageHost` and the drawing-export chooser may stay as host adapters.

### Staged PRs

| PR | Scope | Regression gate |
| --- | --- | --- |
| C0 | Move sheet flows and the sheet-byte cache. | `test:ui`, packaged smoke |
| C1 | Move image insertion. | `test:ui`, image units |
| C2 | Move document/page lifecycle helpers. | canvas/UI, packaged smoke |
| C3 | Move package/export and diagnostics where they are more than wiring. | package/UI suites |
| C4 | Clean `App.ts`, update the host surface and ratchet the budget. | Full suites, packaged smoke |

Coordinate C2/C3 with [#52](https://github.com/MajorJohnDoe/gridscalr/issues/52),
[#23](https://github.com/MajorJohnDoe/gridscalr/issues/23) and
[#63](https://github.com/MajorJohnDoe/gridscalr/issues/63) so the same methods are
not moved and rewritten twice.

### Acceptance

- `App.ts` is below 1,000 lines and contains no flow method longer than roughly 40
  lines.
- New `src/app/` modules are under 500 lines.
- Save, reopen, package, export, image insertion and sheet creation paths stay
  green in the packaged smoke test and Playwright suites.

## 6. Workstream D — Themes (#129)

The 0.20 stylesheet split is complete. `src/styles/tokens.css` already defines the
semantic contract and the `data-theme="default"` hook. This workstream implements
the deferred light, grey and navy themes without changing the drawing board or any
export.

### Decisions

- The dark jade theme stays the default and keeps the existing screenshots.
- `system` is the initial preference: dark OS preference maps to jade, light OS
  preference maps to light-green.
- The persisted choices are System, Default, Light, Grey and Navy.
- A theme may change UI chrome and the canvas surround/background only. Grid,
  selection, handles, marquee, labels, measurements, annotations, symbols and
  every drawing element keep fixed colours.
- The canvas background is screen-only and never appears in print or PDF export.
- Symbol category and inspection colours remain drawing content until #112 decides
  per-symbol colour.
- Theme-specific documentation screenshots are added only after the themes are
  stable. The default theme remains the reference set.

### Target layout

```text
src/styles/tokens.css            token contract and default aliases
src/styles/themes/default.css    current dark jade
src/styles/themes/light-green.css light surfaces, green accent
src/styles/themes/grey.css       neutral grey
src/styles/themes/navy.css       navy surfaces
public/boot-theme.js             external pre-paint theme bootstrap
scripts/check-theme-tokens.mjs   contract completeness and contrast checks
```

Each theme file defines the same semantic roles and palette aliases. A missing
token is a test failure; no component may depend on a palette literal.

### Staged PRs

| PR | Scope | Regression gate |
| --- | --- | --- |
| D0 | Finish the literal inventory, define the theme contract and move the default values into `themes/default.css` without changing pixels. | visual, strict docs, screenshots |
| D1 | Add the theme preference, the external pre-paint bootstrap and live switching without restart. | UI, accessibility, visual |
| D2 | Add `light-green.css`, the semantic token mapping and contrast checks. | visual per theme, contrast |
| D3 | Add `grey.css`. | visual per theme, contrast |
| D4 | Add `navy.css`. | visual per theme, contrast |
| D5 | Add the canvas-surround token and prove drawing content and PDF exports are unchanged across themes. | canvas, PDF export, visual |
| D6 | Add theme screenshots, `npm run theme:preview` and the theme rows in `docs/testing.md`. | strict docs, visual |

### Theme switching

- Store the preference in app preferences, not the project file.
- Apply it through `document.documentElement.dataset.theme` and keep
  `color-scheme` in sync.
- Set the theme before first paint from an external script. Do not add an inline
  script because the CSP only allows `script-src 'self'`.
- Decide explicitly whether the native Tauri window background follows the theme;
  if it cannot update without a restart, document the fixed behaviour.
- A theme change must relabel nothing and must not reload or re-render the drawing
  content.

### Acceptance

- All four themes can be selected and persist across restarts.
- System mode follows `prefers-color-scheme` and maps dark to jade and light to
  light-green.
- Every theme defines the full token contract and meets WCAG AA contrast for text
  and controls.
- Drawing content and PDF exports are byte-for-byte or visually identical across
  themes, apart from the canvas surround.
- Theme switching applies without a restart and without a flash of the wrong theme.
- Theme-specific screenshots are reviewed and the default screenshots remain the
  documentation baseline until then.

### Non-goals

- User-authored themes, per-project themes or a marketplace.
- A visual redesign.
- Changing the default jade palette.
- Per-symbol colour; tracked in #112.

## 7. Order and dependencies

1. **A — PDF export** first. It is the largest risk, has strong content-stream
   tests and does not overlap the 0.20 feature work.
2. **B — Editors** second. It is isolated in the canvas layer and well protected
   by `test:canvas` and `test:ui`.
3. **D — Themes** can run in parallel with A/B after D0 because it touches the
   styles and app-preference surface, not the PDF or editor modules. D1 must land
   before any theme file is enabled.
4. **C — App flows** opportunistically, together with #52/#23/#63.

Do not start A and B in parallel in the same files. C should wait until the
current feature branch touching `App.ts` has merged.

## 8. Verification per PR

```bash
npm run check:versions
npm run check:file-budgets
npm run check:docs
npm run format:check
npm run lint
npm run check:i18n
npx tsc --noEmit
npm test -- --run
npm run test:coverage
npm run build
npm run test:ui
npm run test:canvas
npm run test:count
npm run test:touch
npm run test:visual
npm run theme:preview
```

Theme PRs also run the contrast/token check and a visual pass for every theme.

For workstream C also run the packaged smoke test:

```bash
npm run tauri build -- --no-bundle
```

Every PR must state `Docs impact:` and `Budget impact:`, and may not change the
project schema, app version or user-facing workflow.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| PDF modules drift from the canvas renderer | Mirror the `src/canvas/items/` family names and keep content-stream assertions. |
| Editor split changes focus or commit timing | Move one session family per PR; run `test:canvas`, `test:ui` and the focus tests. |
| App extraction conflicts with #52/#23/#63 | Sequence C behind the feature branch that touches the same methods. |
| New modules regrow | Add `directoryMax` entries for `src/pdf/export` and `src/canvas/editors`, and ratchet `App.ts`. |
| Visual gate masks canvas | Keep `test:canvas` and the manual checklist as the canvas visual gate. |
| Theme leaks into drawing content | Use fixed drawing tokens, test canvas/PDF invariants and reject any export diff. |
| Theme flash before first paint | Use the external `public/boot-theme.js` bootstrap; never inline a script under the current CSP. |
| Theme contrast drift | Fail the token/contrast check and review every theme in the visual gate. |

## 10. Definition of done

- #126, #127, #128 and #129 are closed.
- `pdfExport.ts` is under 300 lines; `editors.ts` is under 200; `App.ts` is under
  1,000.
- Every new module is under its directory budget.
- Four themes ship, default remains unchanged, and drawing/export content is
  invariant across themes.
- No user-facing workflow, project schema, export layout or visual screenshot
  changes without an explicit review note.
- Coverage, fuzzing, visual regression and the packaged smoke test stay green.

## 11. Out of scope

- New features.
- A second stylesheet split or a visual redesign.
- `store.ts` history/autosave rework — handled with #52.
- Further `CanvasView.ts` or `labelLayout.ts` splits unless they grow again.
- Security audit (#62) and release work.
