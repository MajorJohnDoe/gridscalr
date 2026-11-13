# Security audit — 0.24.0 phase 1

**Issue:** [#62](https://github.com/MajorJohnDoe/gridscalr/issues/62)
**Epic:** [#167](https://github.com/MajorJohnDoe/gridscalr/issues/167)
**Date:** 2026-11-11
**App version:** 0.23.0, project schema 25
**Status:** audit complete. Sixteen findings: no P0, no P1, eight P2 and eight
P3. Production changes are deferred to phases 2–5; this phase only records the
threat model, evidence and proposed fixes.

**Phase 3 update:** F-031, F-032, F-033, F-034 and F-041 are fixed in
0.24.0 phase 3 ([#169](https://github.com/MajorJohnDoe/gridscalr/issues/169)).

**0.27.0 phase 4 update:** F-036 (Windows path coverage) is fixed in
[#199](https://github.com/MajorJohnDoe/gridscalr/issues/199). The `desktop`
matrix job now runs `cargo test --lib` on Ubuntu, Windows and macOS, and
`src-tauri/src/path_guard_windows_tests.rs` covers the verbatim prefix, a real
case-insensitive volume, a trailing dot or space, drive-relative spellings, UNC
spellings and a junction escape. The evidence below records the state at the
time of the review.

**Phase 2 update:** F-028, F-029, F-030, F-037, F-038 and F-042 are fixed in
0.24.0 phase 2 ([#168](https://github.com/MajorJohnDoe/gridscalr/issues/168)).
The shipped policy and its machine-checked justification are in
[`security-policy.md`](security-policy.md) and
[`../security/policy.json`](../security/policy.json). The audit text below
records the state at the time of the review.

This document is the reference for the follow-up phases:

| Phase | Issue | Audit findings |
| --- | --- | --- |
| 2 | [#168](https://github.com/MajorJohnDoe/gridscalr/issues/168) | F-028, F-029, F-030, F-037, F-038, F-042 |
| 3 | [#169](https://github.com/MajorJohnDoe/gridscalr/issues/169) | F-031, F-032, F-033, F-034, F-036, F-041 |
| 4 | [#170](https://github.com/MajorJohnDoe/gridscalr/issues/170) | F-035, F-039, F-040 |
| 5 | [#171](https://github.com/MajorJohnDoe/gridscalr/issues/171) | F-043, plus abuse tests for the path, archive and project input above |

Findings are kept in [`plan/foundation-findings.md`](plan/foundation-findings.md)
as F-028 onwards. Proposed new issues are listed at the end.

## 1. Scope and method

The audit is a static review plus dependency and configuration checks, not a
penetration test and not a formal external audit.

- **Assets reviewed:** `.gridscalr` project files, source PDF and TIF drawings,
  managed copies in `<project>.drawings/`, rolling backups, IndexedDB recovery
  records, structural checkpoints, `.gridscalr.zip` packages, diagnostics and the
  local event log.
- **Trust boundaries:** the WebView, the Tauri IPC bridge, the filesystem, OS
  file dialogs, OS drag-and-drop and launch arguments, cloud-synced and network
  folders, and project/package input.
- **Code read:** `src-tauri/tauri.conf.json`, `src-tauri/capabilities/`,
  `src-tauri/src/*.rs`, `src/io/`, `src/features/projectPackage/`,
  `src/features/sourceStorage/`, `src/features/saveIntegrity/`,
  `src/features/sessionRecovery/`, `src/features/projectIntegrity/`,
  `src/features/diagnostics/`, `src/app/projectSession.ts`,
  `src/app/packageFlows.ts`, `src/app/projectImportSource.ts`,
  `src/app/documentFlows.ts`, `src/help/markdown.ts`, `src/ui/` and the shipped
  CSP in `index.html`.
- **Dependency checks:** `npm audit` and `npm audit --omit=dev`, an OSV batch
  query over all 462 packages in `src-tauri/Cargo.lock`, a `cargo metadata`
  licence scan, the GitHub Dependabot alert list, the Tauri permission ACL
  manifests in `src-tauri/gen/schemas/`, and the action references in
  `.github/workflows/`.
- **Configuration checks:** a Chromium check of the shipped CSP directive and a
  check of worker CSP inheritance. `cargo audit` is not installed in this
  environment; the OSV batch is the equivalent check for this phase and phase 4
  adds the automated gate.

### Severity

| Level | Meaning |
| --- | --- |
| **P0** | Data loss, source corruption or a broken security invariant |
| **P1** | Exploitable weakness or a user-visible security regression |
| **P2** | Defence-in-depth gap, future risk or a fragile guarantee |
| **P3** | Observation, test gap or hygiene item |

## 2. Threat model

### 2.1 Assets and their sensitivity

| Asset | Contents | Worst outcome |
| --- | --- | --- |
| Source drawing (PDF/TIF) | Customer plan, potentially confidential | Overwrite or disclosure |
| Managed copy | Same as source, inside the project folder | Silent replacement |
| `.gridscalr` project | Pages, layers, measurements, names, embedded images, OCR text, absolute paths | Corruption, loss of takeoff work |
| Backup / checkpoint / autosave | Full serialized project | Disclosure or restore of the wrong version |
| `.gridscalr.zip` package | Project plus drawings plus optional reports | Malicious input, disk exhaustion, path escape |
| Diagnostics and log | Counts, versions, sanitized errors | Path or drawing-name disclosure |

### 2.2 Trust boundaries and attacker model

GridScalr is a local-first desktop app with no accounts, no telemetry and no
network dependency. The realistic threats are:

1. **Malicious or corrupted project/package input.** A `.gridscalr` or
   `.gridscalr.zip` received from someone else is parsed by the app. The main
   risks are path escape, resource exhaustion, parser crashes and UI injection.
2. **A compromised or malicious local file.** A source PDF, TIF, PNG/JPEG or
   project can be crafted. PDF.js, Tesseract, pdf-lib and the TIF reader are the
   parsers exposed to it.
3. **A shared or cloud-synced folder.** Another person or client can replace a
   file while it is open. Integrity is covered by ADR 0010–0012; this audit
   checks that the write guard and conditional save cannot be bypassed.
4. **A compromised renderer.** If script execution were achieved in the WebView,
   the IPC bridge is the blast radius: arbitrary file read, project write,
   packaging and process exit. The CSP and capability model are the containment
   boundary.
5. **A supply-chain compromise.** npm or Cargo dependencies, GitHub Actions used
   to build the release, or the bundled PDF.js/Tesseract workers.

Explicitly out of scope: code signing (tracked separately), a formal penetration
test, OS-level attackers with the user's own privileges, and physical access. An
attacker who can already run code as the user can read and write the same files.

### 2.3 Security invariants

The audit tests these claims, taken from `SECURITY.md` and `AGENTS.md`:

- A source drawing is never written by a save, export, backup or package path.
- Hidden items never render, hit-test or export; locked items stay visible but
  cannot change. (Covered by existing milestone tests; not re-audited here.)
- A project file that changed on disk is never overwritten without an explicit
  choice.
- Project and package input is validated and bounded.
- No network request is made outside the local IPC bridge.
- A Tauri capability is never broader than the app needs.

## 3. Tauri capabilities and IPC surface

### 3.1 Every permission in `capabilities/default.json`

The window is `main` only. `core:default` expands through the ACL manifest into
the sets below.

| Permission | What it grants | Used by GridScalr? | Keep? |
| --- | --- | --- | --- |
| `core:default` | All nine core default sets below | Partly | **No** — replace with the minimum |
| `core:path:default` | `resolve`, `normalize`, `join`, `basename`, `dirname`, `extname`, `isAbsolute` | No `@tauri-apps/api/path` import exists | No |
| `core:event:default` | `listen`, `unlisten`, `emit`, `emitTo` | Yes: close request, resize, drag-and-drop, launch paths | Yes |
| `core:window:default` | 27 window getters and `internal-toggle-maximize` | Only `is-maximized` is used and is granted explicitly | No |
| `core:webview:default` | Webview list/position/size and `internal-toggle-devtools` | `onDragDropEvent` uses the event API, not a webview command | No |
| `core:app:default` | Version, name, identifier, bundle type, listeners | Version comes from Vite `define`; identifier is not read | No |
| `core:image:default` | `new`, `from-bytes`, `from-path`, `rgba`, `size` | No: all art is inline SVG | No |
| `core:resources:default` | `close` a resource | No | No |
| `core:menu:default` | Create, append, popup and mutate native menus | No: the top menu is HTML | No |
| `core:tray:default` | Create, remove and mutate a system tray | No | No |
| `core:window:allow-close` | `close()` | No: close uses `destroy()` after the prompt | No |
| `core:window:allow-destroy` | `destroy()` | Yes: title-bar close and quit | Yes |
| `core:window:allow-minimize` | `minimize()` | Yes | Yes |
| `core:window:allow-toggle-maximize` | `toggleMaximize()` | Yes | Yes |
| `core:window:allow-is-maximized` | `isMaximized()` | Yes | Yes |
| `core:window:allow-start-dragging` | `startDragging()` | Yes: `data-tauri-drag-region` | Yes |
| `dialog:default` | `open`, `save`, `message` | Yes | Yes |

`dialog:default` is exactly the three dialog types the app uses (`ask` and
`confirm` are app-drawn and not granted). The `dialog` plugin also compiles
`tauri-plugin-fs 2.7.1`, but GridScalr never registers the fs plugin and grants
no fs permission, so no generic filesystem scope is reachable. The
`window-state` plugin is registered but exposes no frontend command and needs no
capability.

**Conclusion:** the minimum set is `core:event:default`, the six explicit window
permissions above and `dialog:default`. Everything else is unused breadth. See
F-030.

### 3.2 Registered commands

All commands are in `src-tauri/src/lib.rs` and reachable from the WebView.

| Command | Input and validation | Main risk |
| --- | --- | --- |
| `read_binary`, `read_text` | Arbitrary path from the renderer; no size cap | Full local-file read if the renderer is compromised; memory exhaustion |
| `path_exists`, `file_size` | Arbitrary path | Local path probing |
| `write_text`, `write_binary_base64` | Write guard, then atomic replace; payload unbounded | Protected-path bypass and memory use |
| `write_project_conditional` | Guard plus expected SHA-256 and read-back | The guard depends on frontend-supplied paths |
| `project_file_stamp`, `project_file_metadata` | Arbitrary path | Hashing large files |
| `read/write/heartbeat/clear_project_lease` | `<path>.lock` sidecar; ownership check; explicit `force` | Arbitrary `.lock` name from the renderer |
| `save_project_backup`, `list_project_backups` | App-data folder, sanitized project ID, rotation to 3 | Shared folder for colliding sanitized IDs |
| `source_copy_to_project` | Derived destination, name sanitization, SHA-256 verification, protected-path check | Writes inside a protected folder if the guard is misconfigured |
| `source_file_hash`, `source_find_by_hash` | Arbitrary file; folder scan capped at 4096 candidates | Hashing megabytes or gigabytes; no total byte budget |
| `package_create` | Manifest, archive names, size limits, checksums, protected output | Packaging arbitrary readable files if the renderer is compromised |
| `package_inspect`, `package_extract` | Manifest, name, duplicate, symlink, encryption and size checks | Disk exhaustion; parser edge cases |
| `package_cancel` | Job ID lookup | Unbounded job map if commands never finish |
| `take_launch_paths` | Launch queue | Normal launch plumbing |
| `smoke_test_dir`, `finish_smoke_test` | Test-only; `finish_smoke_test` calls `app.exit(code)` | Shipped in release; a renderer script can exit the app (F-037) |

**Validation summary:** every path-taking command expects an absolute path chosen
by an OS dialog or derived from the opened project. That is the standard Tauri
model: the WebView is trusted, and a renderer compromise becomes full file
access. The audit therefore focuses on (a) not allowing the guard to be bypassed
from trusted UI flows and (b) keeping the renderer free of script injection.

## 4. CSP

> **Phase 2:** the configuration described in this section was replaced. The
> single production policy, the dev-only meta injection and the worker boundary
> are documented in [`security-policy.md`](security-policy.md). The text below
> preserves the audit evidence.

### 4.1 Configured policies

Production (`src-tauri/tauri.conf.json`):

```text
default-src 'self';
img-src 'self' data: blob:;
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
script-src 'self' 'wasm-unsafe-eval';
worker-src 'self' blob:;
connect-src 'self' ipc: http://ipc.localhost
```

Development adds `'unsafe-inline'` to `script-src` (Vite) and
`http://localhost:1420 ws://localhost:1420` to `connect-src` (HMR).

| Directive | Needed for | Assessment |
| --- | --- | --- |
| `default-src 'self'` | Everything not listed | Correct |
| `img-src 'self' data: blob:` | Embedded images are `data:` URLs; thumbnails and canvas use `blob:` | Correct |
| `style-src 'self' 'unsafe-inline'` | One inline `<style>` block in `index.html` and one `style` attribute in the status bar | Unnecessarily permissive; removable (F-038) |
| `font-src 'self' data:` | Bundled Liberation Sans and PDF.js standard fonts | Correct |
| `script-src 'self' 'wasm-unsafe-eval'` | Tesseract and PDF.js 6 use WebAssembly | Correct for the page, but see worker gap below |
| `worker-src 'self' blob:` | PDF.js and Tesseract workers | `blob:` may be removable if no blob worker is created |
| `connect-src 'self' ipc: http://ipc.localhost` | IPC on Windows uses `http://ipc.localhost` | Correct |

Missing hardening: `object-src 'none'`, `base-uri 'none'`, `frame-src 'none'`
and `form-action 'none'`. `base-uri` is not covered by `default-src`. The app
creates no frame, form or object, so these are cheap additions. `freezePrototype`
is `false`; enabling it is a candidate in F-028.

### 4.2 The second, shipped policy

`index.html` carries its own meta CSP:

```text
default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline';
font-src 'self' data:; script-src 'self'; worker-src 'self' blob:;
connect-src 'self' ipc: http://ipc.localhost ws://localhost:1420 http://localhost:1420
```

Tauri adds the configured CSP as a response header for HTML; it does not remove
or replace the meta tag. Both policies are therefore enforced in production, and
the meta policy is the stricter one on `script-src` (no `wasm-unsafe-eval`) and
the looser one on `connect-src` (dev endpoints). See F-028.

### 4.3 Worker contexts

Tauri sets the `Content-Security-Policy` header only on HTML responses
(`manager/mod.rs`: `if is_html { … csp_header.replace(…) }`; the protocol handler
adds it only when `asset.csp_header` is present). The PDF.js worker
(`pdf.worker.min.mjs`) and the Tesseract worker (`tesseract/worker.min.js`) are
same-origin URL workers, not blob workers. A Chromium check with a page meta of
`script-src 'self'` and a same-origin URL worker returned `WORKER_WASM_OK`: the
document policy does not apply inside the worker, and the worker response has no
header. The workers therefore run without any CSP. See F-029.

### 4.4 Boot scripts and the pre-paint theme

`public/boot-theme.js` is an external classic script so `script-src 'self'`
holds. It parses `gridscalr.preferences.v1` inside `try/catch`, accepts only a
known palette key, and writes CSS custom properties through the CSSOM. It does
not inject markup, evaluate strings or fetch anything. `public/boot-error.js`
writes error text with `textContent`. Both are safe as written.

### 4.5 WebAssembly verification

`wasm-unsafe-eval` is required for `WebAssembly.instantiate` in a page:
a Chromium check with `script-src 'self'` returned
`WASM_BLOCKED: ... 'unsafe-eval' is not an allowed source of script`. The
current app compiles WebAssembly only inside workers, which the page meta policy
does not reach (4.3), so the meta tag does not block it today. That is an
accident of the worker boundary, not a designed policy: phase 2 must make the
coverage explicit and test OCR and a CCITT/JBIG2 page in a packaged build.

## 5. Filesystem and path safety

### 5.1 Source write guard (verified)

`ensure_writable()` in `src-tauri/src/commands.rs` and the frontend
`assertWritablePath()` compare resolved targets:

- `fs::canonicalize()` resolves symlinks and junctions; a missing tail is kept
  so a not-yet-created target still compares against its real parent.
- `same_file::is_same_file()` catches hard links when the target exists.
- `comparison_key()` lowercases, normalises separators and strips the Windows
  `\\?\` and `\\?\UNC\` verbatim prefixes, so case variants and UNC spellings
  compare equal.
- The guard is applied to project saves, CSV/XLSX/PDF/PNG exports, backups,
  packages and the comparison PDF.

Tests: `commands.rs` covers a protected path, case variants, an alternate
spelling, a symlink and a hard link; `tests/writeGuard.test.ts` covers slash
normalisation, case, empty paths, Windows paths with spaces and Swedish
characters, and the text/CSV/binary write paths.

**Gaps:** the protected-path list is built by the frontend from
`DocumentRef.path` and `relativePath` only. `DocumentRef.originalPath` (the
original drawing behind a managed copy) is not protected (F-031). All Rust tests
run on Linux only at the time of the review; Windows junction, UNC,
trailing-dot, 8.3 and alternate-data-stream behaviour is built but not executed
in CI (F-036). 0.27.0 phase 4 closed the junction, UNC, trailing-dot and
verbatim-prefix part on Windows and fixed a `..` spelling that the guard let
through when the root needed symlink resolution (F-110); 8.3 short-name aliases
and alternate data streams stay untested.

### 5.2 Atomic writes and temporary files

`atomic_write()` writes a flushed sibling named
`.<name>.<pid>.<nanos>.<counter>.tmp`, verifies it, then performs one rename and
syncs the directory. The previous file survives a failed rename. Tests cover a
new file, replacement, a failing replacement, a large payload and a path with no
file name. `project_write` additionally hashes the target immediately before the
rename, verifies the flushed temporary file, and reads the result back.

A crash between the flush and the rename leaves the temporary sibling behind.
It is never cleaned up and contains project data. See F-041.

### 5.3 Managed copies

`source_copy_to_project()` derives the destination from the project path
(`<stem>.drawings/`), sanitizes the display name (control and reserved
characters, Windows device names, 80-character cap), hashes the source, streams
to a flushed temporary sibling, verifies the copy against the source hash, and
renames. It refuses a destination inside any protected source path, and an
existing identical copy is reused. Tests cover the unchanged source, reuse,
protected-folder rejection and name sanitization.

### 5.4 Backups and leases

Backups live under `app_data/backups/<safe-project-id>/`, keep the three newest
files and never enter packages or recent files. `safe_project_id()` replaces
every non-alphanumeric character and truncates to 80, so `../evil/id` becomes
`___evil_id` (tested). Leases are `<project>.lock`, reject a foreign heartbeat,
require ownership to clear and require the explicit `force` flag for a stale
lock (tested). Both are advisory by design; the conditional save is the
guarantee.

### 5.5 Project-relative document paths

`resolveRelativePath()` deliberately allows `..`, because a reference drawing
may legitimately live outside the project folder, and the stored absolute
`path` can point anywhere by design. A malicious project can therefore make the
app read and display any local PDF/TIF it can access. It cannot write to that
file (the resolved path is added to the protected list) and cannot send it
anywhere. This is a trust-model note rather than a boundary escape; see F-034.

## 6. Project and package input

### 6.1 Project JSON

`parseProjectWithReport()` rejects invalid JSON, a missing schema, a newer
schema, a pre-schema-24 project with no document or page, and normalizes
everything else. It:

- assigns stable IDs, repairs duplicate document/page IDs and reports the
  repair;
- validates every page, item, layer, category, count-type, line-type and asset
  reference and reports what it drops;
- requires an image asset to be `data:image/png;base64,` or
  `data:image/jpeg;base64,` with a declared positive width and height;
- skips `__proto__`, `constructor` and `prototype` asset keys, and copies
  untrusted objects only through spreads and explicit field reads, so a JSON
  key cannot mutate a prototype;
- canonicalizes every colour to lowercase `#rrggbb` and never falls back to
  black;
- caps page name/building/floor at 80 characters, category and count-type names
  at their model limits, OCR text at 2 MB per page and 20 000 words, and sheet
  field values at 500 characters.

**Gaps:** there is no byte limit before `read_text()` or `JSON.parse()` and no
cap on the serialized project size. A crafted or simply enormous project can
exhaust WebView memory and lose unsaved work (F-032).

### 6.2 Packages

`inspect_archive()` and `extract_package()` enforce:

- at most 4096 entries, 4 GiB per entry, 16 GiB uncompressed total, 2 MiB
  manifest, and a 200:1 compression-ratio guard above 16 MiB;
- no symbolic links, no encrypted entries, no duplicate names (case-insensitive),
  no `..`, absolute paths, backslashes, colons or empty path segments, and a
  240-character name cap;
- a manifest format and version check, a project-file name check, SHA-256 syntax
  checks, and a reserved-name check;
- unknown, missing and duplicate archive entries are rejected;
- extraction goes to a temporary sibling directory, every file is hashed and
  size-checked against the manifest, the extracted project is re-validated for
  absolute or external document links, and the directory is only then renamed
  into place;
- an existing destination is only replaced when it is a valid extracted package.
  `new` refuses an existing folder; `reuse` only opens a verified folder.

Tests cover zip slip and absolute names, symlinks, encryption, duplicate names,
too many entries, oversized manifests, unknown entries, an external document
link, cancel cleanup, and reuse/replace. The design is sound.

**Gaps:** a 16 GiB uncompressed cap is very large for a desktop project, and the
uncompressed total is not shown before extraction, so a malicious package can
fill the disk (F-033). Top-level control characters other than NUL are accepted
in archive names (a newline becomes a file-name character and fails at creation,
so there is no escape, only an unhelpful error).

### 6.3 TIF and PDF input

- TIF import is capped at 200 MB and 400 megapixels, parses the IFD only, and
  supports 1-bit CCITT G3/G4; other variants are rejected with a message.
- PDF and TIF bytes are passed to PDF.js/Tesseract inside the bundled workers.
  A malformed file can crash or hang the parser but cannot execute
  project-supplied script. Parser vulnerabilities are covered by keeping
  `pdfjs-dist`, `pdf-lib` and Tesseract updated; the dependency gate in phase 4
  is the control.
- PNG/JPEG ingest sniffs the magic bytes, accepts only PNG and JPEG, enforces a
  20 MB and 4000-pixel limit and re-encodes through a canvas.

Residual risk: a compressed image is decoded before the dimension check, so a
decompression bomb depends on the WebView's own decoder limits. This is recorded
as a residual risk, not a numbered finding.

## 7. Frontend injection and data exposure

- No `eval`, `new Function`, string `setTimeout`, `document.write`,
  `insertAdjacentHTML`, dynamic `<script>`/`<style>` creation, `srcdoc` or
  `javascript:` URL exists in `src/`.
- `innerHTML` is used in 34 files. Almost every occurrence is static icon or
  layout markup from bundled constants. The data-bearing cases are the layer
  name (escaped with `escapeHtml` in `layerList.ts` and `statusBar.ts`), the
  layer colour (canonicalized to `#rrggbb`), formatted coordinates and
  translated catalog strings. `statusBar.ts` interpolates `active.color` into a
  `style` attribute without escaping, but the canonical colour makes an
  attribute injection impossible. It is still an unnecessary sink; phase 2
  should set the colour through the CSSOM (F-038).
- The help renderer escapes the whole document before applying inline Markdown,
  resolves images only through the bundled manifest and renders external links
  as non-clickable text. Tests cover raw HTML, script tags, image attributes and
  `javascript:` links.
- File names, project names, layer names, page names, room names, symbol tags,
  stamp text and imported strings are rendered through `textContent` unless they
  are explicitly escaped. No untrusted string reaches an `innerHTML` sink
  unescaped.
- Diagnostics replace Windows and POSIX path patterns with `<path>`, cap each
  line at 400 characters and keep 80 entries; tests cover paths, URLs, control
  characters and long text. Startup errors are written with `textContent`.
- No secret, token, password or key is stored. A PDF password is held in memory
  for the open attempt only and never serialized. Recent files store absolute
  paths in `localStorage` (local convenience only) and are excluded from
  diagnostics.

## 8. Dependencies and supply chain

### 8.1 npm

- `npm audit`: **0 vulnerabilities** after 0.24.0 phase 4. The ten moderate
  development-only findings came from `minimatch 10.2.6`
  (GHSA-g3hv-75wg-m249, Dependabot alert #4) through `eslint 10.14.0` and
  `typescript-eslint 8.72.1`. They are fixed by a scoped
  `overrides: { "minimatch": "^11.0.1" }` entry in `package.json`; lint, the
  full test suite and the build pass with it (F-039).
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Runtime versions reviewed: `pdfjs-dist 6.4.299`, `pdf-lib 1.17.1`,
  `tesseract.js 7.0.0`, `@tauri-apps/api 2.12.4`, `fflate 0.8.3`,
  `intl-messageformat 12.1.4`.
- `npm run check:dependencies` runs `npm audit` on every pull request and
  release build and applies the reviewed allowlist in
  `security/dependency-allowlist.json`.

### 8.2 Rust

An OSV batch query covered all 462 packages in `src-tauri/Cargo.lock`.

| Package | Version | Advisory | Assessment |
| --- | --- | --- | --- |
| `glib` | 0.18.5 | GHSA-wrw7-89jp-8q8g / RUSTSEC-2024-0429 | Real soundness bug, fixed in 0.20.0. Linux/GTK only; Windows builds do not use it. Tracked by [#21](https://github.com/MajorJohnDoe/gridscalr/issues/21) and Dependabot alert #1. Cannot be upgraded independently because Tauri's GTK 0.18 generation pins it. |
| `zvariant`, `zbus_names`, `zvariant_derive` | 5.15.1, 4.3.5, 5.15.1 | RUSTSEC-2026-0370/0371/0372 | Unmaintained, not vulnerable. Reached only through `tauri-plugin-single-instance` → `zbus 5.19.0` on Linux. |
| `proc-macro-error` | 1.0.4 | RUSTSEC-2024-0370 | Unmaintained, not vulnerable. Build-time only, through `glib-macros`/`gtk`. |

No advisory was found for `tauri 2.12.5`, `wry 0.57.0`, `zip 9.2.1`,
`sha2 0.11.1`, `same-file 1.0.6`, `base64 0.23.1`, `serde_json 1.0.154`,
`tauri-plugin-dialog 2.8.4`, `tauri-plugin-window-state 2.5.0` or
`tauri-plugin-single-instance 2.5.5`. The earlier `tokio` alert (Dependabot #2)
is fixed.

`npm run check:dependencies` now runs this scan as `cargo audit` on every pull
request and release build. The five findings above are the complete reviewed
allowlist for `src-tauri`, each with a reason and a `reviewBy` date of
2027-02-11; a new vulnerability or unmaintained warning fails until it is fixed
or explicitly accepted (F-040).

Licences: `cargo metadata` over all 462 packages reports 205 `MIT OR
Apache-2.0`, 113 `MIT`, 49 `Apache-2.0 OR MIT`, 18 `Unicode-3.0`, 17
`Zlib OR Apache-2.0 OR MIT` and smaller groups. Five crates are MPL-2.0
(`cssparser`, `cssparser-macros`, `dtoa-short`, `option-ext`, `selectors`) and
`r-efi` offers MIT/Apache as alternatives to LGPL-2.1-or-later. No GPL or AGPL
is linked. `THIRD_PARTY_NOTICES.md` lists the direct runtime crates and keeps a
blanket line for the rest; phase 4 should confirm that is enough for the five
MPL-2.0 crates.

### 8.3 GitHub Actions

Every workflow uses `permissions:` with `contents: read` (Pages additionally
needs `pages: write` and `id-token: write`). No `pull_request_target` and no
secret is passed to a build. Actions are referenced by mutable major tags
(`actions/checkout@v7`, `upload-artifact@v7`, `Swatinem/rust-cache@v2`,
`dtolnay/rust-toolchain@stable`), not commit SHAs, so a moved tag would run new
code in the release build (F-035).

### 8.4 Network expectations

A static search found no `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`
or `importScripts` in `src/`. `fetch()` is used only for Vite-bundled
same-origin font URLs and for a `data:` report logo. PDF.js, Tesseract, the
traineddata files and the WASM cores are bundled locally by `vite.config.ts`.
There is no telemetry, update check or remote endpoint. The page policy enforces
this for the page; the workers do not (F-029). A regression test that asserts
the static and runtime expectation is proposed for phase 4/5.

## 9. Findings

### F-028 — The shipped page has two CSP policies, and the production build keeps dev origins

- **Severity:** P2
- **Status:** fixed in 0.24.0 phase 2 — dev meta tag removed, one production policy, hardening directives added; `freezePrototype` was evaluated and kept off with a recorded reason (pdf-lib overrides `toString`); see [security-policy.md](security-policy.md).
- **Owner:** phase 2, [#168](https://github.com/MajorJohnDoe/gridscalr/issues/168)
- **Evidence:** `index.html` declares a meta CSP with `script-src 'self'` and
  `connect-src ... ws://localhost:1420 http://localhost:1420`.
  `src-tauri/tauri.conf.json` declares a different policy with
  `script-src 'self' 'wasm-unsafe-eval'` and no dev origins. Tauri adds its
  policy as an HTML response header and keeps the meta tag, so both apply in
  production. `docs/` and the CSP tests do not compare them.
- **Impact:** The production app still allows the page to open an HTTP or
  WebSocket connection to `localhost:1420`. The two policies can drift further;
  a future main-thread WebAssembly use would fail against the meta tag while
  passing against the configured policy. Hardening directives (`object-src`,
  `base-uri`, `frame-src`, `form-action`) are missing and `freezePrototype` is
  off.
- **Proposed fix:** Make one policy authoritative. Either remove the static meta
  tag and rely on the Tauri header, or generate the meta from the config for
  each mode. Keep the dev HMR origins in `devCsp` only. Add
  `object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'`.
  Evaluate `freezePrototype: true` against the full UI suite (PDF.js, pdf-lib,
  Tesseract and Intl) and keep it only if nothing breaks.
- **Acceptance criteria:** a packaged build's effective page policy contains no
  `localhost`, `127.0.0.1` or `ws:` origin; there is exactly one page policy;
  `wasm-unsafe-eval` is present only where the page actually needs it; the four
  hardening directives are present; a test compares the built HTML with the
  configured policy; `npm run test:ui`, `test:canvas`, `test:count`, `test:touch`
  and the packaged smoke test stay green.

### F-029 — Worker contexts are outside the configured CSP

- **Severity:** P2
- **Status:** fixed in 0.24.0 phase 2 — both bundled workers start from blob shims and inherit the page policy; see [security-policy.md](security-policy.md).
- **Owner:** phase 2, [#168](https://github.com/MajorJohnDoe/gridscalr/issues/168)
- **Evidence:** `src/pdf/pdfRenderer.ts` sets
  `GlobalWorkerOptions.workerSrc` to a same-origin URL;
  `src/search/ocr.ts` creates a Tesseract worker with `workerPath` and
  `workerBlobURL: false`, also same-origin. In Tauri, the `Content-Security-Policy`
  header is attached only to HTML assets (`src/manager/mod.rs`), and Chromium
  does not apply a document's meta CSP to a same-origin URL worker. A Chromium
  check with a page meta of `script-src 'self'` returned `WORKER_WASM_OK` for a
  worker, proving the page policy did not reach it.
- **Impact:** `script-src`, `connect-src` and `worker-src` do not constrain what
  the PDF.js and Tesseract workers can load or fetch. A compromised bundled
  worker (supply chain) could call `importScripts` or `fetch` to any origin
  without a CSP violation, which would break the "no network" expectation.
  There is no current malicious worker code and no remote URL in the bundled
  assets, so this is containment, not an active exploit.
- **Proposed fix:** Give worker responses a policy. Options: set the CSP header
  on all custom-protocol assets (Tauri `app.security.headers` or a
  `web_resource_request_handler`), or create each worker from a `blob:` URL so
  it inherits the document policy, and keep `worker-src 'self' blob:` as needed.
  Verify that PDF.js and Tesseract still start under the chosen approach.
- **Acceptance criteria:** the actual PDF.js and Tesseract worker contexts carry
  a policy that blocks `fetch("https://example.com")` and `importScripts` of a
  remote URL; OCR on a scanned page and a CCITT/JBIG2 PDF still work; a test
  covers the worker policy.

### F-030 — `core:default` grants more than GridScalr uses

- **Severity:** P2
- **Status:** fixed in 0.24.0 phase 2 — explicit event, window and dialog permissions only; see [security-policy.md](security-policy.md).
- **Owner:** phase 2, [#168](https://github.com/MajorJohnDoe/gridscalr/issues/168)
- **Evidence:** Section 3.1. `core:default` expands to nine sets including
  `core:menu`, `core:tray`, `core:image` (`from-path` reads arbitrary image
  files), `core:webview` (`internal-toggle-devtools`) and
  `core:path`. The frontend imports only `api/core`, `api/window`, `api/webview`
  and `api/event`; it never creates a native menu, tray or image. `allow-close`
  is also unused because the close flow calls `destroy()`.
- **Impact:** Every extra permission is reachable after a renderer compromise.
  Native menu and tray creation, image-from-path reads and devtools toggling are
  unnecessary capabilities for a local measurement app.
- **Proposed fix:** Replace `core:default` with `core:event:default` and the six
  explicit window permissions; drop `allow-close`. Keep `dialog:default` as is.
  Confirm the custom title bar, close prompt, resize listener, drag-and-drop and
  launch-path listener still work.
- **Acceptance criteria:** `capabilities/default.json` contains no permission
  the app does not call; a comment or the capability description states why each
  remaining permission exists; the UI, canvas, touch and packaged smoke tests
  pass; `npm run check:docs` and the security section of the user guide match.

### F-031 — The write guard ignores the original path of a managed copy

- **Severity:** P2
- **Status:** fixed in 0.24.0 phase 3 — `sourceDocumentPaths()` adds every non-empty `originalPath` and the managed-copy folder, and both guards reject a destination inside it.
- **Owner:** phase 3, [#169](https://github.com/MajorJohnDoe/gridscalr/issues/169)
- **Evidence:** `sourceDocumentPaths()` in `src/io/projectFile/paths.ts` adds
  `document.path` and the resolved `relativePath` only. A managed document keeps
  its original drawing in `DocumentRef.originalPath`
  (`src/features/sourceStorage/managedCopy.ts`), and that path is never added to
  the protected list used by saves, exports, backups and packages.
- **Impact:** The original drawing behind a managed copy can be overwritten if
  the user chooses it as a save or export target. A second Save As to the
  original source would destroy it, which is exactly the failure the guard
  exists to prevent. The managed copy itself remains protected.
- **Proposed fix:** Add every non-empty `originalPath` to
  `sourceDocumentPaths()`, and cover it in the write-guard and save tests. Keep
  the provenance path after **Detach from source** only if it still points at a
  source that must be protected; decide explicitly.
- **Acceptance criteria:** a save or export whose target equals an
  `originalPath` is refused on desktop and in the browser fallback; a Rust test
  and a frontend test cover it; the managed copy and its original are both
  listed as protected in diagnostics without leaking paths.

### F-032 — No byte limit on project or file reads

- **Severity:** P2
- **Status:** fixed in 0.24.0 phase 3 — project reads are capped at 256 MB, source reads at 1 GiB and backup writes at 256 MB, with a structured `fileTooLarge` error; `source_find_by_hash` has a total-byte budget.
- **Owner:** phase 3, [#169](https://github.com/MajorJohnDoe/gridscalr/issues/169)
- **Evidence:** `read_text`, `read_binary` and `file_size` accept any path and
  read or hash the whole file. `parseProjectWithReport()` calls `JSON.parse()`
  on the returned string with no size check. `save_project_backup` writes a
  supplied string without a cap. `source_find_by_hash` hashes up to 4096
  matching files with no total-byte budget.
- **Impact:** A crafted or oversized `.gridscalr` can exhaust WebView memory
  during open and lose unsaved work. A multi-gigabyte reference PDF has the same
  effect. The browser fallback has the same limit for a picked project.
- **Proposed fix:** Add a project-file byte limit before the read (for example
  256 MB, chosen against the documented large-project benchmark), a per-source
  read limit with a clear "too large" message, and a total-byte budget for
  `source_find_by_hash`. Keep the limit a named constant and test it at the
  boundary.
- **Acceptance criteria:** opening a file above the limit fails with a localized
  message and leaves the current project untouched; the limit is documented in
  `docs/limitations.md`; tests cover the boundary and the large-project
  benchmark still passes.

### F-033 — Package extraction can write 16 GiB without disclosure

- **Severity:** P2
- **Status:** fixed in 0.24.0 phase 3 — the uncompressed cap is 2 GiB (1 GiB per entry), the dialog shows the unpacked size and extraction checks free space with a 64 MiB reserve.
- **Owner:** phase 3, [#169](https://github.com/MajorJohnDoe/gridscalr/issues/169)
- **Evidence:** `MAX_TOTAL_BYTES = 16 GiB` and `MAX_ENTRY_BYTES = 4 GiB` in
  `src-tauri/src/package.rs`. `package_inspect` returns the manifest and
  destination but not the uncompressed total, and extraction does not check free
  space before writing.
- **Impact:** A malicious or corrupted package can fill the disk before the
  per-file checksum or the destination rename completes. The temporary directory
  is removed on error, but the disk can be exhausted first.
- **Proposed fix:** Compute the uncompressed total from the manifest during
  inspection, show it in the open-package dialog, and refuse extraction when the
  destination volume has insufficient free space. Decide whether 16 GiB is the
  right 1.0 cap; a lower default with an explicit override is preferable.
- **Acceptance criteria:** the dialog shows the uncompressed size; extraction
  refuses with a clear message when space is insufficient; tests cover a package
  above the cap and a simulated low-space destination; the cap is documented.

### F-034 — An untrusted project can reference any local path

- **Severity:** P2
- **Status:** fixed in 0.24.0 phase 3 — opening a project with an out-of-folder reference shows a localized, dismissible banner with the existing copy/relink actions, and the project doctor lists the same warning.
- **Owner:** phase 3, [#169](https://github.com/MajorJohnDoe/gridscalr/issues/169), plus a documentation note
- **Evidence:** `normalizeDocument()` accepts any non-empty `path` and
  `relativePath`. `resolveRelativePath()` resolves `..` by popping parts.
  `documentFlows` reads the stored absolute path first and then the resolved
  relative path. The existing test asserts
  `resolveRelativePath("/home/ana/projects/plan.gridscalr", "../../drawings/a.pdf") === "/home/ana/drawings/a.pdf"`,
  so escaping the project folder is intentional.
- **Impact:** Opening a `.gridscalr` from an untrusted source can make the app
  read, hash and display any local PDF/TIF the user can access, including files
  outside the project folder. The resolved path is added to the protected list,
  so the app will not write to it, and there is no network egress, so this is
  disclosure to the local screen rather than exfiltration. It still contradicts
  a naive reading of the "path traversal" guarantee in `SECURITY.md`.
- **Proposed fix:** State the trust model explicitly in `SECURITY.md` and the
  user guide: a project is executable input and may reference local files;
  open untrusted projects only after review. Add a project-doctor warning when a
  document resolves outside the project folder and its managed drawings folder,
  without blocking a legitimate reference. Do not confine paths to the project
  folder, because that would break the reference mode.
- **Acceptance criteria:** the documentation says what a project may reference
  and what opening an untrusted project can do; the doctor lists out-of-folder
  references as a warning; a test covers an external reference and a `..`
  reference without rejecting either.

### F-035 — GitHub Actions are referenced by mutable tags

- **Severity:** P2
- **Status:** open
- **Owner:** phase 4, [#170](https://github.com/MajorJohnDoe/gridscalr/issues/170)
- **Evidence:** `.github/workflows/ci.yml`, `release.yml` and `pages.yml` use
  `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`,
  `actions/download-artifact@v5`, `actions/configure-pages@v6`,
  `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`,
  `Swatinem/rust-cache@v2` and `dtolnay/rust-toolchain@stable`.
- **Impact:** A moved or compromised tag runs new code in the build that
  produces the Windows, macOS and Linux release artifacts. Tokens are
  read-only, but the artifacts themselves are the target. The builds are
  unsigned, so a tampered artifact is hard for a user to detect.
- **Proposed fix:** Pin every action to a full commit SHA with the version in a
  comment, and let Dependabot update the pins. Keep `dtolnay/rust-toolchain`
  intentionally tracked or pin its stable toolchain explicitly.
- **Acceptance criteria:** no workflow uses a mutable tag for a third-party
  action; Dependabot covers the pinned actions; the release workflow still
  produces all artifacts and the merged checksum file.

### F-036 — Windows path guarantees are built but not tested on Windows

- **Severity:** P3
- **Status:** fixed — 0.27.0 phase 4 ([#199](https://github.com/MajorJohnDoe/gridscalr/issues/199))
- **Owner:** phase 3, [#169](https://github.com/MajorJohnDoe/gridscalr/issues/169)
- **Evidence:** `cargo test --lib` runs only in the Ubuntu `rust` job. The
  Windows and macOS `desktop` jobs build and smoke-test the packaged app but do
  not run the Rust unit tests. The symlink and hard-link tests are `#[cfg(unix)]`
  or skipped when the filesystem refuses.
- **Impact:** Junctions, UNC paths, verbatim prefixes, trailing dots or spaces,
  8.3 short names and alternate data streams are handled in
  `resolved_path()`/`comparison_key()` but never exercised on Windows. A
  regression in the source write guard would ship undetected.
- **Proposed fix:** Run `cargo test --lib` on Windows (and optionally macOS) in
  CI, and add Windows-only tests for a junction, a UNC-style spelling and a
  trailing-dot target. If runner time is a concern, run the save and package
  test modules only.
- **Acceptance criteria:** the Windows CI job runs the relevant Rust tests; at
  least one Windows-only test covers a junction and a trailing-dot alias.
- **Resolution:** `cargo test --lib` runs on every `desktop` matrix entry, and
  `src-tauri/src/path_guard_windows_tests.rs` adds a junction escape, a
  trailing-dot/space alias of a protected source, drive-relative rejection, UNC
  spellings, a real case-insensitive comparison and a verbatim-prefix case that
  fails if the canonicalization branch is removed. A host that cannot create a
  junction records the `mklink` reason instead of passing silently. The matrix
  coverage is recorded in [`testing.md`](testing.md).

### F-037 — Test-only IPC commands are shipped in release builds

- **Severity:** P3
- **Status:** fixed in 0.24.0 phase 2 — smoke commands compile with debug assertions only; see [security-policy.md](security-policy.md).
- **Owner:** phase 2, [#168](https://github.com/MajorJohnDoe/gridscalr/issues/168)
- **Evidence:** `smoke_test_dir` and `finish_smoke_test` are registered
  unconditionally in `src-tauri/src/lib.rs`. `finish_smoke_test` calls
  `app.exit(code)`.
- **Impact:** No data exposure. A renderer script could read the smoke-test
  directory string (a path) or exit the app, which is a small capability that
  exists only for CI.
- **Proposed fix:** Register the commands only when `--smoke-test` was supplied,
  or behind `#[cfg(debug_assertions)]` with a release build that still supports
  the packaged smoke test. The packaged smoke test must keep working.
- **Acceptance criteria:** a normal release build has no `finish_smoke_test`
  handler; the CI smoke test still opens, saves, reopens and exits with a
  result file.

### F-038 — `style-src 'unsafe-inline'` is only needed by two static declarations

- **Severity:** P3
- **Status:** fixed in 0.24.0 phase 2 — boot styles moved to public/boot.css, status bar uses the CSSOM; see [security-policy.md](security-policy.md).
- **Owner:** phase 2, [#168](https://github.com/MajorJohnDoe/gridscalr/issues/168)
- **Evidence:** `index.html` contains an inline `<style>` block for the boot
  fallback. `src/ui/statusBar.ts` builds a `style="color:${active.color}"`
  attribute inside an `innerHTML` string. Every other style change uses the
  CSSOM (`element.style...`), which does not require `'unsafe-inline'`.
- **Impact:** `'unsafe-inline'` weakens the style policy and makes a style
  injection (if an HTML sink were ever introduced) easier. The status-bar value
  is canonicalized, so there is no current injection.
- **Proposed fix:** Move the boot styles into an external CSS file loaded before
  paint (the theme bootstrap already sets the custom properties), and set the
  status-bar colour with `element.style.color` instead of an attribute string.
  Then drop `'unsafe-inline'` from `style-src` in both policies.
- **Acceptance criteria:** the production policy has no `'unsafe-inline'`; the
  boot fallback still paints before first paint in all five themes; the status
  bar shows the active layer colour; visual regression tests pass.

### F-039 — Development-only npm advisory remains open

- **Severity:** P3
- **Status:** fixed in 0.24.0 phase 4 — `package.json` scopes `minimatch` to
  `^11.0.1`; `npm audit` reports 0 and lint, tests and build pass.
- **Owner:** phase 4, [#170](https://github.com/MajorJohnDoe/gridscalr/issues/170)
- **Evidence:** `npm audit` originally reported 10 moderate findings, all from
  `minimatch 10.2.6` (GHSA-g3hv-75wg-m249, Dependabot alert #4) through
  `eslint 10.14.0` and `typescript-eslint 8.72.1`. `npm audit --omit=dev`: 0.
  The advisory is a glob denial of service in tooling.
- **Impact:** No shipped code was affected. A developer running lint or a script
  on attacker-controlled glob input could hit a slowdown.
- **Resolution:** A scoped npm `overrides` entry resolves `minimatch` to 11.0.7
  for ESLint and typescript-eslint, whose declared ranges still stop at 10.x.
  `npm run lint`, `npm run test:ui` and the full suite pass. The override is
  temporary: remove it when both tools declare minimatch 11 (F-048).
- **Acceptance criteria:** `npm audit` reports no moderate or higher advisory,
  or the remaining advisory is explicitly accepted in the audit gate with a
  date and reason; lint still passes.

### F-040 — Rust audit: one accepted soundness advisory and four unmaintained crates

- **Severity:** P3
- **Status:** accepted in 0.24.0 phase 4, glib tracked by
  [#21](https://github.com/MajorJohnDoe/gridscalr/issues/21). The dependency
  gate runs `cargo audit` on every pull request and release build and accepts
  these five entries with a reason and a review expiry of 2027-02-11.
- **Owner:** phase 4, [#170](https://github.com/MajorJohnDoe/gridscalr/issues/170)
- **Evidence:** Section 8.2. `glib 0.18.5` (GHSA-wrw7-89jp-8q8g,
  Dependabot alert #1) is pinned by Tauri's GTK 0.18 generation.
  `proc-macro-error 1.0.4`, `zvariant 5.15.1`, `zbus_names 4.3.5` and
  `zvariant_derive 5.15.1` are unmaintained (RUSTSEC-2024-0370 and
  RUSTSEC-2026-0370/0371/0372), not vulnerable.
- **Impact:** The glib bug is a soundness issue in a Linux-only code path that
  GridScalr does not call directly; the Windows artifacts are unaffected. The
  unmaintained crates have no known vulnerability but will not receive fixes.
- **Resolution:** `security/dependency-allowlist.json` records the five
  accepted entries. The gate fails on an expired entry, a stale entry, a new
  vulnerability or a new unsound/unmaintained/yanked crate. `glib`, `zvariant`,
  `zbus_names`, `zvariant_derive` and `proc-macro-error` are only accepted while
  Tauri's GTK 0.18 generation remains; the entries are reviewed quarterly.
- **Acceptance criteria:** the dependency gate runs on every pull request and
  fails on a new advisory; the five accepted entries are listed with a reason;
  the glib alert closes or is explicitly accepted for 1.0.

### F-041 — A crashed save leaves project data in a temporary sibling

- **Severity:** P3
- **Status:** fixed in 0.24.0 phase 3 — the next save removes stale generated temporary siblings older than ten minutes, never one owned by the running process.
- **Owner:** phase 3, [#169](https://github.com/MajorJohnDoe/gridscalr/issues/169)
- **Evidence:** `atomic_write()` and `write_conditional()` create
  `.<name>.<pid>.<nanos>.<counter>.tmp` next to the target. The failure test
  asserts that the flushed temporary file remains after an injected replace
  failure.
- **Impact:** A crash between flush and rename leaves a full project copy beside
  the project, including in a cloud-synced folder, and it is never cleaned up.
  On a shared folder it can be synced or seen by another person.
- **Proposed fix:** On open or on the next successful save, remove stale
  `.name.*.tmp` siblings that belong to the same target and are older than a
  short threshold. Never delete a temporary file that another live process may
  still own; use the PID plus age.
- **Acceptance criteria:** a stale temporary file older than the threshold is
  removed on the next save or open; a fresh temporary file is untouched; tests
  cover both cases and the crash test still proves the previous project stays
  readable.

### F-042 — IPC error details expose absolute paths

- **Severity:** P3
- **Status:** fixed in 0.24.0 phase 2 — error dialogs add a copy action that removes absolute paths and keeps the error code; see [security-policy.md](security-policy.md).
- **Owner:** phase 2, [#168](https://github.com/MajorJohnDoe/gridscalr/issues/168) or a small follow-up
- **Evidence:** `CommandError.detail` and `WriteError.detail` embed the full path
  and OS error text, for example `{path}: Permission denied`.
  `src/io/platformError.ts` shows the detail as a technical line, and the user
  can select and copy it. Diagnostics replace paths, but the error dialog text
  does not.
- **Impact:** A screenshot or copied error can reveal a customer folder or
  drawing name. Local screen only; no automatic upload.
- **Proposed fix:** Keep the detail for support but offer a **Copy sanitized
  details** action, or sanitize the path in the dialog and keep the raw text in
  the on-screen technical line only. Do not remove the detail from the local
  display, because it is needed for troubleshooting.
- **Acceptance criteria:** a copied error never contains an absolute path; the
  on-screen detail is still useful; tests cover the sanitizer.

### F-043 — PDF export embeds a wall-clock time, so byte-identical output is not guaranteed

- **Severity:** P3
- **Status:** open
- **Owner:** phase 5, [#171](https://github.com/MajorJohnDoe/gridscalr/issues/171)
- **Evidence:** `src/pdf/pdfExport.ts` calls `PDFDocument.create()` with the
  pdf-lib default `updateMetadata: true`. pdf-lib writes
  `/ModificationDate (D:YYYYMMDDHHmmSSZ)` with second precision; the exported
  object stream contains `D:20261111073258Z`. The `pdfExport` test that exports
  the same project twice and compares bytes fails when the two exports straddle
  a second boundary. The phase 1 PR failed once on that assertion and passed on
  a local re-run.
- **Impact:** Test reliability only. Content and quantities are unchanged; no
  security property depends on the timestamp. A byte-for-byte reproducibility
  claim for exports is imprecise.
- **Proposed fix:** Create the document with `updateMetadata: false` and set a
  project-derived timestamp, or compare exports after normalising the metadata
  date. Choose one and make the test deterministic.
- **Acceptance criteria:** two exports of the same project are byte-identical
  regardless of when they run; the test no longer depends on timing; the export
  metadata still identifies GridScalr and the app version.

## 10. Verified mitigations

| Mitigation | Evidence | Tested |
| --- | --- | --- |
| Source write guard (canonical, symlink, hard link, case, UNC prefix) | `commands.rs`, `path_guard.rs`, `writeGuard.ts` | Rust tests on Ubuntu, Windows and macOS, `tests/writeGuard.test.ts` (F-036 fixed) |
| Conditional save, conflict and read-back | `project_write.rs`, `saveIntegrity/controller.ts` | Rust tests, `tests/robustness/saveConflict.test.ts` |
| Crash between flush and rename keeps the previous file | `project_write.rs` injected replace | Rust test |
| Source drawing is never written by packaging or consolidation | `source_copy.rs`, `copyActions.ts` | Rust tests, `tests/robustness/sourceStorage.test.ts` |
| Package zip slip, symlink, encryption, duplicates, unknown and missing entries | `package.rs` | Rust tests |
| Package extraction temp directory and destination guard | `package.rs` | Rust tests |
| Backup ID sanitization and rotation | `project_backup.rs` | Rust tests |
| Lease ownership and explicit force | `project_lease.rs` | Rust tests |
| Project normalisation, duplicate repair and load report | `projectFile/parse.ts`, `integrity.ts` | `tests/projectFile.test.ts`, `tests/integrity.test.ts`, migration corpus |
| Asset MIME/data validation and dangerous-key rejection | `projectFile/assets.ts` | `tests/projectFile.test.ts` |
| Diagnostics path sanitization | `features/diagnostics/model.ts` | `tests/diagnostics.test.ts` |
| Safe Markdown and help rendering | `help/markdown.ts` | `tests/markdown.test.ts` |
| No `eval`, dynamic script or untrusted `innerHTML` sink | Section 7 | Static review; no automated guard |
| Local-only assets for OCR, PDF.js and fonts | `vite.config.ts`, `search/ocr.ts`, `pdf/export/fonts.ts` | Static review; a network regression test is proposed |
| Capability and CSP configuration | `capabilities/default.json`, `tauri.conf.json` | No automated check (F-028, F-030) |

## 11. Proposed follow-up issues

The conductor creates these after review. Existing phases keep their scope.

| Proposal | Reason | Suggested labels |
| --- | --- | --- |
| Pin GitHub Actions to commit SHAs (F-035) | Release-artifact supply chain | `tooling`, `tech-debt` |
| Add a no-unexpected-network regression test and a CSP/worker policy test (F-029, Section 8.4) | The "no network" claim is not automated | `tests`, `tech-debt` |
| Add a project/package trust note and an out-of-folder reference warning (F-034) | Users need to know what opening an untrusted project can do | `documentation`, `enhancement` |
| Clean stale atomic-write temporary siblings (F-041) | Project data left beside the project after a crash | `bug`, `tech-debt` |
| Sanitize copied error details (F-042) | Path disclosure in support screenshots | `enhancement` |
| Make PDF export byte-deterministic and deflake its test (F-043) | The phase 1 CI run hit a wall-clock flake; the export claims determinism | `tests`, `tech-debt` |
| Run the Rust test suite on Windows and add Windows path tests (F-036) | The path guarantee is Windows-relevant and untested there — done in [#199](https://github.com/MajorJohnDoe/gridscalr/issues/199) | `tests`, `tech-debt` |

The remaining findings map to existing phases 2–5 and do not need a new issue.

### Observations

These are not security findings and have no F-ID:

- The CI run for this audit failed once on the PDF export determinism test.
  That is a pre-existing wall-clock flake, recorded as F-043, not a regression
  from this change. A re-run is expected to pass.
- `package-lock.json` recorded the root package version as `0.22.4` while
  `package.json` was `0.23.0`. Resolved in 0.24.0 phase 4; `npm run
  check:versions` now compares `package-lock.json` with the other three files.
- The `minimatch` override is outside ESLint's declared `^10.2.6` range. It is
  a deliberate, tested exception recorded as F-048; remove it when ESLint and
  typescript-eslint declare minimatch 11.
- The `style` attribute in `statusBar.ts` and the inline boot `<style>` are the
  only reasons for `'unsafe-inline'`. Both are removed by F-038; no separate
  issue is needed.
- `tauri-plugin-fs` is compiled through `tauri-plugin-dialog` but is never
  registered and has no capability, so none of its commands are reachable. This
  is correct; a future fs plugin registration must add an explicit scoped
  capability.

## 12. Residual risks and accepted trade-offs

- A local attacker with the user's privileges can read and write the same files
  as GridScalr. No local app can prevent that; the conditional save protects
  against accidental concurrency, not against a hostile process.
- Packages are unencrypted and unsigned. Checksums detect corruption and
  accidental changes, not deliberate tampering.
- The project file is trusted input. A project may reference any local drawing
  by design (F-034).
- PDF.js, pdf-lib, Tesseract and the TIF reader are third-party parsers. A
  malformed file can crash the parser; the app isolates loading failures but
  does not sandbox the parsers.
- The WebView is the security boundary. A WebView 2/WebKit engine vulnerability
  is outside this audit; keeping the OS and WebView current is the mitigation.
- The `glib` advisory is a Linux-only soundness issue that cannot be fixed
  independently of Tauri's GTK generation (F-040, issue #21).
- Windows and macOS builds are unsigned. Verify the published SHA-256 before
  running a download.

## 13. How to re-run the checks

```bash
npm run check:dependencies
npm audit
npm audit --omit=dev
npm run check:docs
npm run check:i18n
npm run test:robustness
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

`npm run check:dependencies` replaces the manual OSV batch described below. It
runs `npm audit` and `cargo audit` and applies
`security/dependency-allowlist.json`; the raw reports are written to
`dependency-reports/` in CI and attached to the workflow run.
