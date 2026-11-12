import { AUTOSAVE_INTERVAL_OPTIONS, type AutosaveIntervalSeconds } from "../../io/appPreferences";
import {
  autosaveState,
  setAutosaveEnabled,
  setAutosaveIntervalSeconds,
  setAutosavePausedForSession,
} from "../../features/sessionRecovery";
import { t } from "../../i18n";
import { el } from "../dom";
import { checkRow, field, section } from "../settingsControls";

/** Preferences → Data controls for app-level recovery autosave. */
export function autosaveSection(): HTMLElement {
  const wrap = section(t("preferences.data.autosaveTitle"));
  const state = autosaveState();

  const enabled = checkRow(t("preferences.data.autosaveEnabled"), state.enabled, (checked) => {
    setAutosaveEnabled(checked);
    sync();
  });

  const intervalSelect = el("select", "select");
  intervalSelect.setAttribute("aria-label", t("preferences.data.autosaveInterval"));
  for (const seconds of AUTOSAVE_INTERVAL_OPTIONS) {
    const option = el("option", "", t("preferences.data.autosaveIntervalValue", { seconds }));
    option.value = String(seconds);
    intervalSelect.append(option);
  }
  intervalSelect.value = String(state.intervalSeconds);
  intervalSelect.addEventListener("change", () => {
    setAutosaveIntervalSeconds(Number(intervalSelect.value) as AutosaveIntervalSeconds);
    sync();
  });
  const interval = field(t("preferences.data.autosaveInterval"), intervalSelect);

  const pauseInput = el("input");
  pauseInput.type = "checkbox";
  pauseInput.checked = state.pausedForSession;
  pauseInput.addEventListener("change", () => {
    setAutosavePausedForSession(pauseInput.checked);
    sync();
  });
  const pauseRow = el("label", "check-row");
  pauseRow.append(pauseInput, el("span", "", t("preferences.data.autosavePause")));

  const stateNote = el("p", "settings-note");
  const note = el("p", "settings-note", t("preferences.data.autosaveNote"));

  const sync = () => {
    const current = autosaveState();
    intervalSelect.disabled = !current.enabled;
    pauseInput.disabled = !current.enabled;
    pauseInput.checked = current.pausedForSession;
    stateNote.textContent =
      current.status === "enabled"
        ? t("preferences.data.autosaveStateOn", { seconds: current.intervalSeconds })
        : current.status === "paused"
          ? t("preferences.data.autosaveStatePaused")
          : t("preferences.data.autosaveStateOff");
  };
  sync();
  wrap.append(enabled, interval, pauseRow, stateNote, note);
  return wrap;
}
