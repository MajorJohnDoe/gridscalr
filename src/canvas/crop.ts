import {
  normalizeCropRect,
  pageRectFromCrop,
  type NormalizedCrop,
  type PageRect,
} from "../model/export";
import { TEXT_FONT_STACK } from "../model/text";
import type { PageSize, Point } from "../model/types";
import { toast } from "../ui/toast";
import {
  clampPointToPage,
  cursorForRole,
  hexAlpha,
  movePageRect,
  pointInRect,
  rectFromPoints,
  resizePageRect,
  roundRect,
  type BoxHandleRole,
} from "./geometry";

const ACCENT = "#35c2a1";
const FONT_STACK = TEXT_FONT_STACK;

interface CropDrag {
  mode: "new" | "move" | "resize";
  start: Point;
  startRect: PageRect | null;
  handle?: BoxHandleRole;
  pointerId: number;
}

interface CropMode {
  rect: PageRect | null;
  drag: CropDrag | null;
  hover: BoxHandleRole | "move" | null;
  resolve: (crop: NormalizedCrop | null) => void;
}

export interface CropHost {
  host: HTMLElement;
  pageSize(): PageSize | undefined;
  toPage(screen: Point): Point;
  toScreen(page: Point): Point;
  width(): number;
  height(): number;
  prepare(): void;
  updateCursor(): void;
  drawInteraction(): void;
  capturePointer(pointerId: number): void;
}

/**
 * One-shot export crop mode. The controller owns the crop rectangle, pointer
 * state, floating toolbar and overlay drawing; the canvas keeps viewport and
 * rendering responsibilities.
 */
export class CropController {
  private mode: CropMode | null = null;
  private ui: HTMLElement | null = null;

  constructor(private readonly host: CropHost) {}

  get active(): boolean {
    return this.mode !== null;
  }

  pick(initial?: NormalizedCrop): Promise<NormalizedCrop | null> {
    this.finish(null);
    this.host.prepare();
    const size = this.host.pageSize();
    if (!size) return Promise.resolve(null);
    const rect = initial ? pageRectFromCrop(initial, size) : null;
    return new Promise<NormalizedCrop | null>((resolve) => {
      this.mode = { rect, drag: null, hover: null, resolve };
      this.showUi();
      this.host.updateCursor();
      this.host.drawInteraction();
      toast("Draw the export area. Drag the handles to adjust. Enter uses it, Esc cancels.", "info");
    });
  }

  confirm(): boolean {
    const mode = this.mode;
    if (!mode) return false;
    const size = this.host.pageSize();
    if (!size || !mode.rect || mode.rect.width < 1 || mode.rect.height < 1) {
      toast("Draw an export area first.", "warning");
      return false;
    }
    const crop = normalizeCropRect(mode.rect, size);
    if (!crop) {
      toast("The export area is too small.", "warning");
      return false;
    }
    this.finish(crop);
    return true;
  }

  cancel(): void {
    this.finish(null);
  }

  cursor(): string | null {
    const mode = this.mode;
    if (!mode) return null;
    const drag = mode.drag;
    if (drag?.mode === "move") return "move";
    if (drag?.handle) return cursorForRole(drag.handle);
    if (drag?.mode === "new") return "crosshair";
    if (mode.hover === "move") return "move";
    if (mode.hover) return cursorForRole(mode.hover);
    return "crosshair";
  }

