import { t } from "../../i18n";
import {
  layerLockedOnPage,
  layerVisibleOnPage,
  moveItemToLayer,
  moveTargetLayers,
} from "../../model/layers";
import { store } from "../../state/store";
import { el, option } from "../dom";
import { icon } from "../icons";
import type { InspectorContext } from "./context";

export function appendItemActions(section: HTMLElement, context: InspectorContext): void {
  const { project, item, layer, actions, locked, hidden } = context;
  const layerField = el("label", "field");
  layerField.append(el("span", "field-label", t("inspector.moveToLayer")));
  const layerSelect = el("select", "select");
  const layerCandidates = moveTargetLayers(project, layer.kind, [item.pageId]);
  for (const candidate of layerCandidates) {
    layerSelect.append(option(candidate.id, candidate.name, candidate.id === layer.id));
  }
  layerSelect.disabled = locked || layerCandidates.length < 2;
  layerSelect.addEventListener("change", () => {
    store.mutate((project) => {
      moveItemToLayer(project, layer.id, item.id, layerSelect.value);
    }, "change");
    store.setSelection({ layerId: layerSelect.value, itemId: item.id });
  });
  layerField.append(layerSelect);
  section.append(layerField);

  const visibilityRow = el("div", "field-row");
  const visibleToggle = el("button", `toggle${!hidden ? " is-on" : ""}`);
  visibleToggle.type = "button";
  const layerShown = layerVisibleOnPage(layer, item.pageId);
  visibleToggle.disabled = !layerShown;
  visibleToggle.title = layerShown ? t("inspector.showHideMarkup") : t("inspector.showLayerFirst");
  visibleToggle.innerHTML = `${icon(hidden ? "eyeOff" : "eye", 13)}<span>${hidden ? t("common.hidden") : t("common.visible")}</span>`;
  visibleToggle.addEventListener("click", () => actions.setSelectionVisible(hidden));
  const lockToggle = el("button", `toggle${locked ? " is-on" : ""}`);
  lockToggle.type = "button";
  lockToggle.disabled = layerLockedOnPage(layer, item.pageId);
  lockToggle.title = layerLockedOnPage(layer, item.pageId)
    ? t("inspector.unlockLayerFirst")
    : t("inspector.lockUnlockMarkup");
  lockToggle.innerHTML = `${icon(locked ? "lock" : "unlock", 13)}<span>${locked ? t("layer.locked") : t("common.unlocked")}</span>`;
  lockToggle.addEventListener("click", () => actions.setSelectionLocked(!item.locked));
  visibilityRow.append(visibleToggle, lockToggle);
  section.append(visibilityRow);

  const actionsWrap = el("div", "selection-actions");
  const duplicate = el("button", "btn btn-small", t("layer.duplicate"));
  duplicate.type = "button";
  duplicate.disabled = locked;
  duplicate.innerHTML = `${icon("copy", 13)}<span>${t("layer.duplicate")}</span>`;
  duplicate.addEventListener("click", actions.duplicateSelection);
  const remove = el("button", "btn btn-small btn-danger", t("common.delete"));
  remove.type = "button";
  remove.disabled = locked;
  remove.innerHTML = `${icon("trash", 13)}<span>${t("common.delete")}</span>`;
  remove.addEventListener("click", actions.deleteSelection);
  actionsWrap.append(duplicate, remove);
  section.append(actionsWrap);
}
