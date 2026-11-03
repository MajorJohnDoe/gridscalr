import {
  loadAppPreferences,
  saveAppPreferences,
  type LanguagePreference,
} from "../io/appPreferences";
import { en, type MessageKey } from "./messages/en";
import { sv } from "./messages/sv";

export type Locale = "en" | "sv";
export type { LanguagePreference, MessageKey };

const catalogs: Record<Locale, Partial<Record<MessageKey, string>>> = { en, sv };

/** Fired after the language preference changes so mounted chrome can relabel. */
export const LANGUAGE_CHANGED_EVENT = "gridscalr:language-changed";

let locale: Locale = "en";

function systemLanguage(): string {
  return typeof navigator === "undefined" ? "en" : navigator.language;
}

/** Maps a stored preference and an OS language to a supported locale. */
export function resolveLocale(
  preference: LanguagePreference,
  language: string = systemLanguage(),
): Locale {
  if (preference === "en" || preference === "sv") return preference;
  return language.toLowerCase().startsWith("sv") ? "sv" : "en";
}

/** Reads the stored preference and applies it to the process-wide locale. */
export function applyStoredLanguage(): Locale {
  locale = resolveLocale(loadAppPreferences().language);
  return locale;
}

export function setLanguagePreference(preference: LanguagePreference): Locale {
  saveAppPreferences({ language: preference });
  locale = resolveLocale(preference);
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

/** Looks up a key in the given locale and falls back to English. */
export function translate(
  target: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const template = catalogs[target][key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return translate(locale, key, params);
}
