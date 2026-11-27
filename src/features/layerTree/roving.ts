/**
 * Roving tabindex for one ARIA tree surface. The tree has exactly one tab stop;
 * ArrowUp/ArrowDown/Home/End move focus between the visible treeitems, including
 * items inside an expanded layer. Plain Left/Right and the Alt nesting keys stay
 * with the existing row handler, so this helper never takes a move command.
 */

const TREEITEM = '[role="treeitem"]';

function treeItems(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TREEITEM)].filter((item) => !item.hidden);
}

function setTabStop(root: HTMLElement, active: HTMLElement | null): void {
  const items = [...root.querySelectorAll<HTMLElement>(TREEITEM)];
  for (const item of items) item.tabIndex = item === active ? 0 : -1;
}

/** Keeps one treeitem tabbable, restoring it after a panel render. */
export function ensureTreeTabStop(root: HTMLElement, preferredId?: string | null): void {
  const items = [...root.querySelectorAll<HTMLElement>(TREEITEM)];
  if (!items.length) return;
  const preferred = preferredId
    ? items.find((item) => item.dataset.layerId === preferredId)
    : undefined;
  const active =
    preferred ??
    items.find((item) => item.tabIndex === 0) ??
    items.find((item) => item.classList.contains("is-active")) ??
    items[0];
  setTabStop(root, active);
}

/**
 * Binds the roving tab stop for a tree section. Listeners live on the section,
 * so a render replaces the section and its listeners together.
 */
export function bindRovingTree(root: HTMLElement, preferredId?: string | null): void {
  ensureTreeTabStop(root, preferredId);
  root.addEventListener("focusin", (event) => {
    const target = event.target as HTMLElement | null;
    const item = target?.closest<HTMLElement>(TREEITEM);
    if (item && root.contains(item)) setTabStop(root, item);
  });
  root.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const item = target?.closest<HTMLElement>(TREEITEM);
    // Controls inside a row keep their own key behaviour.
    if (!item || target !== item) return;
    const items = treeItems(root);
    const index = items.indexOf(item);
    if (index < 0) return;
    let next: number;
    if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "ArrowDown") next = Math.min(items.length - 1, index + 1);
    else if (event.key === "Home") next = 0;
    else next = items.length - 1;
    if (next === index) return;
    event.preventDefault();
    setTabStop(root, items[next]);
    items[next].focus({ preventScroll: false });
  });
}
