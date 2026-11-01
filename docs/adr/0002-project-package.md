# ADR 0002: Portable project packages

- Status: Accepted
- Date: 2026-11-01
- Deciders: GridScalr maintainer
- Supersedes: none

## Context

A `.gridscalr` project references PDF drawings by absolute path plus a relative
path and SHA-256. That is correct for local editing and protects the source
drawings, but it makes a project hard to hand off: the recipient needs the project
and every referenced PDF, and the project file exposes the sender's directory
structure.

Embedding PDFs directly in the project would make every save, autosave and undo
snapshot much larger. The project format should stay a small, readable JSON
document.

## Decision

A portable project is a standard ZIP archive named:

```text
<project>.gridscalr.zip
```

The archive contains:

```text
README.txt
manifest.json
<project>.gridscalr
documents/<safe-name>.pdf
exports/...            optional
source-scans/...       optional original TIF scans
```

The project file inside the package is a portable copy:

- absolute document paths are cleared,
- each PDF keeps a relative path under `documents/`,
- TIF documents retain their embedded PDF,
- project and asset data are otherwise unchanged.

`manifest.json` is versioned independently of the project schema. It records:

- package format and format version,
- creation time and app version,
- project file name and SHA-256,
- every included document with file name, size and SHA-256,
- optional exports and original scans.

Exported reports and original TIF scans are opt-in. The embedded TIF-derived PDF
is enough to open and edit a project.

The app provides `File → Package project…` and `File → Open package…`. Opening a
package extracts it to a folder next to the archive, verifies checksums and opens
the project. Manual unzip followed by opening the `.gridscalr` must also work.

## Implementation constraints

- ZIP creation and extraction run in Rust with streaming, not in the browser
  process, so large PDFs do not pass through the JavaScript heap.
- PDFs and images use ZIP store mode; JSON and text use deflate.
- Extraction rejects absolute names, `..`, symlinks, encrypted archives and
  entries outside the package root.
- Archive entry count, individual file size and total extracted size are limited.
- Extraction happens in a temporary directory and is moved into place atomically.
- Existing files are never overwritten without confirmation.
- The package output path is subject to the same source-drawing write guard as
  every other export.
- Checksums detect corruption and accidental changes; they are not a cryptographic
  signature.

## Consequences

- Projects can move between machines and people without cloud services.
- Sender paths do not leak into the package.
- The project format remains reference-based and compact.
- The app gains a small Rust dependency for ZIP handling.
- Package opening has more failure modes than opening a project, so it needs its
  own tests and user-facing errors.
- A future read-only review mode or signed manifest can be added without changing
  the project schema.

## Enforcement

- `docs/project-file.md` documents the package layout.
- Tests cover manifest validation, relative path rewriting, checksum mismatch,
  duplicate names, Unicode paths, malicious archives and large-file streaming.
- The package is tested on Windows, macOS and Linux.

## Related issues

- [#40](https://github.com/MajorJohnDoe/gridscalr/issues/40) — portable packages
- [#41](https://github.com/MajorJohnDoe/gridscalr/issues/41) — cross-platform builds
