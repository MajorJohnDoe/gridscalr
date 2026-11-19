import { el } from "../../ui/dom";
import { dropLinePlacement, type RowBox } from "./model";

/**
 * Shared visual feedback for a row drag: one insertion line and one held state.
 *
 * The line is mounted on `document.body` and positioned in viewport
 * coordinates, so an ancestor's `overflow` cannot clip it and a scrolled panel
 * cannot push it out of sight. Every panel draws the same element through the
 * same geometry rule (`dropLinePlacement`), which is why Pages, Layers and the
 * takeoff builder columns cannot drift apart.
 *
 * The held state is a class on every row the drag will move. The stylesheet
 * owns its look, so a panel cannot forget it the way the builder column list
 * used to.
 */

export interface DragFeedbackOptions {
  /** Extra class for the line; each panel keeps its own stylesheet hook. */
  lineClass?: string;
  labelClass?: string;
  labelledClass?: string;
  crossClass?: string;
  /** Class applied to every row that the current drag will move. */
  heldClass?: string;
}

function rowBox(rect: DOMRect): RowBox {
  return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
}

/** The visual viewport, in the same coordinate space as `getBoundingClientRect`. */
export function viewportBox(): RowBox {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const height = window.innerHeight || document.documentElement.clientHeight || 0;
  return { top: 0, left: 0, right: width, bottom: height };
}

export class ListDragFeedback {
  private line: HTMLElement | null = null;
  private label: HTMLElement | null = null;
  private held: HTMLElement[] = [];

  constructor(private readonly options: DragFeedbackOptions = {}) {}

  /** True while the insertion line is on screen. */
  get visible(): boolean {
    return Boolean(this.line && !this.line.hidden);
  }

  /**
   * Draws the line at the boundary for `insertionIndex` and hides it when the
   * list itself has left the viewport.
   */
  show(
    list: HTMLElement,
    rows: readonly HTMLElement[],
    insertionIndex: number,
    label: string | null = null,
    crossDocument = false,
  ): void {
    const line = this.ensure();
    const placement = dropLinePlacement(
      rows.map((row) => rowBox(row.getBoundingClientRect())),
      insertionIndex,
      rowBox(list.getBoundingClientRect()),
      viewportBox(),
    );
    line.style.top = `${placement.top}px`;
    line.style.left = `${placement.left}px`;
    line.style.width = `${placement.width}px`;
    line.hidden = !placement.visible;
    if (this.label) {
      this.label.textContent = label ?? "";
      this.label.hidden = !label;
    }
    line.classList.toggle(this.options.labelledClass ?? "is-labelled", Boolean(label));
    line.classList.toggle(this.options.crossClass ?? "is-cross-document", crossDocument);
  }

  hide(): void {
    if (this.line) this.line.hidden = true;
  }

  /** Marks every row that the current drag will move as held. */
  hold(rows: readonly HTMLElement[]): void {
    const heldClass = this.options.heldClass ?? "is-dragging";
    for (const row of this.held) row.classList.remove(heldClass);
    this.held = [...rows];
    for (const row of this.held) row.classList.add(heldClass);
  }

  releaseHeld(): void {
    const heldClass = this.options.heldClass ?? "is-dragging";
    for (const row of this.held) row.classList.remove(heldClass);
    this.held = [];
  }

  destroy(): void {
    this.releaseHeld();
    this.line?.remove();
    this.line = null;
    this.label = null;
  }

  private ensure(): HTMLElement {
    if (this.line?.isConnected) return this.line;
    this.line = null;
    this.label = null;
    const classes = new Set(["list-drop-line", this.options.lineClass ?? "list-drop-line"]);
    const line = el("div", [...classes].join(" "));
    line.setAttribute("aria-hidden", "true");
    const label = el("span", this.options.labelClass ?? "list-drop-label");
    label.hidden = true;
    line.append(label);
    // A body-level overlay is never clipped by a scrolling panel.
    document.body.append(line);
    this.line = line;
    this.label = label;
    return line;
  }
}
