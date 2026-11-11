import {
  AUTOSAVE_INTERVAL_OPTIONS,
  loadAppPreferences,
  saveAppPreferences,
  type AutosaveIntervalSeconds,
  type AutosavePreference,
} from "../../io/appPreferences";

export type AutosaveStatus = "enabled" | "disabled" | "paused";

export interface AutosaveState {
  enabled: boolean;
  intervalSeconds: AutosaveIntervalSeconds;
  pausedForSession: boolean;
  status: AutosaveStatus;
  /** True only while periodic writes should actually run. */
  active: boolean;
}

/**
 * Pause is deliberately session-only. Module state is created on app start and
 * is not written to localStorage, so a new start always resumes autosave.
 */
let pausedForSession = false;
/** Parsed once per app start; the status bar reads this on every cursor move. */
let cachedPreference: AutosavePreference | null = null;
const listeners = new Set<(state: AutosaveState) => void>();

function currentPreference(): AutosavePreference {
  cachedPreference ??= loadAppPreferences().autosave;
  return cachedPreference;
}

function notify(): void {
  const state = autosaveState();
  for (const listener of [...listeners]) listener(state);
}

export function autosaveState(): AutosaveState {
  const preference = currentPreference();
  const status: AutosaveStatus = !preference.enabled
    ? "disabled"
    : pausedForSession
      ? "paused"
      : "enabled";
  return {
    enabled: preference.enabled,
    intervalSeconds: preference.intervalSeconds,
    pausedForSession,
    status,
    active: status === "enabled",
  };
}

export function autosaveIntervalMs(): number {
  return currentPreference().intervalSeconds * 1000;
}

export function subscribeAutosaveState(listener: (state: AutosaveState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setAutosaveEnabled(enabled: boolean): AutosaveState {
  const current = currentPreference();
  if (current.enabled !== enabled) {
    cachedPreference = saveAppPreferences({ autosave: { ...current, enabled } }).autosave;
    notify();
  }
  return autosaveState();
}

export function setAutosaveIntervalSeconds(
  intervalSeconds: AutosaveIntervalSeconds,
): AutosaveState {
  if (!AUTOSAVE_INTERVAL_OPTIONS.includes(intervalSeconds)) return autosaveState();
  const current = currentPreference();
  if (current.intervalSeconds !== intervalSeconds) {
    cachedPreference = saveAppPreferences({
      autosave: { ...current, intervalSeconds },
    }).autosave;
    notify();
  }
  return autosaveState();
}

export function setAutosavePausedForSession(paused: boolean): AutosaveState {
  if (pausedForSession !== paused) {
    pausedForSession = paused;
    notify();
  }
  return autosaveState();
}
