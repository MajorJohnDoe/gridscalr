import {
  dragSet,
  insertionIndexAt,
  keyboardInsertion,
  moveChangesOrder,
  moveOutcome,
  orderedSelection,
  pruneSelection,
  selectionAfterClick,
  type ListEntry,
  type ListMoveCommand,
  type ListSelectMode,
  type MoveOutcome,
} from "./model";
import { PointerRowDrag, type PointerDropGuide } from "./pointerDrag";
import { ListDragFeedback } from "./feedback";
import { LiveRegion } from "./ui";

/**
 * Generic drag, multi-selection and keyboard reorder controller for a vertical
 * list. A host supplies the ordered entries, the row selector and one move
 * callback; the controller owns the transient drag state, the drop line, the
 * selection and the live-region announcement.
 *
 * The drag gesture is pointer-based (see `PointerRowDrag`), so it keeps working
 * while the desktop shell owns the operating system's drag-and-drop channel.
 * The controller never writes the project. Every move is one host action, so a
 * list keeps its own checkpoint and undo semantics.
 */

const KEY_COMMANDS: Record<string, ListMoveCommand> = {
  ArrowUp: "up",
  ArrowDown: "down",
  Home: "home",
  End: "end",
};

export interface ListDropPlan {
  insertionIndex: number;
  changesOrder: boolean;
  label: string | null;
  crossDocument: boolean;
}

export interface ListReorderOptions<E extends ListEntry> {
  /** CSS selector for one draggable row. */
  rowSelector: string;
  rowId: (row: HTMLElement) => string | null;
  /** Ordered entries for the list the controller is bound to. */
  entries: () => readonly E[];
  /** False in a read-only session or while a filter hides rows. */
  canReorder: () => boolean;
  /** Enables click selection, range selection and `is-selected` styling. */
  selectable?: boolean;
  /**
   * Applies one move. `changesOrder` is false for a drop that keeps the order,
   * so a host can skip writing a history step.
   */
  onMove: (ids: readonly string[], insertionIndex: number, changesOrder: boolean) => void;
  /** Localized announcement for a keyboard move. */
  announce: (ids: readonly string[], outcome: MoveOutcome) => string;
  /** Host-specific drop plan, for example a cross-document page label. */
  planDrop?: (
    entries: readonly E[],
    ids: ReadonlySet<string>,
    insertionIndex: number,
  ) => { changesOrder: boolean; label: string | null; crossDocument: boolean };
  dropLineClass?: string;
  dropLabelClass?: string;
  announcerClass?: string;
}

export class ListReorderController<E extends ListEntry = ListEntry> {
  private readonly feedback: ListDragFeedback;
  private readonly announcer: LiveRegion;
  private readonly pointer: PointerRowDrag;
  private readonly stepScroll = (): void => this.runScroll();
  private list: HTMLElement | null = null;
  private scroll: HTMLElement | null = null;
  private selection: string[] = [];
  private anchor: string | null = null;
  private dragging: string[] = [];
  private pointerX = 0;
  private pointerY = 0;
  private scrollSpeed = 0;
  private scrollFrame: number | null = null;
  private pendingFocus: string | null = null;

  constructor(private readonly options: ListReorderOptions<E>) {
    this.feedback = new ListDragFeedback({
      lineClass: options.dropLineClass,
      labelClass: options.dropLabelClass,
    });
    this.announcer = new LiveRegion(options.announcerClass);
    this.pointer = new PointerRowDrag({
      rowSelector: options.rowSelector,
      canStart: () => this.options.canReorder(),
      onStart: (row) => this.beginDrag(row),
      onMove: (x, y) => this.dragOver(x, y),
      onDrop: (x, y) => this.drop(x, y),
      onCancel: () => this.clearDragState(),
      feedback: this.feedback,
      heldRows: () => this.movedRows(),
    });
  }

  /** Selected IDs in list order; empty in a list without selection. */
  selectionIds(): string[] {
    return [...this.selection];
  }

  /** Rebinds the drag surface; row listeners are recreated by the panel render. */
  bindList(list: HTMLElement, scroll: HTMLElement): void {
    this.releaseList();
    this.list = list;
    this.scroll = scroll;
    this.pointer.bind(list);
    this.prune();
  }

  /** Applies selection styling to one row. */
  decorate(row: HTMLElement, id: string): void {
    if (!this.options.selectable) return;
    const selected = this.selection.length > 1 && this.selection.includes(id);
    row.classList.toggle("is-selected", selected);
    if (selected) row.setAttribute("aria-pressed", "true");
    else row.removeAttribute("aria-pressed");
  }

