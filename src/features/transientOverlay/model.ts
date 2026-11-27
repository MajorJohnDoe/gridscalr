/**
 * Pure stacking rules for transient surfaces: tool flyouts, menus and
 * popovers. Nothing here touches the DOM, the store or the catalogs, so the
 * order can be tested without rendering a surface.
 *
 * The dialog stack owns the window band from `DIALOG_Z_BASE`. A transient
 * surface opened above a dialog takes the next value of this separate counter,
 * so one manager can route Escape to exactly the topmost transient no matter
 * which class name its root uses.
 */

/** First z-index of the transient band; above the dialog and toast bands. */
export const TRANSIENT_Z_BASE = 3100;

/**
 * Monotonic order of open transient surfaces. Every register or raise takes the
 * next value, so the newest or most recently used surface is on top and Escape
 * always targets exactly one of them.
 */
export class TransientStack {
  private levels = new Map<string, number>();
  private counter = 0;

  open(id: string): number {
    return this.raise(id);
  }

  raise(id: string): number {
    this.counter += 1;
    const level = TRANSIENT_Z_BASE + this.counter;
    this.levels.set(id, level);
    return level;
  }

  close(id: string): void {
    this.levels.delete(id);
  }

  level(id: string): number {
    return this.levels.get(id) ?? 0;
  }

  get size(): number {
    return this.levels.size;
  }

  top(): string | null {
    let top: string | null = null;
    let highest = -Infinity;
    for (const [id, level] of this.levels) {
      if (level > highest) {
        highest = level;
        top = id;
      }
    }
    return top;
  }

  /** Open ids from bottom to top. */
  ids(): string[] {
    return [...this.levels.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  }

  clear(): void {
    this.levels.clear();
  }
}
