import type { GestureKind } from "./controller";

/** One edge of a view gesture: the pan or wheel stream began or ended. */
export interface ViewGestureEvent {
  phase: "begin" | "end";
  kind: GestureKind;
}

export type ViewGestureListener = (event: ViewGestureEvent) => void;

/**
 * A one-to-many view-gesture signal.
 *
 * The editable canvas publishes the begin and end of each view gesture. A
 * read-only follower (the split reference pane) subscribes and drives its own
 * `GestureRenderController` from the same edges, so both panes reuse a raster
 * for the gesture without the primary reaching into the follower's canvas.
 */
export class ViewGestureSignal {
  private readonly listeners = new Set<ViewGestureListener>();

  subscribe(listener: ViewGestureListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: ViewGestureEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}
