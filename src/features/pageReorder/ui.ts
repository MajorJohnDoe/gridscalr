import { t } from "../../i18n";
import { el } from "../../ui/dom";

/**
 * DOM pieces for page reordering: the document run header, the screen-reader
 * hint and live region, and the drop indicator line. Layout decisions stay here
 * so the controller can remain a state machine.
 */

/** Stable id so every page card can describe the reorder keys. */
export const PAGE_REORDER_HINT_ID = "page-reorder-hint";

/** Visually hidden hint referenced by `aria-describedby` on every card. */
export function pageReorderHint(): HTMLElement {
  const hint = el("p", "page-reorder-hint", t("page.reorderHint"));
  hint.id = PAGE_REORDER_HINT_ID;
  return hint;
}

/** Header that makes a run of pages from another source document explicit. */
export function documentRunHeader(name: string, count: number): HTMLElement {
  const header = el("div", "page-document-run");
  header.setAttribute("role", "heading");
  header.setAttribute("aria-level", "3");
  header.setAttribute("aria-label", t("page.documentRunAria", { name, count }));
  header.append(
    el("span", "page-document-name", name),
    el("span", "page-document-count", t("page.documentRunCount", { count })),
  );
  return header;
}

/** Polite live region that reports the result of a keyboard reorder. */
export class LiveRegion {
  private node: HTMLElement | null = null;

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
    const node = el("div", "page-reorder-announcer");
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.setAttribute("aria-atomic", "true");
    document.body.append(node);
    this.node = node;
    return node;
  }
}

/**
 * One absolutely positioned line inside the page list. It is repositioned on
 * every drag update and never inserted between cards, so tracking it cannot
 * shift the layout it is measuring.
 */
export class DropIndicator {
  private line: HTMLElement | null = null;
  private label: HTMLElement | null = null;

  show(
    list: HTMLElement,
    cards: readonly HTMLElement[],
    insertionIndex: number,
    label: string | null,
  ): void {
    const line = this.ensure(list);
    const listRect = list.getBoundingClientRect();
    let top = 0;
    if (cards.length) {
      const clamped = Math.max(0, Math.min(cards.length - 1, insertionIndex));
      const rect = cards[clamped].getBoundingClientRect();
      top = insertionIndex >= cards.length ? rect.bottom - listRect.top : rect.top - listRect.top;
    }
    line.style.top = `${Math.round(top)}px`;
    line.hidden = false;
    if (this.label) {
      this.label.textContent = label ?? "";
      this.label.hidden = !label;
    }
    line.classList.toggle("is-cross-document", Boolean(label));
  }

  hide(): void {
    if (this.line) this.line.hidden = true;
  }

  destroy(): void {
    this.line?.remove();
    this.line = null;
    this.label = null;
  }

  private ensure(list: HTMLElement): HTMLElement {
    if (this.line && this.line.parentElement === list) return this.line;
    this.destroy();
    const line = el("div", "page-drop-line");
    line.setAttribute("aria-hidden", "true");
    const label = el("span", "page-drop-label");
    label.hidden = true;
    line.append(label);
    list.append(line);
    this.line = line;
    this.label = label;
    return line;
  }
}
