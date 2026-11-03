/** App-level preferences stored on this computer, never in the project file. */

export type LanguagePreference = "system" | "en" | "sv";

export interface AppPreferences {
  /** UI language. `system` follows the operating system locale. */
  language: LanguagePreference;
}

const PREFERENCES_KEY = "gridscalr.preferences.v1";

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  language: "system",
};

function isLanguage(value: unknown): value is LanguagePreference {
  return value === "system" || value === "en" || value === "sv";
}

export function loadAppPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_APP_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      language: isLanguage(parsed.language) ? parsed.language : DEFAULT_APP_PREFERENCES.language,
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