  /** Handles a row click and reports whether the host should activate it. */
  handleClick(event: MouseEvent, id: string): boolean {
    if (!this.options.selectable) return true;
    const mode: ListSelectMode = event.shiftKey
      ? "range"
      : event.ctrlKey || event.metaKey
        ? "toggle"
        : "replace";
    const next = selectionAfterClick(this.options.entries(), this.selection, this.anchor, id, mode);
    this.selection = next.ids;
    this.anchor = next.anchor;
    this.applySelection();
    return mode !== "toggle";
  }

  handleKeyDown(event: KeyboardEvent, id: string): void {
    if (!event.altKey || event.ctrlKey || event.metaKey || !this.options.canReorder()) return;
    const command = KEY_COMMANDS[event.key];
    if (!command) return;
    event.preventDefault();
    const entries = this.options.entries();
    const selected = new Set(this.selection.includes(id) ? this.selection : [id]);
    const insertion = keyboardInsertion(entries, selected, command);
    if (insertion === null) return;
    const plan = this.planFor(entries, selected, insertion);
    if (!plan.changesOrder) return;
    const ids = orderedSelection(entries, selected);
    const outcome = moveOutcome(entries, selected, insertion);
    this.selection = ids;
    this.anchor = id;
    this.pendingFocus = id;
    this.options.onMove(ids, insertion, true);
    this.announcer.announce(this.options.announce(ids, outcome));
  }

  /** Restores focus and clears drag chrome after the panel re-rendered. */
  afterRender(): void {
    this.feedback.hide();
    const focus = this.pendingFocus;
    this.pendingFocus = null;
    if (!focus) return;
    for (const row of this.rows()) {
      if (this.options.rowId(row) !== focus) continue;
      row.focus({ preventScroll: true });
      return;
    }
  }

  /** Drops the drag surface when the panel leaves the DOM. */
  detach(): void {
    this.releaseList();
  }

  /** Clears selection and drag state; used when the panel starts over. */
  reset(): void {
    this.clearDragState();
    this.releaseList();
    this.selection = [];
    this.anchor = null;
  }

  /**
   * Shows the insertion line for a file drop and returns the mapped index, or
   * null when the panel has no list. The host maps the index when its visible
   * list is a subset of the underlying order.
   */
  previewExternalDrop(
    clientY: number,
    mapIndex?: (renderedIndex: number, rows: readonly HTMLElement[]) => number,
  ): number | null {
    const list = this.list;
    if (!list) return null;
    const rows = this.rows();
    const spans = rowSpans(rows);
    const renderedIndex = insertionIndexAt(spans, clientY);
    this.feedback.show(list, rows, renderedIndex, null);
    return mapIndex ? mapIndex(renderedIndex, rows) : renderedIndex;
  }

  /** Hides the file-drop line without disturbing an internal row drag. */
  hideExternalDrop(): void {
    if (!this.dragging.length) this.feedback.hide();
  }

  private rows(): HTMLElement[] {
    if (!this.list) return [];
    return [...this.list.querySelectorAll<HTMLElement>(this.options.rowSelector)];
  }

  private applySelection(): void {
    if (!this.options.selectable) return;
    for (const row of this.rows()) {
      const id = this.options.rowId(row);
      if (id) this.decorate(row, id);
    }
  }

  private prune(): void {
    const entries = this.options.entries();
    this.selection = pruneSelection(entries, this.selection);
    if (this.anchor && !entries.some((entry) => entry.id === this.anchor)) this.anchor = null;
  }

  private planFor(
    entries: readonly E[],
    ids: ReadonlySet<string>,
    insertionIndex: number,
  ): ListDropPlan {
    if (this.options.planDrop) {
      return { insertionIndex, ...this.options.planDrop(entries, ids, insertionIndex) };
    }
    return {
      insertionIndex,
      changesOrder: moveChangesOrder(entries, ids, insertionIndex),
      label: null,
      crossDocument: false,
    };
  }

  /**
   * Starts one row drag: an unselected grabbed row becomes the selection, and
   * a grabbed row inside the selection moves the whole block.
   */
  private beginDrag(row: HTMLElement): boolean {
    const id = this.options.rowId(row);
    if (!id || !this.options.canReorder()) return false;
    if (this.options.selectable && !this.selection.includes(id)) {
      this.selection = [id];
      this.anchor = id;
    }
    const entries = this.options.entries();
    this.dragging = this.options.selectable ? dragSet(entries, new Set(this.selection), id) : [id];
    this.applySelection();
    return true;
  }

