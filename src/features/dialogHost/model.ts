/**
 * Pure dialog-window rules: stacking order, viewport clamping and target
 * revalidation. Nothing here touches the DOM, the store or the catalogs, so the
 * window model can be tested without rendering a dialog.
 */

export interface DialogAction {
  label: string;
  value: string;
  primary?: boolean;
  danger?: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Gap between a floating dialog and the viewport edge. */
export const DIALOG_MARGIN = 8;

/** First z-index of the dialog window band; the canvas stays below it. */
export const DIALOG_Z_BASE = 2000;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Clamps a dialog's top-left corner so the whole window stays inside the
 * viewport. A window larger than the viewport keeps its top-left at the margin,
 * which keeps the draggable header reachable.
 */
export function clampDialogPosition(
  position: Point,
  size: Size,
  viewport: Size,
  margin = DIALOG_MARGIN,
): Point {
  const maxX = Math.max(margin, viewport.width - size.width - margin);
  const maxY = Math.max(margin, viewport.height - size.height - margin);
  return {
    x: clamp(position.x, margin, maxX),
    y: clamp(position.y, margin, maxY),
  };
}

/**
 * Stacking order of open dialogs. Every open or raised dialog takes the next
 * value of a monotonically increasing counter, so the order is deterministic:
 * the newest or most recently focused dialog is on top, and Escape always
 * targets exactly one of them.
 */
export class DialogStack {
  private levels = new Map<string, number>();
  private counter = 0;

  open(id: string): number {
    return this.raise(id);
  }

  raise(id: string): number {
    this.counter += 1;
    const level = DIALOG_Z_BASE + this.counter;
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

export type TargetKind =
  | "item"
  | "layer"
  | "page"
  | "category"
  | "countType"
  | "schedule"
  | "space"
  | "field"
  | "backup"
  | "conflictedCopy"
  | "document";

/**
 * A destructive confirmation names the object it will act on and remembers its
 * stable identity. `resolve` re-reads that identity when the user confirms, so
 * a selection change, a deleted item or a page switch behind the dialog cannot
 * let the action land on another object.
 */
export interface DialogTarget {
  kind: TargetKind;
  id: string;
  /** Localized object name shown in the refusal explanation. */
  name: string;
  /** Returns the target's current identity, or null when it is gone. */
  resolve: () => string | null | Promise<string | null>;
}

export type TargetProblem = "missing" | "changed";

/** A target whose identity can be re-read synchronously, for inline confirms. */
export type ResolvedTarget = Omit<DialogTarget, "resolve"> & {
  resolve: () => string | null;
};

/** The single comparison rule: same stable id, another object, or gone. */
export function targetProblem(id: string, current: string | null): TargetProblem | null {
  if (current === null) return "missing";
  if (current !== id) return "changed";
  return null;
}

/** Returns the problem, or null when the target is still the same object. */
export async function checkDialogTarget(target: DialogTarget): Promise<TargetProblem | null> {
  const current = await target.resolve();
  if (current === null || current === undefined) return "missing";
  return targetProblem(target.id, current);
}

/**
 * Joins several stable ids into one identity string, so a bulk confirmation
 * uses the same single rule as a single-object confirmation.
 */
export function targetIdentity(ids: readonly string[]): string {
  return ids.join("\u0000");
}
