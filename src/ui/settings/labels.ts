import { t } from "../../i18n";
import { LABEL_MAX_SIZE, LABEL_MIN_SIZE, clampLabelSize } from "../../model/label";
import { formatNumber } from "../../model/units";
import { store } from "../../state/store";
import { el } from "../dom";
import { checkRow, field, section } from "../settingsControls";

export function labelsSection(): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.labelsTitle"), t("settings.labelsNote"));

  const sizeField = field(t("settings.labelSize"), el("div", "settings-range"));
  const range = sizeField.querySelector<HTMLElement>(".settings-range")!;
  const input = el("input", "input");
  input.type = "range";
  input.min = String(LABEL_MIN_SIZE);
  input.max = String(LABEL_MAX_SIZE);
  input.step = "0.5";
  const current = clampLabelSize(project.settings.labelSize);
  input.value = String(current);
  input.setAttribute("aria-label", t("settings.labelSizeAria"));
  input.title = t("settings.labelSizeTitle");
  const readout = el("span", "settings-range-value", `${formatNumber(current, 1)} pt`);
  input.addEventListener("input", () => {
    readout.textContent = `${formatNumber(Number(input.value), 1)} pt`;
  });
  input.addEventListener("change", () => {
    const value = clampLabelSize(Number(input.value));
    store.mutate((project) => {
      project.settings.labelSize = value;
    }, "change");
  });
  range.append(input, readout);
  wrap.append(
    sizeField,
    checkRow(t("settings.compactArea"), project.settings.compactAreaLabels, (checked) => {
      store.mutate((project) => {
        project.settings.compactAreaLabels = checked;
      }, "change");
    }),
  );
  wrap.append(el("p", "settings-note", t("settings.compactAreaNote")));
  return wrap;
}
