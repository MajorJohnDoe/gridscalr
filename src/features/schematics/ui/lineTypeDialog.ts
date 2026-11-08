import { makeId } from "../../../model/calibration";
import type { LineType } from "../../../model/types";
import { store } from "../../../state/store";
import { colorInputValue, setColorInput } from "../../../ui/colorInput";
import { showModal } from "../../../ui/dialogs";
import { colorWithEyedropper } from "../../../ui/colorPicker";
import { el, option } from "../../../ui/dom";
import { t } from "../../../i18n";

type DraftLineType = LineType;

/** Edits the project media classes. Existing pipes keep their stored style. */
export async function openLineTypeDialog(): Promise<void> {
  const project = store.project;
  if (!project) return;
  const types: DraftLineType[] = project.lineTypes.map((entry) => ({ ...entry }));

  const body = el("div", "form-stack");
  body.append(el("p", "modal-message", t("lineType.dialog.subtitle")));
  const list = el("div", "form-stack");
  body.append(list);

  const render = () => {
    list.replaceChildren();
    types.forEach((type, index) => {
      const row = el("div", "line-type-row");
      const name = el("input", "input");
      name.type = "text";
      name.maxLength = 80;
      name.value = type.name;
      name.placeholder = t("lineType.dialog.name");
      name.setAttribute("aria-label", t("lineType.dialog.name"));
      name.addEventListener("input", () => {
        type.name = name.value;
      });

      const color = el("input", "line-type-color");
      color.type = "color";
      setColorInput(color, type.color, "#4cc9f0");
      color.setAttribute("aria-label", t("lineType.dialog.color"));
      color.addEventListener("input", () => {
        type.color = colorInputValue(color, "#4cc9f0");
      });

      const width = el("input", "input line-type-width");
      width.type = "number";
      width.min = "0.3";
      width.max = "20";
      width.step = "0.1";
      width.value = String(type.widthPt);
      width.setAttribute("aria-label", t("lineType.dialog.width"));
      width.addEventListener("input", () => {
        type.widthPt = Math.max(0.3, Math.min(20, Number(width.value) || 2));
      });

      const style = el("select", "select line-type-style");
      style.setAttribute("aria-label", t("lineType.dialog.style"));
      style.append(
        option("solid", t("lineType.dialog.solid"), type.style === "solid"),
        option("dashed", t("lineType.dialog.dashed"), type.style === "dashed"),
      );
      style.addEventListener("change", () => {
        type.style = style.value === "dashed" ? "dashed" : "solid";
      });

      const remove = el("button", "icon-btn", "×");
      remove.type = "button";
      remove.title = t("lineType.dialog.remove");
      remove.setAttribute("aria-label", t("lineType.dialog.remove"));
      remove.disabled = types.length <= 1;
      remove.addEventListener("click", () => {
        types.splice(index, 1);
        render();
      });

      row.append(
        name,
        colorWithEyedropper(color, t("lineType.dialog.color")),
        width,
        style,
        remove,
      );
      list.append(row);
    });

    const add = el("button", "btn btn-small", t("lineType.dialog.add"));
    add.type = "button";
    add.addEventListener("click", () => {
      types.push({
        id: makeId("line"),
        name: t("lineType.dialog.newName"),
        color: "#4cc9f0",
        widthPt: 2,
        style: "solid",
      });
      render();
    });
    list.append(add);
  };
  render();

  const result = await showModal({
    title: t("lineType.dialog.title"),
    body,
    wide: true,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("common.apply"), value: "apply", primary: true },
    ],
    onValidate: () =>
      types.some((type) => !type.name.trim()) ? t("lineType.dialog.emptyName") : null,
  });
  if (result !== "apply") return;

  const next: LineType[] = types.map((type) => ({
    id: type.id || makeId("line"),
    name: type.name.replace(/\s+/g, " ").trim().slice(0, 80),
    color: /^#[0-9a-f]{6}$/i.test(type.color) ? type.color : "#4cc9f0",
    widthPt: Math.max(0.3, Math.min(20, type.widthPt || 2)),
    style: type.style === "dashed" ? "dashed" : "solid",
  }));
  if (!next.length) return;

  store.mutate((current) => {
    current.lineTypes = next;
  }, "change");
  store.setLineType(
    next.some((type) => type.id === store.ui.lineTypeId) ? store.ui.lineTypeId : next[0].id,
  );
}
