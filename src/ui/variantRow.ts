import { el } from "./dom";
import { icon } from "./icons";

export interface VariantRowOptions {
  label: string;
  /** A short second line; the measurement shape rows omit it to stay narrow. */
  description?: string;
  iconName: string;
  selected: boolean;
  /**
   * A menu uses `menuitemradio`; a settings panel uses `radio` inside a
   * `radiogroup`.
   */
  role?: "menuitemradio" | "radio";
  /** Roving tab stop for a radiogroup: the selected row is `0`, others `-1`. */
  tabindex?: number;
  container?: HTMLElement;
  onSelect: () => void;
}

/**
 * One icon + label row shared by the tool flyouts and the measurement settings
 * panel, so the marked-row affordance and its styles exist once.
 */
export function variantRow(container: HTMLElement, options: VariantRowOptions): HTMLButtonElement {
  const button = el("button", `tool-variant-row${options.selected ? " is-selected" : ""}`);
  button.type = "button";
  button.setAttribute("role", options.role ?? "menuitemradio");
  button.setAttribute("aria-checked", String(options.selected));
  if (options.tabindex !== undefined) button.tabIndex = options.tabindex;
  const mark = el("span", "tool-variant-check");
  if (options.selected) mark.innerHTML = icon("check", 11);
  const iconWrap = el("span", "tool-variant-icon");
  iconWrap.innerHTML = icon(options.iconName, 15);
  const text = el("span", "tool-variant-text");
  text.append(el("span", "tool-variant-label", options.label));
  if (options.description !== undefined) {
    text.append(el("span", "tool-variant-description", options.description));
  }
  button.append(mark, iconWrap, text);
  button.addEventListener("click", options.onSelect);
  (options.container ?? container).append(button);
  return button;
}
