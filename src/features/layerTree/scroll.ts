/**
 * Edge autoscroll for a dragged list row.
 *
 * The Layers panel scrolls its own dock body, so a layer can be dragged into a
 * group that is currently out of view. The helper keeps one animation frame at a
 * time and stops as soon as the pointer leaves the edge band.
 */
export class ListAutoScroll {
  private frame: number | null = null;
  private speed = 0;

  constructor(private readonly edge = 44) {}

  update(scroll: HTMLElement | null, clientY: number): void {
    if (!scroll) return;
    const rect = scroll.getBoundingClientRect();
    const above = rect.top + this.edge - clientY;
    const below = clientY - (rect.bottom - this.edge);
    if (above > 0) this.speed = -Math.min(18, Math.ceil(above / 2) + 3);
    else if (below > 0) this.speed = Math.min(18, Math.ceil(below / 2) + 3);
    else this.speed = 0;
    if (this.speed) this.schedule(scroll);
  }

  stop(): void {
    this.speed = 0;
    if (this.frame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.frame);
    }
    this.frame = null;
  }

  private schedule(scroll: HTMLElement): void {
    if (this.frame !== null || typeof requestAnimationFrame !== "function") return;
    const step = (): void => {
      this.frame = null;
      if (!this.speed) return;
      scroll.scrollTop += this.speed;
      this.schedule(scroll);
    };
    this.frame = requestAnimationFrame(step);
  }
}
