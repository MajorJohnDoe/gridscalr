import { IntlMessageFormat } from "intl-messageformat";
import { loadAppPreferences, saveAppPreferences } from "../io/appPreferences";
import enCatalog from "./locales/en.json";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLanguagePreference,
  localeDescriptor,
  selectableLocales,
  type Catalog,
  type LanguagePreference,
  type Locale,
} from "./registry";
import type { MessageKey } from "./types.generated";

export type {
  Catalog,
  HelpBundleId,
  LanguagePreference,
  Locale,
  LocaleDescriptor,
  LocaleDirection,
  LocaleStatus,
} from "./registry";
export type { MessageKey } from "./types.generated";
export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLanguagePreference,
  isLocale,
  localeDescriptor,
  pseudoCatalog,
  pseudoLocaleEnabled,
  selectableLocales,
} from "./registry";

/** Fired after the language preference changes so mounted chrome can relabel. */
export const LANGUAGE_CHANGED_EVENT = "gridscalr:language-changed";

const catalogs: Partial<Record<Locale, Catalog>> = { en: enCatalog as Catalog };
const formatters = new Map<string, IntlMessageFormat>();

let locale: Locale = DEFAULT_LOCALE;

function systemLanguages(): string[] {
  if (typeof navigator === "undefined") return [DEFAULT_LOCALE];
  const languages = navigator.languages?.filter(Boolean) ?? [];
  if (languages.length) return [...languages];
  return navigator.language ? [navigator.language] : [DEFAULT_LOCALE];
}

function matchLanguage(tag: string): Locale | null {
  const normalized = tag.trim().toLowerCase().replace(/_/g, "-");
  if (!normalized) return null;
  const locales = Object.values(SUPPORTED_LOCALES);
  for (const descriptor of locales) {
    if (descriptor.id.toLowerCase() === normalized) {
      if (!descriptor.testOnly || isLanguagePreference(descriptor.id))
        return descriptor.id as Locale;
    }
  }
  const base = normalized.split("-")[0];
  for (const descriptor of locales) {
    if (descriptor.id.toLowerCase() === base) {
      if (!descriptor.testOnly || isLanguagePreference(descriptor.id))
        return descriptor.id as Locale;
    }
  }
  return null;
}

/** Maps a stored preference and OS languages to a supported locale. */
export function resolveLocale(
  preference: LanguagePreference,
  languages: string | readonly string[] = systemLanguages(),
): Locale {
  if (preference !== "system" && isLanguagePreference(preference)) return preference;
  const tags = typeof languages === "string" ? [languages] : languages;
  for (const tag of tags) {
    const match = matchLanguage(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

async function ensureCatalog(target: Locale): Promise<void> {
  if (catalogs[target]) return;
  catalogs[target] = await localeDescriptor(target).load();
}

/** Explicitly loads a locale before a synchronous t() call, mainly for tests. */
export async function loadLocale(target: Locale): Promise<void> {
  await ensureCatalog(target);
}

/** Mirrors the active locale onto the document so screen readers and spellcheck follow it. */
function applyDocumentLanguage(target: Locale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = target;
}

/** Resolves the stored preference, lazy-loads it, then applies it. */
export async function applyStoredLanguage(): Promise<Locale> {
  const next = resolveLocale(loadAppPreferences().language);
  await ensureCatalog(next);
  locale = next;
  applyDocumentLanguage(locale);
  return locale;
}

export async function setLanguagePreference(preference: LanguagePreference): Promise<Locale> {
  saveAppPreferences({ language: preference });
  const next = resolveLocale(preference);
  await ensureCatalog(next);
  locale = next;
  applyDocumentLanguage(locale);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGED_EVENT));
  }
  return locale;
}

export function languagePreference(): LanguagePreference {
  return loadAppPreferences().language;
}

export function currentLocale(): Locale {
  return locale;
}

export function currentLocaleDescriptor() {
  return localeDescriptor(locale);
}

function catalogFor(target: Locale): Catalog {
  return catalogs[target] ?? catalogs[DEFAULT_LOCALE] ?? (enCatalog as Catalog);
}

function formatMessage(target: Locale, message: string, params: Record<string, string | number>) {
  const key = `${target}\u0000${message}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new IntlMessageFormat(message, localeDescriptor(target).numberLocale);
    formatters.set(key, formatter);
  }
  return String(formatter.format(params));
}

/** Looks up a key in the given locale and falls back to English. */
export function translate(
  target: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const template = catalogFor(target)[key] ?? catalogFor(DEFAULT_LOCALE)[key] ?? key;
  if (!params) return template;
  return formatMessage(target, template, params);
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return translate(locale, key, params);
}

export interface LanguageOption {
  value: LanguagePreference;
  label: string;
}

/** The system language as a friendly native name, or its raw tag when unsupported. */
function systemLanguageName(): string {
  const tags = systemLanguages();
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase().replace(/_/g, "-");
    if (!normalized) continue;
    const base = normalized.split("-")[0];
    const match = selectableLocales().find(
      (descriptor) =>
        descriptor.id.toLowerCase() === normalized || descriptor.id.toLowerCase() === base,
    );
    if (match) return match.nativeName;
  }
  return tags[0] ?? DEFAULT_LOCALE;
}

/** Options for the Preferences language selector, including System. */
export function languageOptions(): LanguageOption[] {
  return [
    {
      value: "system",
      label: translate(locale, "language.system", { language: systemLanguageName() }),
    },
    ...selectableLocales().map((descriptor) => ({
      value: descriptor.id as Locale,
      label: descriptor.nativeName,
    })),
  ];
}
