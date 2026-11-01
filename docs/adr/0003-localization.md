# ADR 0003: Localization and locale formatting

- Status: Accepted
- Date: 2026-11-01
- Deciders: GridScalr maintainer
- Supersedes: none

## Context

The interface contains roughly a thousand hard-coded English strings. Quantity
reports, XLSX sheet names and CSV headings are also English, and number formatting
is fixed to `en-US`. The first release audience includes Swedish operations
technicians and technical property managers.

Translating strings in place would create a second, larger rewrite later. A
message catalog and locale-aware formatting are required before adding more UI
surface.

## Decision

English and Swedish are first-class application languages. Additional languages
use the same catalog and content structure later.

### Message catalogs

Add typed catalogs under `src/i18n/`:

```text
src/i18n/
  index.ts        translate(), formatting and language state
  locales/en.ts   source catalog
  locales/sv.ts   Swedish catalog
  types.ts        key types and interpolation contract
```

Rules:

- UI code uses catalog keys, not literal user-facing strings.
- English is the source and fallback language.
- Swedish is complete for 1.0 UI, dialogs, errors, reports and export.
- A pseudo-locale or key-coverage test fails when a key is missing or a new literal
  string bypasses the catalog.
- Language selection lives in application preferences: System, English, Svenska.
- The selected language persists locally and does not change the project file.

### Locale-aware formatting

- Numbers use the selected locale, not a fixed `en-US` formatter.
- Dates and timestamps use locale-aware formatting in reports and UI while keeping
  stable sortable values.
- CSV uses a documented separator. Swedish exports use semicolon by default or an
  explicit locale-aware separator setting; XLSX remains unaffected.
- PDF report fonts must render Swedish characters. The current standard fonts do.

### Reports and exports

- Quantity PDF headings, columns, labels and warnings follow the selected language.
- XLSX sheet names and headers follow the selected language.
- Markup CSV and quantity CSV headings follow the selected language.
- Drawing PDF labels use the product term glossary.

### Help content

- Help content is addressed by language and falls back to English.
- 1.0 includes a Swedish quick start and Swedish help chrome.
- The full user guide and workflows may remain English in 1.0 with a clear note.
- Full Swedish help is a post-1.0 issue and must not require code changes outside
  content and catalogs.

### Glossary

Product terms such as Count, Count schedule, Markups, Layers, Properties and Help
follow a documented Swedish glossary. Terms shown in the UI keep the same meaning
in the user guide and website.

## Non-goals

- A plugin system for third-party language packs before 1.0.
- Translating the website; it is already bilingual.
- Translating the full user guide and workflows inside the 1.0 UI milestone.

## Consequences

- Extracting strings touches most UI files and must be done in reviewable batches.
- New features must use catalog keys from the start.
- Tests need pseudo-locale, pluralization, number/date and report snapshot coverage.
- Screenshots may need a Swedish set for the Swedish quick start.
- Adding a language later is content work rather than a rewrite.

## Enforcement

- `AGENTS.md` requires catalog keys for new user-facing strings.
- CI checks key coverage and fallback behavior.
- `docs/shortcuts.md` and the README shortcut table still use the canonical English
  key names.

## Related issues

- [#47](https://github.com/MajorJohnDoe/gridscalr/issues/47) — localization foundation
- [#48](https://github.com/MajorJohnDoe/gridscalr/issues/48) — Swedish UI and reports
- [#50](https://github.com/MajorJohnDoe/gridscalr/issues/50) — Swedish quick start
- [#57](https://github.com/MajorJohnDoe/gridscalr/issues/57) — full help translation
