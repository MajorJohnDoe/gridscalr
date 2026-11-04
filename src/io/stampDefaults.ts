import { defaultStampPresets, normalizeStampPresets } from "../model/stamps";

const STAMP_DEFAULTS_KEY = "gridscalr.stampPresets.v1";

export function loadGlobalStampPresets(): string[] {
  try {
    const raw = localStorage.getItem(STAMP_DEFAULTS_KEY);
    if (!raw) return defaultStampPresets();
    return normalizeStampPresets(JSON.parse(raw));
  } catch {
    return defaultStampPresets();
  }
}

export function saveGlobalStampPresets(presets: readonly string[]): string[] {
  const normalized = normalizeStampPresets([...presets]);
  try {
    localStorage.setItem(STAMP_DEFAULTS_KEY, JSON.stringify(normalized));
  } catch {
    // Stamp defaults are a convenience; the project still stores its own list.
  }
  return normalized;
}

export function resetGlobalStampPresets(): string[] {
  return saveGlobalStampPresets(defaultStampPresets());
}
