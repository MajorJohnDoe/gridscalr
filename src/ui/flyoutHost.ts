import {
  registerTransientOverlay,
  type TransientOverlayHandle,
} from "../features/transientOverlay";
import { el } from "./dom";

const LONG_PRESS_MS = 320;

let flyoutRoot: HTMLElement | null = null;
let flyoutAnchor: HTMLElement | null = null;
let flyoutCleanup: (() => void) | null = null;
let flyoutRegistration: TransientOverlayHandle | null = null;
let longPressTimer: number | null = null;

/**
 * Shared rail/flyout gesture: a normal click can open the panel, while a
 * long-press and a right-click keep working for touch, pen and discoverability.
 */
export function attachFlyoutPressHandlers(
  button: HTMLButtonElement,
  open: () => void,
  openOnClick = false,
): void {
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (longPressTimer !== null) window.clearTimeout(longPressTimer);
    longPressTimer = window.setTimeout(() => {
      longPressTimer = null;
      button.dataset.longPressed = "1";
      open();
    }, LONG_PRESS_MS);
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
    button.addEventListener(type, () => {
      if (longPressTimer !== null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });
  }

  button.addEventListener(
    "click",
    (event) => {
      if (button.dataset.longPressed === "1") {
        delete button.dataset.longPressed;
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  if (openOnClick) {
    button.addEventListener("click", () => {
      if (button.dataset.longPressed === "1") return;
      open();
    });
  }

  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    open();
  });
}

export interface MountFlyoutOptions {
  /** Variant flies use a menu; the settings panel is a non-modal dialog. */
  role?: "menu" | "dialog";
  /** Move focus into the panel when it opens. */
  focus?: boolean;
  /** Return focus to the anchor when Escape closes the panel. */
  returnFocus?: boolean;
  /** Extra class for a wider or otherwise distinct panel. */
  className?: string;
}

function outsideHandler(event: MouseEvent): void {
  if (!flyoutRoot) return;
  const target = event.target as Node;
  if (flyoutRoot.contains(target)) return;
  // The anchor toggles its own flyout in its click handler, so a mousedown on
  // it must not close the panel first and immediately reopen it.
  if (flyoutAnchor?.contains(target)) return;
  closeFlyout();
}

export function mountFlyout(
  anchor: HTMLElement,
  ariaLabel: string,
  render: (panel: HTMLElement, rerender: () => void) => void,
  options: MountFlyoutOptions = {},
): void {
  if (flyoutRoot && flyoutAnchor === anchor) {
    closeFlyout();
    return;
  }
  closeFlyout();
  const root = el("div", "tool-flyout-root");
  root.addEventListener("mousedown", (event) => {
    if (event.target === root) closeFlyout();
  });
  const panel = el("div", options.className ? `tool-flyout ${options.className}` : "tool-flyout");
  panel.setAttribute("role", options.role ?? "menu");
  panel.setAttribute("aria-label", ariaLabel);
  root.append(panel);
  document.body.append(root);
  flyoutRoot = root;
  flyoutAnchor = anchor;
  anchor.setAttribute("aria-expanded", "true");

  const controls = (): HTMLElement[] =>
    [...panel.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]")].filter(
      (node) => !node.hasAttribute("disabled"),
    );

  const rerender = (initial = false): void => {
    const focusedIndex = controls().indexOf(document.activeElement as HTMLElement);
    const scrollTop = panel.scrollTop;
    panel.replaceChildren();
    render(panel, rerender);
    positionFlyout(anchor, panel);
    panel.scrollTop = scrollTop;
    const next = controls();
    if (initial) {
      if (options.focus) next[0]?.focus({ preventScroll: true });
    } else if (focusedIndex >= 0) {
      next[focusedIndex]?.focus({ preventScroll: true });
    }
  };
  rerender(true);

  const onKey = (event: KeyboardEvent) => {
    if ((options.role ?? "menu") !== "menu") return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...panel.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "Home"
        ? items[0]
        : event.key === "End"
          ? items[items.length - 1]
          : event.key === "ArrowDown"
            ? items[(index + 1 + items.length) % items.length]
            : items[(index - 1 + items.length) % items.length];
    next?.focus({ preventScroll: true });
  };
  document.addEventListener("keydown", onKey);
  document.addEventListener("mousedown", outsideHandler, true);
  window.addEventListener("resize", closeFlyout);
  window.addEventListener("blur", closeFlyout);
  flyoutRegistration = registerTransientOverlay(root, () => {
    closeFlyout();
    if (options.returnFocus) anchor.focus({ preventScroll: true });
  });
  flyoutCleanup = () => {
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("mousedown", outsideHandler, true);
    window.removeEventListener("resize", closeFlyout);
    window.removeEventListener("blur", closeFlyout);
    flyoutRegistration?.unregister();
    flyoutRegistration = null;
  };
}

function positionFlyout(anchor: HTMLElement, panel: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  panel.style.left = `${rect.right + 5}px`;
  panel.style.top = `${rect.top}px`;
  const box = panel.getBoundingClientRect();
  if (box.right > window.innerWidth - 8) {
    panel.style.left = `${Math.max(8, rect.left - box.width - 5)}px`;
  }
  if (box.bottom > window.innerHeight - 8) {
    panel.style.top = `${Math.max(8, window.innerHeight - box.height - 8)}px`;
  }
}

export function closeFlyout(): void {
  if (longPressTimer !== null) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  if (!flyoutRoot) return;
  const root = flyoutRoot;
  const anchor = flyoutAnchor;
  flyoutRoot = null;
  flyoutAnchor = null;
  flyoutCleanup?.();
  flyoutCleanup = null;
  root.remove();
  anchor?.setAttribute("aria-expanded", "false");
}
