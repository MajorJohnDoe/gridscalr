import type { CanvasView } from "../canvas/CanvasView";

export interface SplitViewOptions {
  area: HTMLElement;
  referenceHost: HTMLElement;
  resizer: HTMLElement;
  primary: CanvasView;
  reference: CanvasView;
  minPaneWidth?: number;
}

/**
 * Owns the split-view chrome only. Both canvases read the same viewport; the
 * reference pane supplies a centred copy through CanvasViewOptions.view.
 */
export class SplitView {
  private open = false;
  private width: number | null = null;
  private readonly minPaneWidth: number;

  constructor(private readonly options: SplitViewOptions) {
    this.minPaneWidth = options.minPaneWidth ?? 260;
    options.resizer.addEventListener("pointerdown", this.onResizerDown);
    options.resizer.addEventListener("keydown", this.onResizerKey);
    options.referenceHost.addEventListener("wheel", this.onReferenceWheel, { passive: false });
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.options.referenceHost.classList.toggle("hidden", !open);
    this.options.resizer.classList.toggle("hidden", !open);
    if (open) {
      this.applyWidth(this.width ?? Math.max(this.minPaneWidth, this.areaWidth() / 2));
      requestAnimationFrame(() => {
        if (!this.open) return;
        this.options.reference.resize();
        this.options.reference.invalidate();
      });
    } else {
      this.options.reference.invalidate();
    }
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  destroy(): void {
    this.options.resizer.removeEventListener("pointerdown", this.onResizerDown);
    this.options.resizer.removeEventListener("keydown", this.onResizerKey);
    this.options.referenceHost.removeEventListener("wheel", this.onReferenceWheel);
  }

  private areaWidth(): number {
    return this.options.area.getBoundingClientRect().width;
  }

  private applyWidth(width: number): void {
    const max = Math.max(this.minPaneWidth, this.areaWidth() - this.minPaneWidth);
    this.width = Math.max(this.minPaneWidth, Math.min(max, width));
    this.options.area.style.setProperty("--reference-width", `${Math.round(this.width)}px`);
  }

  private onResizerDown = (event: PointerEvent): void => {
    if (!this.open || event.button !== 0) return;
    event.preventDefault();
    const handle = this.options.resizer;
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("is-dragging");
    const onMove = (move: PointerEvent) => {
      this.applyWidth(this.options.area.getBoundingClientRect().right - move.clientX);
      this.options.reference.invalidate();
    };
    const onUp = () => {
      handle.classList.remove("is-dragging");
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      this.options.reference.invalidate();
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  };

  private onResizerKey = (event: KeyboardEvent): void => {
    if (!this.open || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const current = this.options.referenceHost.getBoundingClientRect().width;
    this.applyWidth(current + (event.key === "ArrowLeft" ? 24 : -24));
    this.options.reference.invalidate();
  };

  private onReferenceWheel = (event: WheelEvent): void => {
    if (!this.open) return;
    event.preventDefault();
    const bounds = this.options.referenceHost.getBoundingClientRect();
    const page = this.options.reference.screenToPage({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    const primaryPoint = this.options.primary.pageToScreen(page);
    this.options.primary.zoomAtScreen(primaryPoint, event.deltaY < 0 ? 1.15 : 1 / 1.15);
  };
}
