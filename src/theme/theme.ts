import { loadAppPreferences, saveAppPreferences, type ThemePreference } from "../io/appPreferences";
import type { MessageKey } from "../i18n/types.generated";

export type ThemeId = "medium-grey" | "light-green" | "dark-grey" | "jade" | "navy";

export interface ThemeOption {
  value: ThemePreference;
  labelKey: MessageKey;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { value: "system", labelKey: "theme.system" },
  { value: "medium-grey", labelKey: "theme.mediumGrey" },
  { value: "light-green", labelKey: "theme.lightGreen" },
  { value: "dark-grey", labelKey: "theme.darkGrey" },
  { value: "jade", labelKey: "theme.jade" },
  { value: "navy", labelKey: "theme.navy" },
];

const LIGHT_QUERY = "(prefers-color-scheme: light)";

export function resolveTheme(preference: ThemePreference): ThemeId {
  if (preference !== "system") return preference;
  if (typeof window === "undefined" || !window.matchMedia) return "medium-grey";
  return window.matchMedia(LIGHT_QUERY).matches ? "light-green" : "medium-grey";
}

export function applyTheme(preference: ThemePreference): ThemeId {
  const theme = resolveTheme(preference);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme === "light-green" ? "light" : "dark";
  return theme;
}

export function setThemePreference(preference: ThemePreference): ThemeId {
  saveAppPreferences({ theme: preference });
  const theme = applyTheme(preference);
  window.dispatchEvent(new CustomEvent("gridscalr:theme-changed", { detail: theme }));
  return theme;
}

export function currentThemePreference(): ThemePreference {
  return loadAppPreferences().theme;
}

/** Re-applies System mode when the operating system appearance changes. */
export function watchSystemTheme(): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const media = window.matchMedia(LIGHT_QUERY);
  const onChange = () => {
    if (loadAppPreferences().theme === "system") applyTheme("system");
  };
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
