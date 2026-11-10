import { el } from "./dom";

export function exportRadio(
  name: string,
  label: string,
  checked: boolean,
): {
  row: HTMLElement;
  input: HTMLInputElement;
} {
  const row = el("label", "check-row export-radio");
  const input = el("input");
  input.type = "radio";
  input.name = name;
  input.checked = checked;
  row.append(input, el("span", "", label));
  return { row, input };
}

export function exportCheckbox(
  label: string,
  note: string,
  checked: boolean,
): {
  row: HTMLElement;
  input: HTMLInputElement;
} {
  const row = el("label", "check-row export-check");
  const input = el("input");
  input.type = "checkbox";
  input.checked = checked;
  const text = el("span", "export-check-text");
  text.append(el("strong", "", label), el("span", "export-check-note", note));
  row.append(input, text);
  return { row, input };
}
