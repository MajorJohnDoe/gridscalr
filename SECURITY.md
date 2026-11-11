# Security policy

## Supported versions

GridScalr is pre-1.0. Only the latest release receives security fixes.

| Version | Supported |
| --- | --- |
| 0.23.x | Yes |
| Older | No |

From 1.0, the latest minor release receives fixes and older minors are supported
only by an explicit decision in the release notes. The supported platforms are
Windows, macOS and Linux; the browser build is a development fallback and is not
a supported deployment target.

## Reporting a vulnerability

Report privately through GitHub's
[security advisory form](https://github.com/MajorJohnDoe/gridscalr/security/advisories/new).
Do not open a public issue for a vulnerability.

Please include the version, platform, reproduction steps and the impact you
expect. You will get an acknowledgement as soon as possible, and credit in the
advisory once a fix is released unless you prefer to stay anonymous.

## Design guarantees

GridScalr has no accounts, cloud sync, telemetry or network access. It reads
drawings from disk, writes only where you ask it to, and never modifies the
source PDF or TIF. The following are treated as security bugs:

- Writing to a path that matches a source document in the project.
- Rendering or exporting an item that is hidden, or allowing edits to a locked item.
- Loading a project file that escapes its own asset references or treats untrusted
  JSON as code.
- Any path traversal when resolving a project's relative document paths.
- Any network request made by the desktop app outside the local IPC bridge,
  including from a Web Worker.
- A Tauri capability or permission that is broader than the app needs.
- A Content Security Policy that is not the policy actually enforced by the
  shipped WebView.

## Project and package input

A `.gridscalr` project and a `.gridscalr.zip` package are input, not code. They
are parsed as data, validated and bounded; they cannot execute script. A project
does reference source drawings by absolute or relative path, because reference
mode intentionally allows drawings outside the project folder. Opening a project
from an untrusted source can therefore make GridScalr read and display local PDF
or TIF files that the project names, although it cannot write to them or send
them anywhere. Review an untrusted project before opening it, or ask the sender
for a package and verify its checksums.

Packages are unencrypted and unsigned. Their manifest checksums detect
corruption and accidental changes, not deliberate tampering.

## Dependencies

A dependency and advisory gate runs on every pull request and before a release
build. `npm run check:dependencies` audits `package-lock.json` with `npm audit`
and `src-tauri/Cargo.lock` with `cargo audit`, then applies the reviewed entries
in [`security/dependency-allowlist.json`](security/dependency-allowlist.json).
A new advisory at or above moderate blocks unless it is accepted with a reason
and a review expiry. The gate fails closed when it cannot read the advisory
databases; it never reports an unverified tree as clean.

The current exceptions are the Linux-only `glib` soundness advisory tracked by
[#21](https://github.com/MajorJohnDoe/gridscalr/issues/21) and four unmaintained
Rust crates with no known vulnerability. The npm advisory in development-only
tooling was fixed with a scoped override. The full process, threshold and current
position are in [`docs/security-policy.md`](docs/security-policy.md).

## 1.0 guidance

The 0.24.0 security audit is recorded in
[`docs/security-audit.md`](docs/security-audit.md). It contains the threat model,
the asset list, the capability and CSP review, the dependency results and the
P0–P3 findings with acceptance criteria. Before 1.0:

- no unaccepted P0 or P1 finding remains;
- a dependency and advisory gate runs on every pull request;
- the configured CSP covers the page and the bundled Web Workers, and the
  shipped policy contains no development origin;
- Tauri capabilities are limited to the permissions the app calls;
- the write guard protects a managed copy's original drawing as well as the
  copy;
- the Windows path and write-guard tests run on Windows;
- `docs/limitations.md` and this policy agree on every accepted risk.

The CSP and capability items are enforced by `npm run check:security` against
[`security/policy.json`](security/policy.json) and verified by
`npm run test:csp`; see [`docs/security-policy.md`](docs/security-policy.md). The
dependency item is enforced by `npm run check:dependencies` and the reviewed
allowlist.

## Unsigned builds

Windows installers are not code-signed. See the "Windows SmartScreen" section in
`README.md` for what that means and how to verify a download with its SHA-256
checksum. An unsigned build is not a vulnerability by itself, but a tampered
checksum is — report it.
