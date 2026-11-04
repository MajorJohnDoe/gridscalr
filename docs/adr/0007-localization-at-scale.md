# ADR 0007: Localization at scale

- Status: Accepted
- Date: 2026-11-04
- Deciders: GridScalr maintainer
- Amends: [0003](0003-localization.md)
- Supersedes: none

## Context

[ADR 0003](0003-localization.md) established English and Swedish catalogs,
locale-aware formatting and a documented CSV rule. The 0.17 foundation proved
the approach but hard-coded the language list in five places, kept messages in
TypeScript objects and formatted numbers with a fixed `en-US` locale. The 0.18
release must support many languages without making each one a code change.

## Decision

### JSON catalogs and generated types

- Catalogs are JSON files in `src/i18n/locales/`: `en.json` is the source and
  the only catalog that must always be 100 % complete. `sv.json` is complete for
  0.18.
- `src/i18n/types.generated.ts` is generated from `en.json` by
  `scripts/i18n-types.mjs`. `check:i18n` regenerates it in memory and fails on
  drift, so keys stay typed across the codebase.
- Catalogs are validated for missing and extra keys, empty values, placeholder
  parity and ICU syntax on every `npm run check:i18n`.

### Locale registry

- `src/i18n/registry.ts` exports `SUPPORTED_LOCALES`. Each descriptor carries:
  `id`, `nativeName`, `englishName`, `direction`, `numberLocale`, `status`,
  `load()` and `help` bundle id.
- `Locale`, `LanguagePreference`, `isLanguagePreference`, the catalog loader,
  the Preferences selector and `helpBundles` derive from the registry. Adding a
  real locale is one JSON file plus one registry entry; the generator and
  coverage report pick the file up without further code.
- `status` is `complete`, `beta` or `community`. English and Swedish are
  `complete`.

### Lazy loading and matching

- English is imported eagerly and is always the per-key fallback.
- The selected locale is loaded with a dynamic import. `main.ts` awaits it
  before `new App(root)`, so `t()` is synchronous after startup.
- System matching walks `navigator.languages` in order and tries the exact tag,
  then its base language. `sv-FI → sv → en` is the canonical example. An
  unknown language falls back to English.

### ICU messages

- `intl-messageformat` supplies plural and select rules. It is an offline
  runtime dependency and is listed in `THIRD_PARTY_NOTICES.md`.
- Plural and select messages are ICU strings such as
  `{count, plural, one {# item} other {# items}}`. Hand-written
  `n === 1 ? "" : "s"` ternaries in catalogued surfaces are migrated to ICU;
  surfaces that are not yet catalogued wait for their translation phase.

### Formatting

- `src/i18n/format.ts` is the only presentation path for numbers, dates and
  localized number parsing. `src/model/units.ts` delegates to it.
- Stored values stay locale-neutral: numbers remain numbers and timestamps
  remain ISO strings. Only display and export cells are localized.

### CSV

- The default CSV mode follows the locale: Swedish uses `;` with decimal
  commas; English uses `,` with points. The delimiter follows the locale's
  decimal mark so Excel receives a consistent pair.
- Preferences offer **Locale (Excel)** and **Interchange (RFC 4180)**. The
  interchange mode always uses commas and points for scripts and other tools.
- Metadata keys remain stable English (`project`, `generated_at`, ...). XLSX is
  unchanged and keeps numeric cells so Excel applies its own formatting.

### Test-only pseudo-locale

- `en-XA` wraps English messages with markers and is available only in
  development and tests. It is hidden from Preferences and rejected by
  production builds. The Playwright smoke test uses it to detect clipped
  labels.

## Non-goals

- RTL layouts and Arabic/Hebrew shaping.
- CJK typography and translation.
- PDF Unicode font work beyond the existing Liberation Sans and Helvetica
  paths. Report and drawing fonts are revisited in the report phase.
- Translating the user guide, workflows or marketing site in this phase.
- Third-party language packs before 1.0.

## Consequences

- Translators work in JSON; adding a language does not touch TypeScript.
- A missing or invalid catalog key fails CI before it reaches the UI.
- The hard-coded baseline now also scans `src/model` display helpers. Its size
  grows once when the scan widens, then shrinks per migration phase.
- RTL and CJK remain explicitly deferred and need their own ADR.

## Related issues

- [#47](https://github.com/MajorJohnDoe/gridscalr/issues/47) — localization foundation
- [#48](https://github.com/MajorJohnDoe/gridscalr/issues/48) — Swedish UI and reports
- [#57](https://github.com/MajorJohnDoe/gridscalr/issues/57) — full help translation
