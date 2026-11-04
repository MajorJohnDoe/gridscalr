/** App-level preferences stored on this computer, never in the project file. */

import { isLanguagePreference, type LanguagePreference } from "../i18n/registry";

export type { LanguagePreference };

/** Locale-aware CSV for Excel, or RFC 4180 interchange for scripts. */
export type CsvFormat = "locale" | "interchange";

export interface AppPreferences {
  /** UI language. `system` follows the operating system locale. */
  language: LanguagePreference;
  /** CSV separator and decimal style. */
  csvFormat: CsvFormat;
}

const PREFERENCES_KEY = "gridscalr.preferences.v1";

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  language: "system",
  csvFormat: "locale",
};

function isLanguage(value: unknown): value is LanguagePreference {
  return isLanguagePreference(value);
}

function isCsvFormat(value: unknown): value is CsvFormat {
  return value === "locale" || value === "interchange";
}

export function loadAppPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_APP_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      language: isLanguage(parsed.language) ? parsed.language : DEFAULT_APP_PREFERENCES.language,
      csvFormat: isCsvFormat(parsed.csvFormat)
        ? parsed.csvFormat
        : DEFAULT_APP_PREFERENCES.csvFormat,
    };
  } catch {
    return { ...DEFAULT_APP_PREFERENCES };
  }
}

export function saveAppPreferences(patch: Partial<AppPreferences>): AppPreferences {
  const next: AppPreferences = { ...loadAppPreferences(), ...patch };
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
  } catch {
    // Preferences are a convenience; the running session still uses the value.
  }
  return next;
}

export function resetAppPreferences(): AppPreferences {
  try {
    localStorage.removeItem(PREFERENCES_KEY);
  } catch {
    // Ignore storage failures.
  }
  return { ...DEFAULT_APP_PREFERENCES };
}
