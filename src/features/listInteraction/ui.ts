import { el } from "../../ui/dom";
import { icon } from "../../ui/icons";

/**
 * DOM pieces shared by the workspace lists: the drag handle, the polite live
 * region for keyboard moves and plain row focus navigation. The insertion line
 * and the held-row state live in `feedback.ts`. Class names are configurable so
 * each list keeps its existing styling while the behaviour is shared.
 */

/**
 * Polite live region that reports the result of a keyboard move. One region per
 * list keeps announcements from stepping on each other.
 */
export class LiveRegion {
  private node: HTMLElement | null = null;

  constructor(private readonly className = "list-announcer") {}

  announce(message: string): void {
    const node = this.ensure();
    if (node.textContent === message) {
      node.textContent = "";
      window.setTimeout(() => {
        node.textContent = message;
      }, 40);
      return;
    }
    node.textContent = message;
  }

  destroy(): void {
    this.node?.remove();
    this.node = null;
  }

  private ensure(): HTMLElement {
    if (this.node?.isConnected) return this.node;
    const node = el("div", this.className);
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.setAttribute("aria-atomic", "true");
    document.body.append(node);
    this.node = node;
    return node;
  }
}

/**
 * Visible affordance for a draggable row. It is decorative for assistive
 * technology because the row itself carries the keyboard commands; the title
 * explains the pointer gesture.
 */
export function dragHandle(label: string, className = "list-drag-handle"): HTMLElement {
  const handle = el("span", className);
  handle.setAttribute("aria-hidden", "true");
  handle.title = label;
  handle.innerHTML = icon("grip", 12);
  return handle;
}

/**
 * Plain arrow-key focus movement inside one list container. Alt+Arrow stays
 * with the reorder controller, so this handler ignores modifier keys and
 * events that a row handler already consumed.
 */
export class RowNavigator {
  private list: HTMLElement | null = null;
  private readonly onKeyDown = (event: KeyboardEvent): void => this.handle(event);

  constructor(
    private readonly rowSelector: string,
    private readonly options: { includeShift?: boolean } = {},
  ) {}

  bind(list: HTMLElement): void {
    this.detach();
    this.list = list;
    list.addEventListener("keydown", this.onKeyDown);
  }

  detach(): void {
    this.list?.removeEventListener("keydown", this.onKeyDown);
    this.list = null;
  }

  private handle(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.shiftKey && !this.options.includeShift) return;
    if (
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown" &&
      event.key !== "Home" &&
      event.key !== "End"
    )
      return;
    const list = this.list;
    const target = event.target as HTMLElement | null;
    const row = target?.closest<HTMLElement>(this.rowSelector);
    if (!list || !row || target !== row) return;
    const rows = [...list.querySelectorAll<HTMLElement>(this.rowSelector)].filter(
      (entry) => !entry.hidden,
    );
    const index = rows.indexOf(row);
    if (index < 0) return;
    let next: number;
    if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "ArrowDown") next = Math.min(rows.length - 1, index + 1);
    else if (event.key === "Home") next = 0;
    else next = rows.length - 1;
    if (next === index) return;
    event.preventDefault();
    rows[next].focus();
  }
}
