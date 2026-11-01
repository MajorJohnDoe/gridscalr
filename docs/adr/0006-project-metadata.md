# ADR 0006: Project metadata and report branding

- Status: Accepted
- Date: 2026-11-01
- Deciders: GridScalr maintainer
- Supersedes: none

## Context

The quantity report currently contains the project name, document names, generated
date, scale and quantity rows. Professional procurement handoff also needs a
property or facility, client, project number, revision, author and notes. Without
those fields a report is technically correct but not ready to send to a contractor.

## Decision

Add an optional project metadata object in schema 22:

```json
{
  "metadata": {
    "facility": "Northgate Logistics Hub",
    "client": "Example Property AB",
    "projectNumber": "2026-014",
    "revision": "A",
    "preparedBy": "A. Technician",
    "reportDate": "2026-11-01",
    "reportTitle": "Procurement quantities",
    "notes": "Priced against revision A drawings."
  }
}
```

- Every field is optional and omitted when empty.
- `reportDate` is a date-only value; generated timestamps remain separate.
- An optional report logo is stored as an embedded project image asset, not as an
  external file. The report references the asset by id.
- The quantity PDF and the XLSX summary sheet display the metadata when present.
- CSV exports include metadata in a sidecar comment block or a dedicated header,
  documented with the export.
- The package format preserves metadata and the logo because they live in the
  project file.
- Missing metadata renders cleanly; the report remains valid without branding.

## Schema and migration

- Schema 22 adds the optional metadata object and optional report-logo asset id.
- Schema 21 and older projects migrate with empty metadata and no logo.
- The normalizer drops unknown fields and invalid image references.
- Tests cover current and previous schema versions, empty metadata, partial
  metadata, logo references and serialization round-trips.

## Consequences

- Reports become suitable for procurement and contractor handoff.
- The project file grows slightly when a logo is embedded.
- The logo follows the same image size limits as other embedded images.
- Localization must translate the metadata labels, not the user-entered values.

## Enforcement

- `src/model/types.ts`, `src/io/projectFile.ts`, report models and tests are updated
  together.
- `docs/project-file.md` records schema 22.
- `docs/release-notes` describes the migration.

## Related issues

- [#49](https://github.com/MajorJohnDoe/gridscalr/issues/49) — project metadata and branding
