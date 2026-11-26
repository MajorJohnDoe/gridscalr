import { t } from "../../i18n";
import { updateProjectSettings } from "../../model/commands/settings";
import { store } from "../../state/store";
import { el } from "../dom";
import { checkRow, field, section } from "../settingsControls";

/**
 * Display and snapping. The KPI cards moved to the Takeoff settings hub in
 * Phase 2, so this section keeps one link row rather than a second set of card
 * controls.
 */
export function displaySection(onOpenTakeoffSettings: () => void): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.displayTitle"));
  wrap.append(
    checkRow(t("settings.showGrid"), project.settings.showGrid, (checked) => {
      store.mutate((project) => {
        updateProjectSettings(project, { showGrid: checked });
      }, "change");
    }),
    checkRow(t("settings.showScale"), project.settings.showCalibration, (checked) => {
      store.mutate((project) => {
        updateProjectSettings(project, { showCalibration: checked });
      }, "change");
    }),
    checkRow(t("settings.snap"), project.settings.snapToGeometry, (checked) => {
      store.mutate((project) => {
        updateProjectSettings(project, { snapToGeometry: checked });
      }, "change");
    }),
  );

  const snapField = field(t("settings.snapDistance"), el("div", "settings-range"));
  const range = snapField.querySelector<HTMLElement>(".settings-range")!;
  const input = el("input", "input");
  input.type = "range";
  input.min = "2";
  input.max = "24";
  input.step = "1";
  input.value = String(project.settings.snapTolerancePx);
  input.setAttribute("aria-label", t("settings.snapAria"));
  const readout = el("span", "settings-range-value", `${project.settings.snapTolerancePx} px`);
  input.addEventListener("input", () => {
    readout.textContent = `${input.value} px`;
  });
  input.addEventListener("change", () => {
    const value = Number(input.value);
    store.mutate((project) => {
      updateProjectSettings(project, { snapTolerancePx: value });
    }, "change");
  });
  range.append(input, readout);
  wrap.append(snapField);

  const takeoff = section(t("takeoffSettings.link.title"), t("takeoffSettings.link.note"));
  const open = el("button", "btn btn-small", t("takeoffSettings.link.action"));
  open.type = "button";
  open.addEventListener("click", onOpenTakeoffSettings);
  takeoff.append(open);
  wrap.append(takeoff);
  return wrap;
}
