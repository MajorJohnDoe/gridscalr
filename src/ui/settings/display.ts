import { t } from "../../i18n";
import { store } from "../../state/store";
import { el } from "../dom";
import { checkRow, field, section } from "../settingsControls";

export function displaySection(): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.displayTitle"));
  wrap.append(
    checkRow(t("settings.showGrid"), project.settings.showGrid, (checked) => {
      store.mutate((project) => {
        project.settings.showGrid = checked;
      }, "change");
    }),
    checkRow(t("settings.showScale"), project.settings.showCalibration, (checked) => {
      store.mutate((project) => {
        project.settings.showCalibration = checked;
      }, "change");
    }),
    checkRow(t("settings.snap"), project.settings.snapToGeometry, (checked) => {
      store.mutate((project) => {
        project.settings.snapToGeometry = checked;
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
    const value = Math.max(2, Math.min(24, Number(input.value)));
    store.mutate((project) => {
      project.settings.snapTolerancePx = value;
    }, "change");
  });
  range.append(input, readout);
  wrap.append(snapField);

  const summary = section(t("settings.summaryCardsTitle"), t("settings.summaryCardsNote"));
  for (const card of [
    { id: "rooms" as const, label: t("settings.summaryCardRooms") },
    { id: "area" as const, label: t("settings.summaryCardArea") },
    { id: "wallLength" as const, label: t("settings.summaryCardWallLength") },
    { id: "doors" as const, label: t("settings.summaryCardDoors") },
  ]) {
    const visible = project.settings.summary.cards.find((entry) => entry.id === card.id)?.visible;
    summary.append(
      checkRow(card.label, visible !== false, (checked) => {
        store.mutate((current) => {
          const target = current.settings.summary.cards.find((entry) => entry.id === card.id);
          if (target) target.visible = checked;
        }, "change");
      }),
    );
  }
  wrap.append(summary);
  return wrap;
}
