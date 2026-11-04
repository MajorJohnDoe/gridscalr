import enCatalog from "./locales/en.json";

/**
 * Every supported interface language is declared here. A real language needs
 * exactly one JSON catalog in `locales/` plus one entry in this table; the
 * `Locale` type, the language preference, the catalog loader and the
 * Preferences selector are all derived from it.
 */
export type Catalog = Record<string, string>;
export type HelpBundleId = "en" | "sv";
export type LocaleDirection = "ltr" | "rtl";
export type LocaleStatus = "complete" | "beta" | "community";

export interface LocaleDescriptor {
  id: string;
  nativeName: string;
  englishName: string;
  direction: LocaleDirection;
  numberLocale: string;
  status: LocaleStatus;
  load: () => Promise<Catalog>;
  help: HelpBundleId;
  /** Test/dev-only locales are hidden from Preferences and production builds. */
  testOnly?: boolean;
}

const englishCatalog = enCatalog as Catalog;

/** Pseudo-locale markers used by the smoke test to detect clipped labels. */
export const PSEUDO_LOCALE_ID = "en-XA";
export const PSEUDO_MARKER = "⟦";
export const PSEUDO_END_MARKER = "⟧";

/**
 * Wraps every English message so longer translations can be simulated. The
 * ICU syntax inside braces is left untouched; the markers only surround it.
 */
export function pseudoCatalog(source: Catalog = englishCatalog): Catalog {
  const catalog: Catalog = {};
  for (const [key, value] of Object.entries(source)) {
    catalog[key] =
      `${PSEUDO_MARKER}${PSEUDO_MARKER} ${value} ${PSEUDO_END_MARKER}${PSEUDO_END_MARKER}`;
  }
  return catalog;
}

const localeTable = {
  en: {
    id: "en",
    nativeName: "English",
    englishName: "English",
    direction: "ltr",
    numberLocale: "en-US",
    status: "complete",
    load: () => Promise.resolve(englishCatalog),
    help: "en",
  },
  sv: {
    id: "sv",
    nativeName: "Svenska",
    englishName: "Swedish",
    direction: "ltr",
    numberLocale: "sv-SE",
    status: "complete",
    load: () => import("./locales/sv.json").then((module) => module.default as Catalog),
    help: "sv",
  },
  "en-XA": {
    id: PSEUDO_LOCALE_ID,
    nativeName: "Pseudo (en-XA)",
    englishName: "Pseudo-English",
    direction: "ltr",
    numberLocale: "en-US",
    status: "beta",
    load: () => Promise.resolve(pseudoCatalog(englishCatalog)),
    help: "en",
    testOnly: true,
  },
} as const satisfies Record<string, LocaleDescriptor>;

export const SUPPORTED_LOCALES: Record<keyof typeof localeTable, LocaleDescriptor> = localeTable;

export type Locale = keyof typeof SUPPORTED_LOCALES;
export type LanguagePreference = "system" | Locale;

export const DEFAULT_LOCALE: Locale = "en";

/** The pseudo-locale is available in development and tests, never in a build. */
export function pseudoLocaleEnabled(): boolean {
  return Boolean(import.meta.env?.DEV) || import.meta.env?.MODE === "test";
}

export function isLocale(value: unknown): value is Locale {
  if (typeof value !== "string" || !(value in SUPPORTED_LOCALES)) return false;
  const descriptor = SUPPORTED_LOCALES[value as Locale];
  return !descriptor.testOnly || pseudoLocaleEnabled();
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === "system" || isLocale(value);
}

export function localeDescriptor(locale: Locale): LocaleDescriptor {
  return SUPPORTED_LOCALES[locale];
}

/** Locales offered in Preferences, using the language's own name. */
export function selectableLocales(): LocaleDescriptor[] {
  return Object.values(SUPPORTED_LOCALES).filter((descriptor) => !descriptor.testOnly);
}