  pointerDown(page: Point, event: PointerEvent): void {
    const mode = this.mode;
    const size = this.host.pageSize();
    if (!mode || !size) return;
    const point = clampPointToPage(page, size);
    const screen = this.host.toScreen(page);
    if (mode.rect) {
      const handle = this.handleAt(mode.rect, screen);
      if (handle) {
        mode.drag = {
          mode: "resize",
          start: point,
          startRect: { ...mode.rect },
          handle,
          pointerId: event.pointerId,
        };
        this.host.capturePointer(event.pointerId);
        mode.hover = handle;
        this.host.updateCursor();
        this.host.drawInteraction();
        return;
      }
      if (pointInRect(point, mode.rect)) {
        mode.drag = {
          mode: "move",
          start: point,
          startRect: { ...mode.rect },
          pointerId: event.pointerId,
        };
        this.host.capturePointer(event.pointerId);
        mode.hover = "move";
        this.host.updateCursor();
        this.host.drawInteraction();
        return;
      }
    }
    mode.rect = { x: point.x, y: point.y, width: 0, height: 0 };
    mode.drag = {
      mode: "new",
      start: point,
      startRect: null,
      pointerId: event.pointerId,
    };
    mode.hover = null;
    this.host.capturePointer(event.pointerId);
    this.host.updateCursor();
    this.host.drawInteraction();
  }

  pointerMove(page: Point): void {
    const mode = this.mode;
    const size = this.host.pageSize();
    if (!mode || !size) return;
    if (!mode.drag) {
      mode.hover = mode.rect ? this.hoverAt(mode.rect, this.host.toScreen(page)) : null;
      this.host.updateCursor();
      this.host.drawInteraction();
      return;
    }
    const point = clampPointToPage(page, size);
    if (mode.drag.mode === "new") {
      mode.rect = rectFromPoints(mode.drag.start, point);
    } else if (mode.drag.startRect) {
      mode.rect =
        mode.drag.mode === "move"
          ? movePageRect(mode.drag.startRect, mode.drag.start, point, size)
          : resizePageRect(mode.drag.startRect, mode.drag.handle, point, size);
    }
    this.host.drawInteraction();
  }

  pointerUp(): void {
    const mode = this.mode;
    if (!mode) return;
    const drag = mode.drag;
    mode.drag = null;
    mode.hover = null;
    if (drag?.mode === "new" && mode.rect && (mode.rect.width < 1 || mode.rect.height < 1)) {
      mode.rect = null;
    }
    this.host.updateCursor();
    this.host.drawInteraction();
  }

  pointerLeave(): void {
    const mode = this.mode;
    if (!mode || mode.drag) return;
    mode.hover = null;
    this.host.updateCursor();
    this.host.drawInteraction();
  }

