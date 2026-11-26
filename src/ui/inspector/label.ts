import { symbolName } from "../../features/schematics";
import { t } from "../../i18n";
import { setItemLabel } from "../../model/commands/itemLabel";
import { store } from "../../state/store";
import { el } from "../dom";
import type { InspectorContext } from "./context";

export function appendLabel(section: HTMLElement, context: InspectorContext): void {
  const { item, locked, metrics, selection } = context;
  const labelField = el("label", "field");
  labelField.append(
    el(
      "span",
      "field-label",
      item.kind === "delta"
        ? t("inspector.dateOptional")
        : metrics
          ? t("inspector.labelOptional")
          : t("inspector.listLabelOptional"),
    ),
  );
  const labelInput = el("input", "input");
  labelInput.id = "selection-label-input";
  labelInput.dataset.role = "selection-label";
  labelInput.value = item.label ?? "";
  labelInput.placeholder =
    item.kind === "delta"
      ? "YYYY-MM-DD"
      : item.kind === "symbol"
        ? symbolName(item.symbolId)
        : (metrics?.primary ??
          (item.kind === "text" ? t("inspector.textNote") : t("report.markup.label")));
  labelInput.disabled = locked;
  labelInput.title = locked
    ? t("inspector.unlockLayerEdit")
    : metrics
      ? t("inspector.shownWithMeasurement")
      : t("inspector.markupsMetadata");
  labelInput.addEventListener("change", () => {
    store.mutate((project) => {
      setItemLabel(project, [selection], labelInput.value);
    }, "change");
  });
  labelField.append(labelInput);
  section.append(labelField);
  if (!metrics) {
    section.append(
      el(
        "div",
        "empty-note small",
        item.kind === "delta"
          ? t("inspector.dateBelowTriangle")
          : item.kind === "symbol"
            ? t("inspector.symbolNameNote")
            : t("inspector.listLabelNote"),
      ),
    );
  }
}
