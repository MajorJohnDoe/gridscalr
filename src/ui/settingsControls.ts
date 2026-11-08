import { normalizeStampPresets } from "../model/stamps";
import { el } from "./dom";
import { t } from "../i18n";

/** Shared building blocks for the Preferences and Project settings dialogs. */

export interface DialogCategory {
  id: string;
  label: string;
  render: () => HTMLElement | HTMLElement[];
}

export interface CategoryLayout {
  body: HTMLElement;
  content: HTMLElement;
  select: (id: string) => void;
  refresh: () => void;
}

/** Two-column dialog layout with a category menu, shared by Preferences and Project settings. */
export function categoryLayout(
  ariaLabel: string,
  categories: readonly DialogCategory[],
  initialId?: string,
): CategoryLayout {
  const body = el("div", "dialog-columns");
  const nav = el("nav", "dialog-nav");
  nav.setAttribute("aria-label", ariaLabel);
  const content = el("div", "dialog-pane");
  body.append(nav, content);

  const buttons = new Map<string, HTMLButtonElement>();
  let currentId = initialId ?? categories[0]?.id ?? "";

  const select = (id: string) => {
    currentId = id;
    for (const [key, button] of buttons) {
      const selected = key === id;
      button.classList.toggle("is-active", selected);
      if (selected) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
    const category = categories.find((entry) => entry.id === id) ?? categories[0];
    const rendered = category ? category.render() : [];
    content.replaceChildren(...(Array.isArray(rendered) ? rendered : [rendered]));
  };

  for (const category of categories) {
    const button = el("button", "dialog-tab", category.label);
    button.type = "button";
    button.addEventListener("click", () => select(category.id));
    nav.append(button);
    buttons.set(category.id, button);
  }
  if (currentId) select(currentId);

  return { body, content, select, refresh: () => select(currentId) };
}

export function section(title: string, note?: string): HTMLElement {
  const wrap = el("section", "settings-section");
  wrap.append(el("h3", "", title));
  if (note) wrap.append(el("p", "settings-note", note));
  return wrap;
}

export function checkRow(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const row = el("label", "check-row");
  const input = el("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  row.append(input, el("span", "", label));
  return row;
}

export function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = el("label", "field settings-field");
  wrap.append(el("span", "field-label", label), control);
  return wrap;
}

/** Editable list used for project and app stamp presets. */
export function presetEditor(
  values: readonly string[],
  onChange: (next: string[]) => void,
  addLabel: string,
): HTMLElement {
  const wrap = el("div", "stamp-preset-editor");
  let currentValues = [...values];
  const rebuild = () => {
    wrap.replaceChildren();
    currentValues.forEach((value, index) => {
      const row = el("div", "stamp-preset-row");
      const input = el("input", "input");
      input.type = "text";
      input.value = value;
      input.maxLength = 40;
      input.setAttribute("aria-label", t("settings.stampPresetAria", { index: index + 1 }));
      input.addEventListener("change", () => {
        const next = [...currentValues];
        next[index] = input.value;
        currentValues = normalizeStampPresets(next);
        onChange(currentValues);
      });
      const remove = el("button", "icon-btn", "×");
      remove.type = "button";
      remove.title = t("settings.removePreset");
      remove.setAttribute("aria-label", t("settings.removePresetAria", { name: value }));
      remove.addEventListener("click", () => {
        currentValues = currentValues.filter((_entry, entryIndex) => entryIndex !== index);
        onChange(currentValues);
        rebuild();
      });
      row.append(input, remove);
      wrap.append(row);
    });
    const addRow = el("div", "input-row");
    const addInput = el("input", "input");
    addInput.type = "text";
    addInput.placeholder = addLabel;
    addInput.maxLength = 40;
    addInput.setAttribute("aria-label", addLabel);
    const add = el("button", "btn btn-small", t("common.add"));
    add.type = "button";
    add.addEventListener("click", () => {
      const text = addInput.value.trim();
      if (!text) return;
      currentValues = normalizeStampPresets([...currentValues, text]);
      onChange(currentValues);
      rebuild();
    });
    addInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        add.click();
      }
    });
    addRow.append(addInput, add);
    wrap.append(addRow);
  };
  rebuild();
  return wrap;
}
