/**
 * The one policy for the performance panel: the stored preference, the
 * recorder and the panel's visibility always agree. A single boolean keeps the
 * rule explainable — "panel open" means "recording", never an invisible state.
 */

import { loadAppPreferences, saveAppPreferences } from "../../io/appPreferences";
import { mountPerfPanel, setPerfPanelOpen, type PerfPanelOptions } from "./panel";
import { setPerfRecording } from "./recorder";

/** Wires the panel once at startup and applies the stored preference. */
export function installPerfPanel(options: PerfPanelOptions): void {
  mountPerfPanel({
    ...options,
    onVisibilityChange: (open) => {
      setPerformanceEnabled(open);
      options.onVisibilityChange?.(open);
    },
  });
  applyStoredPerfPreference();
}

/** Applies the stored preference to the recorder and the panel. */
export function applyStoredPerfPreference(): void {
  const enabled = loadAppPreferences().performance.recording;
  setPerfRecording(enabled);
  setPerfPanelOpen(enabled);
}

export function performanceEnabled(): boolean {
  return loadAppPreferences().performance.recording;
}

/** Turns the feature on or off from Preferences or the Help menu. */
export function setPerformanceEnabled(enabled: boolean): void {
  saveAppPreferences({ performance: { recording: enabled } });
  setPerfRecording(enabled);
  setPerfPanelOpen(enabled);
}

export function togglePerformancePanel(): void {
  setPerformanceEnabled(!performanceEnabled());
}
