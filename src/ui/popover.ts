import { el } from "./dom";
import { icon } from "./icons";

export interface PopoverItem {
  label?: string;
  icon?: string;
  action?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

function buildPopover(items: PopoverItem[]): HTMLElement {
  const popover = el("div", "popover");
  for (const item of items) {
    if (item.separator) {
      popover.append(el("div", "popover-separator"));
      continue;
    }
    const btn = el("button", `popover-item${item.danger ? " is-danger" : ""}`);
    btn.type = "button";
    btn.disabled = item.disabled ?? false;
    if (item.icon) btn.innerHTML = icon(item.icon, 14);
    btn.append(el("span", "", item.label ?? ""));
    btn.addEventListener("click", () => {
      popover.remove();
      item.action?.();
    });
    popover.append(btn);
  }
  return popover;
}

function mountPopover(popover: HTMLElement, left: number, top: number): void {
  document.querySelectorAll(".popover").forEach((node) => node.remove());
  document.body.append(popover);
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (top + height > window.innerHeight - 8) top = window.innerHeight - height - 8;
  popover.style.left = `${Math.max(8, left)}px`;
  popover.style.top = `${Math.max(8, top)}px`;

  const close = (event: Event) => {
    if (event.type === "mousedown" && popover.contains(event.target as Node)) return;
    popover.remove();
    document.removeEventListener("mousedown", close);
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") close(event);
  };
  setTimeout(() => {
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
  }, 0);
}

export function showPopover(anchor: HTMLElement, items: PopoverItem[]): void {
  const popover = buildPopover(items);
  document.body.append(popover);
  const rect = anchor.getBoundingClientRect();
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  let left = rect.left;
  let top = rect.bottom + 5;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (top + height > window.innerHeight - 8) top = rect.top - height - 5;
  popover.remove();
  mountPopover(popover, left, top);
}

export function showPopoverAt(x: number, y: number, items: PopoverItem[]): void {
  mountPopover(buildPopover(items), x + 2, y + 2);
}
