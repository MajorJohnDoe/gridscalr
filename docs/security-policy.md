# Desktop security policy

**Scope:** the WebView Content Security Policy, the Tauri capability list, the
bundled worker boundary, the npm/Rust advisory gate and the pinned GitHub
Actions for the desktop shell.
**Machine-checked records:** [`../security/policy.json`](../security/policy.json)
for the CSP and capabilities, and
[`../security/dependency-allowlist.json`](../security/dependency-allowlist.json)
for dependency exceptions.
**Checks:** `npm run check:security`, `npm run check:actions` and
`npm run check:dependencies` (all three also run in CI and in the pre-commit
list).
**Browser regression:** `npm run test:csp`.
**Related:** [`security-audit.md`](security-audit.md) findings F-028, F-029,
F-030, F-037, F-038, F-039, F-040 and F-042, and
[`limitations.md`](limitations.md).

The configuration is the source of truth. This document,
`security/policy.json` and `security/dependency-allowlist.json` record why each
directive, permission and exception exists; the checks fail when the
configuration changes without a matching, reasoned entry.

## One production policy

The shipped desktop app has exactly one page policy:

- `src-tauri/tauri.conf.json` → `app.security.csp` is added by the Tauri shell as
  a `Content-Security-Policy` response header for HTML.
- `index.html` deliberately contains **no** CSP meta tag. A second meta policy
  would be enforced alongside the header and could drift (F-028).
- The Vite dev server injects `app.security.devCsp` as a meta tag only when
  serving the browser fallback (`developmentCsp` in `vite.config.ts`). That is
  the only policy in `npm run dev`, because the dev server has no Tauri shell.
  A production build carries no meta tag.

The production policy contains no `localhost`, `127.0.0.1`, `ws:` or other
remote origin. `http://ipc.localhost` is the Windows Tauri IPC transport and the
only localhost-shaped source allowed.

`npm run preview` serves the built frontend without the shell, so it has no page
policy. It is a build-inspection tool, not a supported runtime; use
`npm run tauri dev` or a packaged build when the policy matters.

`freezePrototype` applies to the WebView, not to worker globals. The bundled
workers run code from the app bundle only, and their fetches are constrained by
the inherited policy.

## Production directives

| Directive | Sources | Why |
| --- | --- | --- |
| `default-src` | `'self'` | Every asset is bundled; the app has no network dependency. |
| `img-src` | `'self' data: blob:` | Embedded PNG/JPEG assets are data URLs; thumbnails and render canvases use blob URLs. |
| `style-src` | `'self'` | Styles are bundled CSS files. The boot screen uses `public/boot.css`; dynamic styling uses the CSSOM, so no inline style attribute or style element is needed. |
| `font-src` | `'self' data:` | Bundled Liberation Sans and PDF.js standard fonts; some font data is inlined. |
| `script-src` | `'self' 'wasm-unsafe-eval' blob:` | `wasm-unsafe-eval` lets PDF.js decode CCITT/JBIG2 and Tesseract compile its WASM core. `blob:` is needed for the policy-inheriting worker shims. |
| `worker-src` | `'self' blob:` | The PDF.js and Tesseract workers are bundled scripts started from blob shims. |
| `connect-src` | `'self' ipc: http://ipc.localhost` | Local asset and language fetches plus the Tauri IPC transports. |
| `object-src` | `'none'` | No plugin or object element. |
| `base-uri` | `'none'` | Not covered by `default-src`; the app uses document-relative URLs. |
| `frame-src` | `'none'` | No iframe, frame or object; PDF pages render to canvas. |
| `form-action` | `'none'` | No form submission. |

### Development additions

Only the browser fallback policy adds sources; production never does.

| Directive | Extra source | Why |
| --- | --- | --- |
| `script-src` | `'unsafe-inline'` | Vite injects an inline module bootstrap and HMR client. |
| `style-src` | `'unsafe-inline'` | Vite injects stylesheets as style elements in development; production emits CSS files. |
| `connect-src` | `http://localhost:1420`, `ws://localhost:1420` | Vite module requests and HMR websocket. |

`freezePrototype` is `false`, with a recorded reason. Phase 2 evaluated
`Object.freeze(Object.prototype)` in Chromium and in the packaged WebKitGTK
smoke test. Both fail while loading the app: pdf-lib assigns
`PDFHeader.prototype.toString`, and a frozen `Object.prototype` makes that
inherited property non-writable, so the page throws
`Cannot assign to read only property 'toString' of object '#<PDFHeader>'`.
`security/policy.json` records the value and the reason; revisit it only if
pdf-lib stops overriding `Object.prototype` members.

