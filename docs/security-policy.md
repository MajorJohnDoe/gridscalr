# Desktop security policy

**Scope:** the WebView Content Security Policy, the Tauri capability list, the
bundled worker boundary and the npm/Rust advisory gate for the desktop shell.
**Machine-checked records:** [`../security/policy.json`](../security/policy.json)
for the CSP and capabilities, and
[`../security/dependency-allowlist.json`](../security/dependency-allowlist.json)
for dependency exceptions.
**Checks:** `npm run check:security` and `npm run check:dependencies` (both also
run in CI and in the pre-commit list).
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

### Current position (2026-11-11)

- `minimatch` (GHSA-g3hv-75wg-m249) is fixed by a scoped `overrides` entry in
  `package.json`. It was a development-only glob denial of service through
  ESLint and typescript-eslint; the npm audit is now clean.
- `glib 0.18.5` (RUSTSEC-2024-0429) is accepted until Tauri moves off the GTK
  0.18 generation. It is tracked by [#21](https://github.com/MajorJohnDoe/gridscalr/issues/21)
  and is Linux-only.
- The four unmaintained crates `proc-macro-error`, `zvariant`, `zbus_names` and
  `zvariant_derive` are accepted with the same review date. They have no known
  vulnerability and arrive through the GTK build and the Linux single-instance
  channel.
- Every entry is due for review on 2027-02-11. The gate fails after that date
  until the list is renewed or the advisories are fixed.

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
