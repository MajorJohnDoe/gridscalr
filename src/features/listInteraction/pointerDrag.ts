/**
 * Pointer-based row drag shared by the Pages, Layers and takeoff builder lists.
 *
 * HTML5 `dragstart`/`drop` is not a dependable gesture in the desktop shell:
 * on Windows the shell installs its own OLE drop target on the WebView2 window
 * while native drag handling is on, so the page never receives its own HTML5
 * drag events. A primary mouse or pen press that moves past a threshold is
 * therefore turned into a drag here, using pointer events only. Touch pointers
 * are left alone, so a finger still scrolls a list instead of moving a row.
 *
 * The helper owns the gesture, never the meaning: the host decides which row is
 * grabbed, what the current pointer position means and whether a drop applies.
 */

export interface PointerRowDragOptions {
  /** CSS selector for one draggable row. */
  rowSelector: string;
  /** Restricts the press to one descendant of the row, for a grip handle. */
  handleSelector?: string;
  /** Descendants that keep their own press behaviour. */
  ignoreSelector?: string;
  /** Movement in CSS pixels before a press becomes a drag. */
  threshold?: number;
  /** False in a read-only session or while a filter hides rows. */
  canStart: () => boolean;
  /** Begins a drag of the pressed row; false cancels it. */
  onStart: (row: HTMLElement) => boolean;
  /** Reports the pointer position while a row is held. */
  onMove: (clientX: number, clientY: number, row: HTMLElement) => void;
  /** Applies the drop at the released position. */
  onDrop: (clientX: number, clientY: number, row: HTMLElement) => void;
  /** Clears the drag without applying it. */
  onCancel: () => void;
}

/** Row controls that keep their own click, key and colour-picker behaviour. */
const DEFAULT_IGNORE =
  "button, input, select, textarea, a, [contenteditable='true'], [role='button']";

interface PendingPress {
  row: HTMLElement;
  x: number;
  y: number;
}

export class PointerRowDrag {
  private container: HTMLElement | null = null;
  private pending: PendingPress | null = null;
  private row: HTMLElement | null = null;
  private clickGuard: (() => void) | null = null;
  private guardTimer: number | null = null;

  constructor(private readonly options: PointerRowDragOptions) {}

  /** Binds the press surface; row listeners are recreated by a panel render. */
  bind(container: HTMLElement): void {
    this.detach();
    this.container = container;
    container.addEventListener("pointerdown", this.onPointerDown);
  }

  detach(): void {
    this.container?.removeEventListener("pointerdown", this.onPointerDown);
    this.container = null;
    this.cancel();
    this.releaseClickGuard();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || event.isPrimary === false) return;
    // A missing pointerType (older engines, jsdom) is a plain mouse press.
    const pointerType = event.pointerType || "mouse";
    if (pointerType !== "mouse" && pointerType !== "pen") return;
    const container = this.container;
    const target = event.target as HTMLElement | null;
    if (!container || !target) return;
    const row = target.closest<HTMLElement>(this.options.rowSelector);
    if (!row || !container.contains(row)) return;
    if (!this.pressAllowed(target, row)) return;
    if (!this.options.canStart()) return;
    this.releaseClickGuard();
    this.pending = { row, x: event.clientX, y: event.clientY };
    this.listen();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const pending = this.pending;
    if (!pending) return;
    if (!this.row) {
      const threshold = this.options.threshold ?? 4;
      const distance = Math.hypot(event.clientX - pending.x, event.clientY - pending.y);
      if (distance < threshold) return;
      this.pending = null;
      this.row = pending.row;
      if (!this.options.onStart(pending.row)) {
        this.cancel();
        return;
      }
    }
    // The row is held: a text selection or a second gesture must not start.
    event.preventDefault();
    this.options.onMove(event.clientX, event.clientY, this.row);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const row = this.row;
    const started = Boolean(row);
    this.pending = null;
    this.row = null;
    this.unlisten();
    if (!row) return;
    // The press becomes the next click unless it is swallowed first.
    if (started) this.guardClick();
    this.options.onDrop(event.clientX, event.clientY, row);
  };

  private readonly onPointerCancel = (): void => {
    this.cancel();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    this.cancel();
  };

  /**
   * A drag must not also activate the grabbed row. The click that follows a
   * release is captured once; a release outside the window has no click, so the
   * guard also expires on the next task.
   */
  private guardClick(): void {
    this.releaseClickGuard();
    const guard = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      this.releaseClickGuard();
    };
    this.clickGuard = () => window.removeEventListener("click", guard, true);
    window.addEventListener("click", guard, true);
    this.guardTimer = window.setTimeout(() => this.releaseClickGuard(), 0);
  }

  private releaseClickGuard(): void {
    this.clickGuard?.();
    this.clickGuard = null;
    if (this.guardTimer !== null) window.clearTimeout(this.guardTimer);
    this.guardTimer = null;
  }

  private pressAllowed(target: HTMLElement, row: HTMLElement): boolean {
    const handleSelector = this.options.handleSelector;
    if (handleSelector) {
      const handle = target.closest<HTMLElement>(handleSelector);
      return Boolean(handle && row.contains(handle));
    }
    const control = target.closest<HTMLElement>(this.options.ignoreSelector ?? DEFAULT_IGNORE);
    if (!control || control === row) return true;
    return !row.contains(control);
  }

  private cancel(): void {
    const started = Boolean(this.row);
    this.pending = null;
    this.row = null;
    this.unlisten();
    if (started) this.options.onCancel();
  }

  private listen(): void {
    window.addEventListener("pointermove", this.onPointerMove, true);
    window.addEventListener("pointerup", this.onPointerUp, true);
    window.addEventListener("pointercancel", this.onPointerCancel, true);
    // A release in another window must not leave a row held until the next
    // click, which would otherwise apply a stale drop.
    window.addEventListener("blur", this.onPointerCancel);
    window.addEventListener("keydown", this.onKeyDown);
  }

  private unlisten(): void {
    window.removeEventListener("pointermove", this.onPointerMove, true);
    window.removeEventListener("pointerup", this.onPointerUp, true);
    window.removeEventListener("pointercancel", this.onPointerCancel, true);
    window.removeEventListener("blur", this.onPointerCancel);
    window.removeEventListener("keydown", this.onKeyDown);
  }
}