The boot screen reports a Content Security Policy violation in its error panel
(`public/boot-error.js`), so a policy regression in a packaged build is visible
instead of leaving a silently blank interface.

## Worker boundary

A same-origin URL worker does not inherit the page policy in the Tauri webview,
so `script-src`, `connect-src` and `worker-src` would not constrain it (F-029).
Both bundled workers are therefore started from a `blob:` shim:

- `src/pdf/pdfRenderer.ts` sets `GlobalWorkerOptions.workerSrc` to a blob module
  that imports the bundled `pdf.worker.min.mjs`. PDF.js may wrap that blob in a
  second blob because `tauri://localhost` has an opaque origin, which is why
  `script-src` also allows `blob:`.
- `src/search/ocr.ts` passes `workerBlobURL: true`, so Tesseract's own blob
  loader imports the bundled worker script and WASM core.

`npm run test:csp` opens the demo project, starts the real Tesseract worker,
recognises a canvas, and proves that a blob worker can import a same-origin
module but cannot fetch `https://example.com`. `npm run test:ui` and the other
Playwright suites render PDF pages under the same development policy. The
packaged smoke test loads a PDF page through the PDF.js worker and runs the
bundled OCR worker inside the real WebView under the production policy, so both
workers are also covered in a production build.

## Capabilities

`src-tauri/capabilities/default.json` grants only what the frontend calls.
`core:default` is forbidden because it expands to the whole core ACL.

| Permission | Call site |
| --- | --- |
| `core:event:default` | Window resize, close-requested, drag-and-drop and launch-path events. |
| `core:window:allow-destroy` | Title-bar close and File → Quit after the unsaved-changes prompt. |
| `core:window:allow-internal-toggle-maximize` | Double-click on the custom title bar. |
| `core:window:allow-is-maximized` | Maximize/restore glyph in the title bar. |
| `core:window:allow-minimize` | Title-bar minimize button. |
| `core:window:allow-start-dragging` | Dragging the custom title bar. |
| `core:window:allow-toggle-maximize` | Title-bar maximize/restore button. |
| `dialog:allow-open` | Open project/drawing and Relink. |
| `dialog:allow-save` | Save, Save As, export targets and package output. |

`core:window:allow-close` is intentionally absent: the close flow calls
`destroy()` after prompting. The dialog plugin's `message`, `ask` and `confirm`
commands are not granted because those dialogs are app-drawn.

## External process launches

**File → Send & share → Send by e-mail…** is the only feature that starts a
program outside GridScalr. It adds no CSP source and no Tauri capability: the
frontend calls two commands in `src-tauri/src/mail_send.rs`, and the launch
plans live in `src-tauri/src/mail_launch.rs`.

- `compose_mail` writes the exported drawing PDF into the app-cache
  `mail-outbox/` folder, prunes that folder to the ten most recent PDFs and then
  launches a client. It never writes a user-chosen path and never touches a
  source drawing or the project file.
- `reveal_export` accepts a path only after `path_guard::ensure_inside_root`
  proves the resolved file exists, ends in `.pdf` and lives inside the same
  `mail-outbox` folder. A source drawing, an alternate spelling and a symlink
  that escapes the folder are refused.
- Every launch is `std::process::Command` with a fixed program and an argument
  array. There is no `sh -c`, no shell string and no interpolation. The fixed
  programs are `xdg-email`, `thunderbird`, `osascript`, `open`, `explorer.exe`
  and `outlook.exe`.
- Windows prefers Simple MAPI through `MAPISendMailW` in the system
  `mapi32.dll`, resolved at runtime with `LoadLibraryW` and `GetProcAddress`
  using the reviewed `windows-sys` struct definitions and
  `MAPI_LOGON_UI | MAPI_DIALOG`; a missing DLL or entry point, or a MAPI error,
  falls back to `outlook.exe /a` instead of failing the app at load time. macOS passes
  the path, subject and body as `osascript` run arguments, never as AppleScript
  source. Thunderbird's single `-compose` argument is stripped of quotes,
  commas and line breaks so it cannot gain a second field.
- The browser fallback shows the menu entry disabled. It never calls IPC.

Changing a program, an argument shape or the outbox guard is a security change:
update `security/policy.json`, this section and the Rust unit tests together.

## CSV import bounds

