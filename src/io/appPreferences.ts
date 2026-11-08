/** App-level preferences stored on this computer, never in the project file. */

import { isLanguagePreference, type LanguagePreference } from "../i18n/registry";

export type { LanguagePreference };

/** Locale-aware CSV for Excel, or RFC 4180 interchange for scripts. */
export type CsvFormat = "locale" | "interchange";

/** Stored theme choice. `system` maps dark to jade and light to light-green. */
export type ThemePreference =
  "system" | "default" | "light-green" | "dark-grey" | "medium-grey" | "navy";

export interface AppPreferences {
  /** UI language. `system` follows the operating system locale. */
  language: LanguagePreference;
  /** CSV separator and decimal style. */
  csvFormat: CsvFormat;
  /** UI theme choice. */
  theme: ThemePreference;
}

const PREFERENCES_KEY = "gridscalr.preferences.v1";

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  language: "system",
  csvFormat: "locale",
  theme: "system",
};

function isLanguage(value: unknown): value is LanguagePreference {
  return isLanguagePreference(value);
}

function isCsvFormat(value: unknown): value is CsvFormat {
  return value === "locale" || value === "interchange";
}

function isTheme(value: unknown): value is ThemePreference {
  return (
    value === "system" ||
    value === "default" ||
    value === "light-green" ||
    value === "dark-grey" ||
    value === "medium-grey" ||
    value === "navy"
  );
}

/** `grey` was the pre-0.21.1 name for the palette now called Dark Grey. */
function normalizeTheme(value: unknown): ThemePreference {
  if (value === "grey") return "dark-grey";
  return isTheme(value) ? value : DEFAULT_APP_PREFERENCES.theme;
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
      theme: normalizeTheme(parsed.theme),
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
