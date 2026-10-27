import { el } from "./dom";
import { icon } from "./icons";

export interface PopoverItem {
  label?: string;
  icon?: string;
  action?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  /** Nested menu opened to the side of the parent item. */
  children?: PopoverItem[];
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

    if (item.children?.length) {
      const submenu = buildPopover(item.children);
      submenu.classList.add("popover-submenu");
      submenu.hidden = true;
      btn.classList.add("has-children");
      btn.setAttribute("aria-haspopup", "menu");
      btn.setAttribute("aria-expanded", "false");
      const caret = el("span", "popover-caret");
      caret.innerHTML = icon("chevronRight", 12);
      btn.append(caret);
      btn.addEventListener("click", (event) => {
        // Keep the parent menu open; only the nested menu toggles.
        event.stopPropagation();
        if (!btn.disabled) toggleSubmenu(btn, submenu);
      });
      const row = el("div", "popover-row");
      row.append(btn, submenu);
      popover.append(row);
      continue;
    }

    btn.addEventListener("click", () => {
      popover.remove();
      item.action?.();
    });
    popover.append(btn);
  }
  return popover;
}

function toggleSubmenu(parent: HTMLElement, submenu: HTMLElement): void {
  const open = !submenu.hidden;
  submenu.hidden = open;
  parent.setAttribute("aria-expanded", String(!open));
  if (open) return;
  const rect = parent.getBoundingClientRect();
  const width = submenu.offsetWidth;
  const height = submenu.offsetHeight;
  let left = rect.right - 4;
  if (left + width > window.innerWidth - 8) left = rect.left - width + 4;
  let top = rect.top - 4;
  if (top + height > window.innerHeight - 8) top = window.innerHeight - height - 8;
  submenu.style.left = `${Math.max(8, left)}px`;
  submenu.style.top = `${Math.max(8, top)}px`;
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

  let closed = false;
  let armTimer = 0;
  const onMouseDown = (event: MouseEvent) => {
    if (popover.contains(event.target as Node)) return;
    close();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  const close = () => {
    if (closed) return;
    closed = true;
    if (armTimer) window.clearTimeout(armTimer);
    document.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("keydown", onKey);
    popover.remove();
  };
  // Escape is safe to handle immediately. A mouse click is armed on the next
  // turn so the click that opened the popover does not close it again.
  document.addEventListener("keydown", onKey);
  popover.addEventListener("click", close);
  armTimer = window.setTimeout(() => {
    if (!closed) document.addEventListener("mousedown", onMouseDown);
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
