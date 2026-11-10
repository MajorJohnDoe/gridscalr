# ADR 0012: Source storage modes

- Status: Accepted
- Date: 2026-11-10
- Deciders: GridScalr maintainer
- Supersedes: none

## Context

A `.gridscalr` project references PDF drawings by path and SHA-256. The source
drawing is never modified. This keeps the project file small and gives every
measurement a clear source.

The reference model is fragile when the drawing lives on a shared or
cloud-synced folder:

- another person can replace the PDF while the project is open;
- the file can be moved or renamed;
- the cloud client can update it in place;
- a checksum mismatch is detected, but detection does not protect the project.

The project package already contains the drawings, but packaging is a transport
or archive action. It is not the live editing source.

Embedding ordinary PDFs as base64 in `.gridscalr` would make the JSON project
huge, slow to save, slow to autosave and expensive in undo snapshots. That is
not acceptable for large drawing sets.

## Decision

Support three explicit source modes:

| Mode | Storage | Use |
| --- | --- | --- |
| **Reference** | Path plus SHA-256 | Local, stable files |
| **Managed copy** | Copy in a sibling project folder, relative path plus SHA-256 | Shared cloud folders, network shares, unstable sources |
| **Package** | `.gridscalr.zip` with its drawings | Transport and archive |

Rules:

1. Reference remains the default for a local file that is unlikely to change.
2. When the source is in a known cloud folder or on a network share, the import
   dialog recommends **Copy drawing into project**. The dialog explains that the
   original can change or move without the project changing.
3. A managed copy lives under a sibling folder such as
   `Project.drawings/<safe-name>-<hash8>.pdf`. The project references it
   relatively, so moving the project folder keeps the link.
4. `DocumentRef.storage` makes the mode explicit:
   `"reference" | "managed"`. Keep optional `originalPath` and
   `originalSha256` for provenance and relinking.
5. **Consolidate drawings…** copies every referenced PDF into the project folder
   and rewrites the paths. The originals are never modified.
6. **Use managed copy** and **Detach from source** are explicit document
   actions.
7. A source-changed banner appears in reference mode with **Reload**,
   **Use current**, **Relink** and **Copy into project**.
8. A package includes managed copies once; it never duplicates the same file.
9. Do not base64-embed ordinary PDFs in `.gridscalr`. The existing TIF
   embedded-PDF exception remains because it is a derived document format.
10. A managed copy protects against the original moving or changing, not against
    someone editing the copy. The checksum remains authoritative.

## Migration

Schema 24 → 25:

- set `storage: "reference"` on every existing document;
- leave `originalPath` and `originalSha256` absent;
- do not copy or move any source file during migration.

## Consequences

- A shared source can be protected without a cloud service.
- The project can still be reference-based and small for stable local files.
- A managed-copy project folder is larger but self-contained enough to move.
- The user must choose a mode; the default must be explained, not silent.
- Packaging must distinguish reference, managed and duplicate files.
- Source status and relinking gain a clear mode to report.
- The TIF embedded-PDF special case stays separate from ordinary PDF storage.

## Enforcement

- Tests for reference and managed-copy import, consolidate, detach, relink and
  package inclusion.
- A schema 24 → 25 migration fixture.
- Source path and checksum tests that ensure the original is never written.
- Documentation for the import choice, the source-changed banner and the
  difference between a managed copy and a package.

## Related

- [`docs/plan/robustness.md`](../plan/robustness.md)
- ADR [0010](0010-project-file-integrity.md)
- ADR [0011](0011-page-list-and-source-replacement.md)
- ADR [0002](0002-project-package.md)
