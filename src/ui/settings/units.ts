import { t } from "../../i18n";
import type { AreaUnit, LengthUnit } from "../../model/types";
import { AREA_UNITS, LENGTH_UNITS, lengthUnitLabel } from "../../model/units";
import { store } from "../../state/store";
import { el, option } from "../dom";
import { checkRow, field, section } from "../settingsControls";

export function unitsSection(): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.unitsTitle"), t("settings.unitsNote"));
  const row = el("div", "field-row");

  const length = el("select", "select");
  length.setAttribute("aria-label", t("settings.lengthUnitAria"));
  for (const unit of LENGTH_UNITS) {
    length.append(
      option(unit.id, lengthUnitLabel(unit.id), unit.id === project.settings.lengthUnit),
    );
  }
  length.addEventListener("change", () => {
    store.mutate((project) => {
      project.settings.lengthUnit = length.value as LengthUnit;
    }, "change");
  });

  const area = el("select", "select");
  area.setAttribute("aria-label", t("settings.areaUnitAria"));
  for (const unit of AREA_UNITS) {
    area.append(option(unit.id, unit.label, unit.id === project.settings.areaUnit));
  }
  area.addEventListener("change", () => {
    store.mutate((project) => {
      project.settings.areaUnit = area.value as AreaUnit;
    }, "change");
  });

  row.append(field(t("settings.length"), length), field(t("settings.area"), area));
  wrap.append(row);
  wrap.append(
    checkRow(t("settings.smartLength"), project.settings.smartLengthUnits, (checked) => {
      store.mutate((project) => {
        project.settings.smartLengthUnits = checked;
      }, "change");
    }),
  );
  wrap.append(el("p", "settings-note", t("settings.smartLengthNote")));
  return wrap;
}
