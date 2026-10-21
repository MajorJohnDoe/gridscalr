import { el } from "./dom";
import { icon } from "./icons";

type ToastKind = "info" | "success" | "warning" | "error";

let stack: HTMLElement | null = null;

function ensureStack(): HTMLElement {
  if (!stack) {
    stack = el("div", "toast-stack");
    stack.setAttribute("aria-live", "polite");
    document.body.append(stack);
  }
  return stack;
}

export function toast(message: string, kind: ToastKind = "info", duration = 4200): void {
  const host = ensureStack();
  const node = el("div", `toast toast-${kind}`);
  const iconName = kind === "success" ? "check" : kind === "warning" || kind === "error" ? "warning" : "info";
  node.innerHTML = icon(iconName, 16);
  node.append(el("span", "", message));
  const close = el("button", "toast-close");
  close.type = "button";
  close.innerHTML = icon("close", 13);
  close.addEventListener("click", () => node.remove());
  node.append(close);
  host.append(node);
  window.setTimeout(() => node.classList.add("is-leaving"), duration - 220);
  window.setTimeout(() => node.remove(), duration);
}
