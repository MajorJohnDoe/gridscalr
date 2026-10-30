# Contributing to GridScalr

Thanks for helping. GridScalr is a local-first desktop app for measuring PDF and
TIF drawings. Contributions are accepted under the MIT License.

## Ground rules

- The app must stay local-first. Do not add accounts, cloud sync, telemetry,
  crash reporting or network dependencies without an explicit decision in an
  issue first.
- Never commit customer drawings, personal data, credentials or `.env` files.
  Use `fixtures/industrial-plan.pdf` or a drawing you are allowed to share.
  `exports/` and `temp_test_plans/` are ignored on purpose.
- Keep one logical change per pull request. Do not mix refactors with features.
- Read `AGENTS.md` before changing behaviour; it lists the product invariants
  (hidden items never render or export, locked items stay visible, one bulk
  action is one undo step, and so on).

## Development setup

Requirements: Node.js 22.12 or newer, npm 10 or newer, Rust 1.77.2 or newer and
the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your
platform.

```bash
npm ci
npm run tauri dev
```

Browser-only UI work:

```bash
npm run dev
```

The browser fallback can read files through the picker and download exports, but
native paths, recents and autosave recovery need the desktop shell.

## Checks before a pull request

Run the same checks as CI from the repository root:

```bash
npm run check:versions
npm run check:docs
npm run format:check
npm run lint
npx tsc --noEmit
npm test -- --run
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml
```

Changes that touch the desktop shell also need:

```bash
npm run tauri build -- --no-bundle
```

`npx tsc` is TypeScript 7. ESLint uses the official `@typescript/typescript6`
alias because TypeScript 7 does not ship a compiler API yet; keep both aliases
in `package.json` when updating TypeScript.

UI and canvas regressions:

```bash
npx playwright install chromium   # once
npm run test:ui
npm run test:canvas
```

## Tests and fixtures

- `npm test` runs the Vitest suite for the model, project files, hit testing,
  TIFF parsing, PDF export, Markdown and autosave.
- `npm run fixture` regenerates `fixtures/industrial-plan.pdf`.
- `npm run docs:demo` regenerates `fixtures/demo-project.gridscalr`.
- TIFF fixtures live in `fixtures/tiff/`.
- Do not delete fixtures without checking which tests depend on them.

## Documentation

Documentation is part of the change, not a follow-up:

- Update `docs/shortcuts.md` and the shortcut table in `README.md` when a
  shortcut changes.
- Update `README.md` when navigation, panels, exports or the architecture map
  change.
- Keep `Help → About` accurate. The version comes from `package.json` and the
  schema version from `SCHEMA_VERSION`; never hardcode them in help content.
- When a visible screen changes, run `npm run docs:capture` and review the
  affected screenshots.
- `GRIDSCALR_DOCS_STRICT=1 npm run check:docs` is the release gate for
  documentation.

If documentation is deliberately deferred, say so in the pull request:
`Docs impact: deferred — <what>`.

## Commits and branches

- Branch from `main`: `feat/layers-panel`, `fix/pdf-export`, `docs/releasing`.
- Use the imperative mood and a Conventional Commits prefix where it helps:
  `feat: add count measurement tool`, `fix: exclude hidden layers from CSV export`.
- Keep the subject under ~72 characters and explain the why in the body.
- Never force-push `main`.

## Pull requests

The template asks for scope, documentation impact and the verification you ran.
A pull request is ready when CI is green and the documentation is either updated
or explicitly deferred.

## Releases

Releases are cut manually by the maintainer. See `docs/releasing.md`.

## Code of conduct

Participation is covered by `CODE_OF_CONDUCT.md`. Report security issues through
the private advisory flow in `SECURITY.md`.
