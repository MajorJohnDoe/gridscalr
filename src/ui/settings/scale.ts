import { t } from "../../i18n";
import {
  isManualCalibration,
  pageCalibration,
  pageScale,
  pageScaleLocked,
} from "../../model/calibration";
import { formatNumber, formatScale } from "../../model/units";
import { store } from "../../state/store";
import { pageIdAt } from "../../model/pages";
import { el } from "../dom";
import { section } from "../settingsControls";

export function scaleSection(): HTMLElement {
  const project = store.project!;
  const page = store.ui.page;
  const pageId = pageIdAt(project, page) ?? "";
  const calibration = pageCalibration(project, pageId);
  const locked = pageScaleLocked(project, pageId);
  const wrap = section(t("settings.scaleTitle"), t("settings.scaleNote"));
  const value = el("p", "settings-scale-value");
  if (!calibration) {
    value.textContent = t("settings.scaleNone", { page });
  } else {
    const detail = isManualCalibration(calibration)
      ? t("settings.scaleManual", { ratio: formatNumber(calibration.ratio, 6) })
      : t("settings.scaleReference", {
          length: formatNumber(calibration.knownLength, 2),
          unit: calibration.unit,
        });
    value.textContent = t("settings.scaleValue", {
      page,
      detail,
      scale: formatScale(pageScale(project, pageId), calibration),
      locked: locked ? t("settings.scaleLockedSuffix") : "",
    });
  }
  const hint = el("p", "settings-note", t("settings.scaleHint"));
  wrap.append(value, hint);
  return wrap;
}
