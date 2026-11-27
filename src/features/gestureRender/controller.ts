import { GESTURE_SETTLE_MS, movedFar, refreshDue, settleDelay, type SettleClock } from "./model";
import { ViewGestureSignal, type ViewGestureEvent } from "./signal";

/** The zoom and pan of one viewport, in CSS pixels. */
export interface GestureViewport {
  zoom: number;
  panX: number;
  panY: number;
}

/** Placement of a raster captured at one viewport, painted at another. */
export interface RasterTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * A page point `p` sits on screen at `p * zoom + pan`, so a raster captured at
 * `from` maps onto `to` with one uniform scale and one translation.
 */
export function rasterTransform(from: GestureViewport, to: GestureViewport): RasterTransform {
  const valid = from.zoom > 0 && Number.isFinite(from.zoom) && Number.isFinite(to.zoom);
  const scale = valid ? to.zoom / from.zoom : 1;
  return {
    scale,
    offsetX: to.panX - from.panX * scale,
    offsetY: to.panY - from.panY * scale,
  };
}

/** A pointer pan ends at pointerup; a wheel stream ends after the idle window. */
export type GestureKind = "pointer" | "wheel";

export interface GestureRenderHost {
  /** The content canvas whose pixels are captured and repainted. */
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  dpr(): number;
  viewport(): GestureViewport;
  /** Real content redraw for the viewport that is current when the gesture settles. */
  onSettle(): void;
}

/**
 * Reuses the previous content raster during a pan or zoom.
 *
 * The canvas paints the captured raster with the gesture transform on every
 * frame, so the item layer costs one blit instead of a full redraw. The base
 * viewport is latched when the gesture begins and the pixels are captured on
 * the first frame, so repeated frames never compound the transform. When the
 * gesture settles the raster is dropped and the host draws the items for real,
 * which is the pixel-identical output the canvas shows at rest.
 */
export class GestureRenderController {
  private raster: HTMLCanvasElement | null = null;
  /** Reused capture buffer; a new canvas per refresh churned megabytes. */
  private buffer: HTMLCanvasElement | null = null;
  /** Viewport the captured pixels were drawn at; latched at gesture start. */
  private baseView: GestureViewport | null = null;
  private active = false;
  private painted = false;
  private timer: number | null = null;
  /** Cumulative frames painted from the captured raster; used by the probe. */
  private paintedFrames = 0;
  /** When the last real content redraw happened inside this gesture. */
  private refreshedAt = 0;
  /** Set while the caller draws the items for real after a refresh. */
  private rearm = false;
  private readonly clock: SettleClock = { lastInputAt: 0, idleMs: GESTURE_SETTLE_MS };
  /** Published on every begin/end edge; a read-only follower subscribes. */
  readonly signal = new ViewGestureSignal();
  private readonly unsubscribeFollow: (() => void) | null;

  constructor(
    private readonly host: GestureRenderHost,
    options: { follow?: ViewGestureSignal } = {},
  ) {
    this.unsubscribeFollow =
      options.follow?.subscribe((event: ViewGestureEvent) => {
        if (event.phase === "begin") this.begin(event.kind);
        else this.end(event.kind);
      }) ?? null;
  }

  begin(kind: GestureKind): void {
    this.signal.publish({ phase: "begin", kind });
    this.clearTimer();
    const now = performance.now();
    if (!this.active) {
      // The caller views the updated viewport by the time the first frame draws,
      // but the content canvas still shows the viewport the gesture started from.
      this.baseView = { ...this.host.viewport() };
      this.refreshedAt = now;
    } else if (refreshDue(now, this.refreshedAt)) {
      // A long stream still needs real pixels, so settle once and start a new
      // capture from the redrawn canvas instead of blitting for seconds.
      this.settle();
      this.active = true;
      this.baseView = { ...this.host.viewport() };
      this.refreshedAt = now;
    }
    this.active = true;
    if (kind === "wheel") this.clock.lastInputAt = now;
  }

  end(kind: GestureKind): void {
    this.signal.publish({ phase: "end", kind });
    if (!this.active) return;
    if (kind === "pointer") {
      this.settle();
      return;
    }
    this.clock.lastInputAt = performance.now();
    this.schedule();
  }

