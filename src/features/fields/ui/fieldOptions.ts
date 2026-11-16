import { t } from "../../../i18n";
import { makeId } from "../../../model/calibration";
import type { FieldOption } from "../../../model/types";
import { el, iconButton } from "../../../ui/dom";
import { icon } from "../../../ui/icons";
import type { FieldDraft } from "../model";

/** Enum and multi-enum option rows inside the field editor. */

export function fieldOptionsEditor(draft: FieldDraft, onChanged: () => void): HTMLElement {
  const section = el("div", "field");
  section.append(el("span", "field-label", t("fields.options")));
  const list = el("div", "field-option-list");

  const rebuild = () => {
    list.replaceChildren();
    for (const entry of draft.options) {
      const row = el("div", "input-row field-option-row");
      const input = el("input", "input");
      input.type = "text";
      input.maxLength = 120;
      input.value = entry.label;
      input.placeholder = t("fields.optionLabel");
      input.setAttribute("aria-label", t("fields.optionLabelAria", { name: entry.id }));
      input.addEventListener("change", () => {
        entry.label = input.value;
      });
      const remove = iconButton(
        icon("trash", 13),
        t("fields.removeOptionAria", { name: entry.label || entry.id }),
        () => {
          draft.options = draft.options.filter((candidate) => candidate.id !== entry.id);
          rebuild();
          onChanged();
        },
        "icon-btn category-action",
      );
      row.append(input, remove);
      list.append(row);
    }
  };

  const add = el("button", "btn btn-small", t("fields.addOption"));
  add.type = "button";
  add.addEventListener("click", () => {
    const entry: FieldOption = { id: makeId("opt"), label: "" };
    draft.options = [...draft.options, entry];
    onChanged();
    list.querySelector<HTMLInputElement>("input:last-of-type")?.focus();
  });

  rebuild();
  section.append(list, add);
  return section;
}