  /** Rows held by the current drag, so every row that will move is marked. */
  private movedRows(): readonly HTMLElement[] {
    return this.rows().filter((row) => {
      const id = this.options.rowId(row);
      return Boolean(id && this.dragging.includes(id));
    });
  }

  private isInsideList(clientX: number, clientY: number): boolean {
    const list = this.list;
    if (!list) return false;
    const rect = list.getBoundingClientRect();
    return (
      clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    );
  }

  private dragOver(clientX: number, clientY: number): PointerDropGuide | null {
    const plan = this.refreshPlan(clientX, clientY);
    if (!plan) return null;
    return {
      insertionIndex: plan.insertionIndex,
      label: plan.label,
      crossDocument: plan.crossDocument,
    };
  }

  /**
   * Recomputes the drop plan for the pointer. Returning null means the pointer
   * has no insertion point: the line is hidden, but the row stays held.
   */
  private refreshPlan(clientX: number, clientY: number): ListDropPlan | null {
    if (!this.list || !this.dragging.length || !this.options.canReorder()) return null;
    if (!this.isInsideList(clientX, clientY)) {
      // A pointer outside the list has no insertion point, same as leaving a
      // native drag: hide the line and stop scrolling, but keep the drag.
      this.scrollSpeed = 0;
      return null;
    }
    this.pointerX = clientX;
    this.pointerY = clientY;
    const insertionIndex = insertionIndexAt(rowSpans(this.rows()), clientY);
    const plan = this.planFor(this.options.entries(), new Set(this.dragging), insertionIndex);
    this.updateAutoScroll();
    return plan;
  }

  private drop(clientX: number, clientY: number): void {
    const ids = [...this.dragging];
    let plan: ListDropPlan | null = null;
    if (ids.length && this.options.canReorder() && this.isInsideList(clientX, clientY)) {
      plan = this.refreshPlan(clientX, clientY);
    }
    this.clearDragState();
    if (!plan || !ids.length) return;
    this.options.onMove(ids, plan.insertionIndex, plan.changesOrder);
  }

  /** Draws the line for a plan computed outside a pointer move (auto-scroll). */
  private showPlan(plan: ListDropPlan | null): void {
    if (!plan || !this.list) return;
    this.feedback.show(this.list, this.rows(), plan.insertionIndex, plan.label, plan.crossDocument);
  }

  private clearDragState(): void {
    this.dragging = [];
    this.feedback.hide();
    this.feedback.releaseHeld();
    this.scrollSpeed = 0;
  }

  /** Scrolls the list while a dragged row stays near its top or bottom edge. */
  private updateAutoScroll(): void {
    const scroll = this.scroll;
    if (!scroll) return;
    const rect = scroll.getBoundingClientRect();
    const edge = 44;
    const above = rect.top + edge - this.pointerY;
    const below = this.pointerY - (rect.bottom - edge);
    if (above > 0) this.scrollSpeed = -Math.min(18, Math.ceil(above / 2) + 3);
    else if (below > 0) this.scrollSpeed = Math.min(18, Math.ceil(below / 2) + 3);
    else this.scrollSpeed = 0;
    if (
      this.scrollSpeed &&
      this.scrollFrame === null &&
      typeof requestAnimationFrame === "function"
    ) {
      this.scrollFrame = requestAnimationFrame(this.stepScroll);
    }
  }

  private runScroll(): void {
    const scroll = this.scroll;
    if (!scroll || !this.scrollSpeed) {
      this.scrollFrame = null;
      return;
    }
    scroll.scrollTop += this.scrollSpeed;
    this.showPlan(this.refreshPlan(this.pointerX, this.pointerY));
    this.scrollFrame = requestAnimationFrame(this.stepScroll);
  }

  private releaseList(): void {
    this.pointer.detach();
    if (this.scrollFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.scrollFrame);
    }
    this.scrollFrame = null;
    this.scrollSpeed = 0;
    this.feedback.destroy();
    this.list = null;
    this.scroll = null;
  }
}

/** Row spans for the insertion rule; one helper keeps both paths aligned. */
function rowSpans(rows: readonly HTMLElement[]): { top: number; bottom: number }[] {
  return rows.map((row) => {
    const rect = row.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  });
}
