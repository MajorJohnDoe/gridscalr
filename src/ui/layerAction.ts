import { el } from "./dom";
import { icon } from "./icons";

/**
 * Small icon button shared by the Layers and Markups rows. It is a button, so
 * the label is always available to assistive technology, and the icon is
 * decorative.
 */
export function layerAction(iconName: string, label: string, extraClass = ""): HTMLButtonElement {
  const btn = el("button", `layer-action ${extraClass}`.trim());
  btn.type = "button";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.innerHTML = icon(iconName, 13);
  return btn;
}