  /** True while a pan or wheel gesture is still running. */
  get isActive(): boolean {
    return this.active;
  }

  /** Cumulative frames painted from the captured raster (probe/diagnostics). */
  get framesPainted(): number {
    return this.paintedFrames;
  }

  /**
   * Paints the captured raster with the gesture transform. Returns false when
   * the caller must draw the items for real instead.
   */
  paint(): boolean {
    if (!this.active) {
      this.dropRaster();
      return false;
    }
    if (this.needsRefresh()) {
      // Too stale to keep: let this frame draw the items for real and re-arm
      // the capture from that drawing in `afterRedraw`.
      this.clearTimer();
      this.active = false;
      this.rearm = true;
      this.dropRaster();
      return false;
    }
    if (this.raster && !this.fitsCanvas()) {
      // The canvas was resized mid-gesture, so the raster no longer describes
      // it. Drop reuse and let this frame draw the items for real.
      this.active = false;
      this.dropRaster();
      return false;
    }
    if (!this.raster && !this.capture()) {
      this.active = false;
      return false;
    }
    if (!this.raster || !this.baseView) return false;
    this.paintRaster(this.raster, this.baseView);
    this.painted = true;
    this.paintedFrames += 1;
    return true;
  }

  /**
   * Called by the host after it drew the items for real while a gesture is in
   * flight, so the next frame captures the fresh content instead of the old one.
   */
  afterRedraw(): void {
    if (!this.rearm) return;
    this.rearm = false;
    this.active = true;
    this.baseView = { ...this.host.viewport() };
    this.refreshedAt = performance.now();
  }

  /** Ends any gesture and drops the raster; the next frame draws for real. */
  dispose(): void {
    this.unsubscribeFollow?.();
    this.clearTimer();
    this.active = false;
    this.dropRaster();
  }

  /** Time or distance since the last real redraw made the capture stale. */
  private needsRefresh(): boolean {
    if (!this.painted) return false;
    if (refreshDue(performance.now(), this.refreshedAt)) return true;
    if (!this.baseView) return false;
    const width = this.host.canvas.width / Math.max(1, this.host.dpr());
    const height = this.host.canvas.height / Math.max(1, this.host.dpr());
    return movedFar(this.baseView, this.host.viewport(), width, height);
  }

  private paintRaster(raster: HTMLCanvasElement, from: GestureViewport): void {
    const { scale, offsetX, offsetY } = rasterTransform(from, this.host.viewport());
    const { canvas, context } = this.host;
    const dpr = this.host.dpr();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.save();
    context.translate(offsetX, offsetY);
    context.scale(scale, scale);
    context.drawImage(raster, 0, 0, canvas.width / dpr, canvas.height / dpr);
    context.restore();
  }

  private capture(): boolean {
    const { canvas } = this.host;
    if (canvas.width < 1 || canvas.height < 1) return false;
    if (!this.buffer) this.buffer = document.createElement("canvas");
    const raster = this.buffer;
    if (raster.width !== canvas.width || raster.height !== canvas.height) {
      raster.width = canvas.width;
      raster.height = canvas.height;
    } else {
      raster.getContext("2d")?.clearRect(0, 0, raster.width, raster.height);
    }
    const context = raster.getContext("2d");
    if (!context) return false;
    context.drawImage(canvas, 0, 0);
    this.raster = raster;
    return true;
  }

  private fitsCanvas(): boolean {
    const { canvas } = this.host;
    return (
      !!this.raster && this.raster.width === canvas.width && this.raster.height === canvas.height
    );
  }

  private settle(): void {
    this.clearTimer();
    this.active = false;
    this.rearm = false;
    this.refreshedAt = performance.now();
    const painted = this.painted;
    this.painted = false;
    this.dropRaster();
    if (painted) this.host.onSettle();
  }

  private schedule(): void {
    this.clearTimer();
    const wait = settleDelay(performance.now(), this.clock);
    this.timer = window.setTimeout(
      () => {
        this.timer = null;
        if (settleDelay(performance.now(), this.clock) > 0) {
          this.schedule();
          return;
        }
        this.settle();
      },
      Math.max(1, Math.ceil(wait)),
    );
  }

  private dropRaster(): void {
    this.raster = null;
    this.baseView = null;
    this.painted = false;
  }

  private clearTimer(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }
}
