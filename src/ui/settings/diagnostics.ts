import { performanceEnabled, setPerformanceEnabled } from "../../features/perfMonitor";
import { t } from "../../i18n";
import { el } from "../dom";
import { checkRow, section } from "../settingsControls";

/**
 * Preferences → Diagnostics: the opt-in performance panel. The setting is per
 * machine and never part of the project file, so it lives here rather than in
 * Project settings.
 */
export function diagnosticsSection(): HTMLElement {
  const wrap = section(t("preferences.diagnostics.title"));
  wrap.append(el("p", "settings-note", t("preferences.diagnostics.note")));
  wrap.append(
    checkRow(t("preferences.diagnostics.performance"), performanceEnabled(), (checked) => {
      setPerformanceEnabled(checked);
    }),
  );
  wrap.append(el("p", "settings-note", t("preferences.diagnostics.performanceNote")));
  return wrap;
}
