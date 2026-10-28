# Security policy

## Supported versions

GridScalr is pre-1.0. Only the latest release receives fixes.

| Version | Supported |
| --- | --- |
| 0.7.x | Yes |
| Older | No |

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
- Any network request made by the desktop app outside the local IPC bridge.
- A Tauri capability or permission that is broader than the app needs.

## Unsigned builds

Windows installers are not code-signed. See the "Windows SmartScreen" section in
`README.md` for what that means and how to verify a download with its SHA-256
checksum. An unsigned build is not a vulnerability by itself, but a tampered
checksum is — report it.
