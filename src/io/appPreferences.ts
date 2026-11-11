/** App-level preferences stored on this computer, never in the project file. */

import { isLanguagePreference, type LanguagePreference } from "../i18n/registry";

export type { LanguagePreference };

/** Locale-aware CSV for Excel, or RFC 4180 interchange for scripts. */
export type CsvFormat = "locale" | "interchange";

/** Stored theme choice. `system` maps dark to medium grey and light to light green. */
export type ThemePreference =
  "system" | "medium-grey" | "light-green" | "dark-grey" | "jade" | "navy";

/** Allowed maximum gaps between periodic recovery snapshots. */
export type AutosaveIntervalSeconds = 15 | 30 | 60;

export const AUTOSAVE_INTERVAL_OPTIONS: readonly AutosaveIntervalSeconds[] = [15, 30, 60];

export interface AutosavePreference {
  /** Whether periodic recovery snapshots are written at all. */
  enabled: boolean;
  /** Maximum time between automatic snapshots after a change. */
  intervalSeconds: AutosaveIntervalSeconds;
}

export interface AppPreferences {
  /** UI language. `system` follows the operating system locale. */
  language: LanguagePreference;
  /** CSV separator and decimal style. */
  csvFormat: CsvFormat;
  /** UI theme choice. */
  theme: ThemePreference;
  /** Periodic recovery snapshots. Project files are never saved automatically. */
  autosave: AutosavePreference;
}

const PREFERENCES_KEY = "gridscalr.preferences.v1";

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  language: "system",
  csvFormat: "locale",
  theme: "medium-grey",
  autosave: { enabled: true, intervalSeconds: 15 },
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
    value === "medium-grey" ||
    value === "light-green" ||
    value === "dark-grey" ||
    value === "jade" ||
    value === "navy"
  );
}

/** Older releases stored the jade palette as `default` and grey as `grey`. */
function normalizeTheme(value: unknown): ThemePreference {
  if (value === "grey") return "dark-grey";
  if (value === "default") return "jade";
  return isTheme(value) ? value : DEFAULT_APP_PREFERENCES.theme;
}

function isAutosaveInterval(value: unknown): value is AutosaveIntervalSeconds {
  return value === 15 || value === 30 || value === 60;
}

/** Missing or invalid autosave fields fall back independently. */
export function normalizeAutosavePreference(value: unknown): AutosavePreference {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    enabled:
      typeof record.enabled === "boolean"
        ? record.enabled
        : DEFAULT_APP_PREFERENCES.autosave.enabled,
    intervalSeconds: isAutosaveInterval(record.intervalSeconds)
      ? record.intervalSeconds
      : DEFAULT_APP_PREFERENCES.autosave.intervalSeconds,
  };
}

export function loadAppPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw)
      return { ...DEFAULT_APP_PREFERENCES, autosave: { ...DEFAULT_APP_PREFERENCES.autosave } };
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      language: isLanguage(parsed.language) ? parsed.language : DEFAULT_APP_PREFERENCES.language,
      csvFormat: isCsvFormat(parsed.csvFormat)
        ? parsed.csvFormat
        : DEFAULT_APP_PREFERENCES.csvFormat,
      theme: normalizeTheme(parsed.theme),
      autosave: normalizeAutosavePreference(parsed.autosave),
    };
  } catch {
    return { ...DEFAULT_APP_PREFERENCES, autosave: { ...DEFAULT_APP_PREFERENCES.autosave } };
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
  return { ...DEFAULT_APP_PREFERENCES, autosave: { ...DEFAULT_APP_PREFERENCES.autosave } };
}