The schedule CSV import is a controlled mutation of existing project data, not a
script surface. It adds no CSP source and no capability, so `security/policy.json`
is unchanged.

| Bound | Value | Where |
| --- | --- | --- |
| File size | 10 MiB (`MAX_SCHEDULE_CSV_BYTES`) | `src/io/limits.ts`, checked by `pickCsv()` before the bytes are read and again before decoding |
| Data rows | 20 000 (`MAX_SCHEDULE_CSV_ROWS`) | `src/features/schedules/csv`, checked after the record split and before any value is mapped |
| Encoding | UTF-8 only | fatal `TextDecoder` with BOM preservation; an invalid byte sequence is refused |
| Mutation scope | Existing measurements and spaces by stable ID | update only; a CSV never creates an entity, field or schedule |
| Cell content | Plain text | no formula execution, no HTML rendering, no `eval` |

Formula-leading text (`=`, `+`, `-`, `@`, tab, CR) is exported with a leading
apostrophe and that exact guard is removed on import. A cell that still starts
with a formula character after import is stored as text; it is never evaluated
or added to a document as an expression. The import dialog writes every value
with `textContent`.

## Dependency and advisory gate

`npm run check:dependencies` runs on every pull request and before a release
build. It runs two audits and applies one reviewed exception list:

| Audit | Command | Coverage |
| --- | --- | --- |
| npm | `npm audit --json` | `package-lock.json`, production and development |
| Rust | `cargo audit --json` | `src-tauri/Cargo.lock`, every target-specific crate |

CI installs `cargo-audit` with `taiki-e/install-action`. Locally, install it once
with `cargo install cargo-audit --locked`; `npm run check:dependencies` then runs
both audits. `npm run check:dependencies -- --help` lists the offline report and
summary options.

The CI job **Dependency advisory gate** prints the result to the job log, writes
a Markdown summary to the step summary, and uploads the raw reports plus
`gate-result.json` as the `dependency-audit` artifact. The **Release build**
workflow depends on the same job, so a tag cannot produce artifacts while an
unaccepted advisory is open.

### Threshold

- An npm advisory of `moderate`, `high` or `critical` blocks unless it is
  accepted in [`security/dependency-allowlist.json`](../security/dependency-allowlist.json).
  `low` and `info` are reported but do not block.
- A Rust vulnerability blocks at `moderate` or above. A vulnerability without a
  CVSS score is treated as `high`, so the gate fails closed.
- Rust `unsound`, `unmaintained` and `yanked` findings block unless accepted,
  because they have no patch and need a conscious decision. `notice` is
  reported only, and a low or informational finding never needs an entry.

The threshold is deliberately stricter than "high or critical only": a moderate
advisory is either fixed or written down, never silently ignored.

### Reviewed allowlist

Each entry in `security/dependency-allowlist.json` needs every field:

| Field | Meaning |
| --- | --- |
| `ecosystem` | `npm` or `cargo`. |
| `package` | The affected package name. |
| `advisory` | The GHSA, CVE or RUSTSEC identifier. |
| `kind` | Optional; the Rust warning kind (`unsound`, `unmaintained`, `yanked`). |
| `reason` | Why this build is not exploitable and what blocks the fix. At least 20 characters. |
| `reviewedAt` | The date the entry was last reviewed. |
| `reviewBy` | The hard expiry date. The entry is valid through this date. |
| `issue` | Optional tracking issue or advisory URL. Must be `http(s)`. |

`reviewBy` is an expiry, not a reminder: the gate fails when the date has
passed, so an accepted advisory cannot stay accepted by inertia. An entry that
no longer matches an advisory is also a failure, which keeps the list small and
current. Review the whole file quarterly and before a release.

### Accepting or clearing an advisory

1. Try to fix it first: update the dependency, or add a scoped `overrides`
   entry when the parent tool still declares the vulnerable range. Run the
   affected tests and the full check list.
2. If it cannot be fixed without breaking the app, add one entry with the
   reason, the date and the blocking upgrade or upstream issue. An accepted
   advisory is reported on every run.
3. When the dependency moves, remove the entry. The stale check fails the gate
   until it is gone, and the run then proves the advisory is cleared.
4. Never edit the scanner, add an ignore flag outside the allowlist, or make
   the gate report a pass for an unverified tree. A change to the gate itself is
   a security change and needs review.

### Network failure

