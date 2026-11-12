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
import { DropIndicator, LiveRegion } from "./ui";

/**
 * Generic drag, multi-selection and keyboard reorder controller for a vertical
 * list. A host supplies the ordered entries, the row selector, the drag MIME
 * marker and one move callback; the controller owns the transient drag state,
 * the drop line, the selection and the live-region announcement.
 *
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
  /** `dataTransfer` type that marks an internal list drag. */
  dragMime: string;
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
  private readonly indicator: DropIndicator;
  private readonly announcer: LiveRegion;
  private readonly onDragOver = (event: DragEvent): void => this.handleDragOver(event);
  private readonly onDragLeave = (event: DragEvent): void => this.handleDragLeave(event);
  private readonly onDrop = (event: DragEvent): void => this.handleDrop(event);
  private readonly stepScroll = (): void => this.runScroll();
  private list: HTMLElement | null = null;
  private scroll: HTMLElement | null = null;
  private selection: string[] = [];
  private anchor: string | null = null;
  private dragging: string[] = [];
  private plan: ListDropPlan | null = null;
  private pointerY = 0;
  private scrollSpeed = 0;
  private scrollFrame: number | null = null;
  private pendingFocus: string | null = null;

  constructor(private readonly options: ListReorderOptions<E>) {
    this.indicator = new DropIndicator({
      lineClass: options.dropLineClass,
      labelClass: options.dropLabelClass,
    });
    this.announcer = new LiveRegion(options.announcerClass);
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
    list.addEventListener("dragover", this.onDragOver);
    list.addEventListener("dragleave", this.onDragLeave);
    list.addEventListener("drop", this.onDrop);
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

  handleDragStart(event: DragEvent, id: string, row: HTMLElement): void {
    if (!this.options.canReorder()) {
      event.preventDefault();
      return;
    }
    if (this.options.selectable && !this.selection.includes(id)) {
      this.selection = [id];
      this.anchor = id;
    }
    const entries = this.options.entries();
    this.dragging = this.options.selectable ? dragSet(entries, new Set(this.selection), id) : [id];
    this.applySelection();
    row.classList.add("is-dragging");
    for (const other of this.rows()) {
      const otherId = this.options.rowId(other);
      if (other !== row && otherId && this.dragging.includes(otherId)) {
        other.classList.add("is-dragging");
      }
    }
    // The text payload and the custom type are the internal drag markers. An
    // operating-system file drop only carries `Files`, so the two gestures stay
    // apart even when they land on the same panel.
    event.dataTransfer?.setData("text/plain", this.dragging.join("\n"));
    event.dataTransfer?.setData(this.options.dragMime, this.dragging.join("\n"));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  handleDragEnd(): void {
    this.clearDragState();
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
    this.indicator.hide();
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
    const spans = rows.map((row) => {
      const rect = row.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    const renderedIndex = insertionIndexAt(spans, clientY);
    this.indicator.show(list, rows, renderedIndex, null);
    return mapIndex ? mapIndex(renderedIndex, rows) : renderedIndex;
  }

  /** Hides the file-drop line without disturbing an internal row drag. */
  hideExternalDrop(): void {
    if (!this.dragging.length) this.indicator.hide();
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

  private refreshPlan(): void {
    if (!this.list || !this.dragging.length) return;
    const rows = this.rows();
    const spans = rows.map((row) => {
      const rect = row.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    const insertionIndex = insertionIndexAt(spans, this.pointerY);
    const entries = this.options.entries();
    const plan = this.planFor(entries, new Set(this.dragging), insertionIndex);
    this.plan = plan;
    this.indicator.show(this.list, rows, insertionIndex, plan.label, plan.crossDocument);
  }

  private handleDragOver(event: DragEvent): void {
    if (this.isFileDrag(event)) return;
    if (!this.dragging.length || !this.options.canReorder()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    this.pointerY = event.clientY;
    this.refreshPlan();
    this.updateAutoScroll();
  }

  private handleDragLeave(event: DragEvent): void {
    if (!this.list) return;
    const rect = this.list.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (inside) return;
    this.indicator.hide();
    this.scrollSpeed = 0;
  }

  private handleDrop(event: DragEvent): void {
    if (this.isFileDrag(event)) return;
    event.preventDefault();
    const plan = this.plan;
    const ids = [...this.dragging];
    this.clearDragState();
    if (!plan || !ids.length || !this.options.canReorder()) return;
    this.options.onMove(ids, plan.insertionIndex, plan.changesOrder);
  }

  private isFileDrag(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  private clearDragState(): void {
    this.dragging = [];
    this.plan = null;
    this.indicator.hide();
    this.scrollSpeed = 0;
    for (const row of this.rows()) row.classList.remove("is-dragging");
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
    this.refreshPlan();
    this.scrollFrame = requestAnimationFrame(this.stepScroll);
  }

  private releaseList(): void {
    if (this.list) {
      this.list.removeEventListener("dragover", this.onDragOver);
      this.list.removeEventListener("dragleave", this.onDragLeave);
      this.list.removeEventListener("drop", this.onDrop);
    }
    if (this.scrollFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.scrollFrame);
    }
    this.scrollFrame = null;
    this.scrollSpeed = 0;
    this.indicator.destroy();
    this.list = null;
    this.scroll = null;
  }
}