  draw(ctx: CanvasRenderingContext2D): boolean {
    const mode = this.mode;
    const size = this.host.pageSize();
    if (!mode || !size) return false;
    const pageTopLeft = this.host.toScreen({ x: 0, y: 0 });
    const pageBottomRight = this.host.toScreen({ x: size.width, y: size.height });
    const pageRect = {
      x: pageTopLeft.x,
      y: pageTopLeft.y,
      width: pageBottomRight.x - pageTopLeft.x,
      height: pageBottomRight.y - pageTopLeft.y,
    };

    if (!mode.rect) {
      ctx.save();
      ctx.strokeStyle = hexAlpha(ACCENT, 0.55);
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(pageRect.x + 0.5, pageRect.y + 0.5, pageRect.width, pageRect.height);
      ctx.restore();
      return true;
    }

    const start = this.host.toScreen({ x: mode.rect.x, y: mode.rect.y });
    const end = this.host.toScreen({
      x: mode.rect.x + mode.rect.width,
      y: mode.rect.y + mode.rect.height,
    });
    const crop = {
      x: start.x,
      y: start.y,
      width: end.x - start.x,
      height: end.y - start.y,
    };

    ctx.save();
    ctx.fillStyle = "rgba(4, 8, 10, 0.58)";
    const top = Math.max(pageRect.y, 0);
    const bottom = Math.min(pageRect.y + pageRect.height, this.host.height());
    const left = Math.max(pageRect.x, 0);
    const right = Math.min(pageRect.x + pageRect.width, this.host.width());
    ctx.fillRect(left, top, right - left, Math.max(0, crop.y - top));
    ctx.fillRect(
      left,
      crop.y + crop.height,
      right - left,
      Math.max(0, bottom - (crop.y + crop.height)),
    );
    ctx.fillRect(left, crop.y, Math.max(0, crop.x - left), crop.height);
    ctx.fillRect(
      crop.x + crop.width,
      crop.y,
      Math.max(0, right - (crop.x + crop.width)),
      crop.height,
    );

    ctx.fillStyle = "rgba(53, 194, 161, 0.08)";
    ctx.fillRect(crop.x, crop.y, crop.width, crop.height);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(crop.x + 0.75, crop.y + 0.75, crop.width, crop.height);
    ctx.setLineDash([]);

    ctx.fillStyle = "#101619";
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    for (const [, point] of this.handlePoints(mode.rect)) {
      const screen = this.host.toScreen(point);
      ctx.fillRect(screen.x - 4, screen.y - 4, 8, 8);
      ctx.strokeRect(screen.x - 4, screen.y - 4, 8, 8);
    }

    const widthPercent = Math.round((mode.rect.width / size.width) * 100);
    const heightPercent = Math.round((mode.rect.height / size.height) * 100);
    const label = `Export area · ${widthPercent}% × ${heightPercent}%`;
    ctx.font = `600 10px ${FONT_STACK}`;
    const labelWidth = ctx.measureText(label).width + 12;
    const labelX = Math.max(8, Math.min(this.host.width() - labelWidth - 8, crop.x));
    const labelY = Math.max(8, crop.y - 26);
    ctx.fillStyle = "rgba(12,16,18,0.92)";
    ctx.strokeStyle = hexAlpha(ACCENT, 0.65);
    ctx.lineWidth = 1;
    roundRect(ctx, labelX, labelY, labelWidth, 18, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#edf3f5";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, labelX + 6, labelY + 9);
    ctx.restore();
    return true;
  }

  destroy(): void {
    this.mode = null;
    this.hideUi();
  }

  private finish(crop: NormalizedCrop | null): void {
    const mode = this.mode;
    if (!mode) return;
    this.mode = null;
    this.hideUi();
    this.host.updateCursor();
    this.host.drawInteraction();
    mode.resolve(crop);
  }

  private showUi(): void {
    this.hideUi();
    const bar = document.createElement("div");
    bar.className = "canvas-crop-bar";
    bar.dataset.cropUi = "true";

    const hint = document.createElement("span");
    hint.className = "canvas-crop-hint";
    hint.textContent = "Drag to select the export area";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-small btn-ghost";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => this.cancel());

    const use = document.createElement("button");
    use.type = "button";
    use.className = "btn btn-small btn-primary";
    use.textContent = "Use area";
    use.addEventListener("click", () => this.confirm());

    bar.append(hint, cancel, use);
    this.host.host.append(bar);
    this.ui = bar;
  }

  private hideUi(): void {
    this.ui?.remove();
    this.ui = null;
  }

  private handleAt(rect: PageRect, screen: Point): BoxHandleRole | null {
    const tolerance = 10;
    for (const [role, point] of this.handlePoints(rect)) {
      const target = this.host.toScreen(point);
      if (Math.hypot(target.x - screen.x, target.y - screen.y) <= tolerance) return role;
    }
    return null;
  }

  private hoverAt(rect: PageRect, screen: Point): BoxHandleRole | "move" | null {
    const handle = this.handleAt(rect, screen);
    if (handle) return handle;
    return pointInRect(this.host.toPage(screen), rect) ? "move" : null;
  }

  private handlePoints(rect: PageRect): Array<[BoxHandleRole, Point]> {
    const left = rect.x;
    const top = rect.y;
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    const midX = (left + right) / 2;
    const midY = (top + bottom) / 2;
    return [
      ["nw", { x: left, y: top }],
      ["n", { x: midX, y: top }],
      ["ne", { x: right, y: top }],
      ["e", { x: right, y: midY }],
      ["se", { x: right, y: bottom }],
      ["s", { x: midX, y: bottom }],
      ["sw", { x: left, y: bottom }],
      ["w", { x: left, y: midY }],
    ];
  }
}