Both audits need a live advisory source: the npm registry and the RustSec
advisory database. The script retries three times by default and then **fails
closed** with an explicit message that the reports could not be read. That is
not a clean result. Re-run the job, or supply cached reports with
`--npm-report` and `--cargo-report`; the same threshold and allowlist rules
apply.

### Current position (2026-11-27)

- `minimatch` (GHSA-g3hv-75wg-m249) is fixed by a scoped `overrides` entry in
  `package.json`. It was a development-only glob denial of service through
  ESLint and typescript-eslint; the npm audit is now clean.
- `glib 0.18.5` (RUSTSEC-2024-0429) is **accepted, not fixed**, and the
  acceptance has an expiry. It is Linux-only and not on the Windows or macOS
  code path: `glib` arrives through `gtk 0.18.2` for the Linux window and tray.
  It cannot be cleared inside the current Tauri generation — `tauri 2.12.5`
  declares `gtk = "0.18"`, `gtk 0.18.2` requires `glib ^0.18`, `glib` has no
  0.18 patch release newer than 0.18.5, and `tauri 3.0.0-alpha.6` still declares
  `gtk 0.18` for its GTK3 path. This was re-verified with `cargo tree`,
  `cargo update -p glib --dry-run` and `cargo update -p glib --precise 0.20.0
  --dry-run` on 2026-11-15. The clearing path is the Tauri 3 / GTK4 migration
  in [#270](https://github.com/MajorJohnDoe/gridscalr/issues/270); the advisory
  is tracked by [#21](https://github.com/MajorJohnDoe/gridscalr/issues/21) and
  Dependabot alert [#1](https://github.com/MajorJohnDoe/gridscalr/security/dependabot/1),
  which stays open rather than dismissed.
- The four unmaintained crates `proc-macro-error`, `zvariant`, `zbus_names` and
  `zvariant_derive` are accepted with the same review date. They have no known
  vulnerability and arrive through the GTK build and the Linux single-instance
  channel.
- `chrono` (RUSTSEC-2026-0543) is **accepted, not fixed**, but it is no longer
  compiled. `trash 5.4.0` replaced chrono with `jiff`, so
  `cargo tree -e features -i chrono` is empty. chrono remains in `Cargo.lock`
  only as an optional entry of `serde_with 3.24.0` through `tauri-utils 2.10.2`,
  and the lockfile is feature-independent, so `cargo audit` still reports the
  informational unmaintained notice. The entry is due for review on 2027-08-15
  and is removed by [#390](https://github.com/MajorJohnDoe/gridscalr/issues/390)
  when upstream drops the optional dependency.
- The glib and GTK/zbus entries are due for review on 2027-02-15; the chrono
  entry is due on 2027-08-15. The gate fails after each date until the list is
  renewed or the advisories are fixed.

## Pinned GitHub Actions

Every remote `uses:` reference in `.github/workflows/` is a full 40-character
commit SHA with its release in a trailing comment; a tag or branch can be
repointed, and the release workflow builds the artifacts users install.
`npm run check:actions` enforces the pin, the version comment and one SHA per
action release on every pull request. Local actions (`./…`) are exempt and a
container action must use a `@sha256:` digest.

The pins do not update themselves. The bump procedure and the
`dtolnay/rust-toolchain` exception are documented in
[`releasing.md`](releasing.md#pinned-github-actions); the remaining staleness
risk is F-111 in [`plan/foundation-findings.md`](plan/foundation-findings.md).

## Test-only commands

`smoke_test_dir` and `finish_smoke_test` live in `src-tauri/src/smoke.rs` and are
compiled with `#[cfg(debug_assertions)]` only (F-037). `finish_smoke_test` calls
`app.exit(code)`, so a release build has no handler that can exit the app. The
frontend asks for the smoke directory only when the Vite `__TAURI_DEBUG__`
define is true, which Tauri sets for `tauri dev` and `tauri build --debug`. CI
builds the shell with `--debug` before running `--smoke-test`.

## Changing the policy

1. Change the configuration and `security/policy.json` in the same pull request,
   with a reason for each directive or permission touched.
2. Update the tables in this document if the human-readable summary changed.
3. Run `npm run check:security`, `npm run test:csp` and the packaged smoke test.
4. Record a security-relevant change in `docs/security-audit.md` and, when a
   risk is accepted, in `docs/limitations.md`.

Relaxing the production policy (adding a remote origin, `'unsafe-inline'`,
`'unsafe-eval'`, a broad capability set or dropping a hardening directive) must
be justified in the pull request and reviewed as a security change.
