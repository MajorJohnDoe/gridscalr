// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasRasterController, type CanvasRasterHost } from "../src/canvas/raster";
import type { PageSize } from "../src/model/types";
import type { PdfRenderer, RenderResult } from "../src/pdf/pdfRenderer";

const PAGE: PageSize = { width: 2000, height: 1500 };
const VIEWPORT = { width: 800, height: 600 };
/** The coarse backdrop pass runs at 45 % of the exact scale. */
const COARSE_SCALE = 0.45;

interface Raster {
  page: number;
  rect: { x: number; y: number; width: number; height: number };
  scale: number;
}

interface Harness {
  state: {
    page: number;
    zoom: number;
    panX: number;
    panY: number;
    dpr: number;
    gesture: boolean;
  };
  renders: Raster[];
  controller: CanvasRasterController;
}

function harness(initial: Partial<Harness["state"]> = {}): Harness {
  const state = { page: 1, zoom: 1, panX: 0, panY: 0, dpr: 1, gesture: false, ...initial };
  const renders: Raster[] = [];
  const renderer = {
    renderCrop: vi.fn(
      async (page: number, rect: RenderResult["rect"], scale: number): Promise<RenderResult> => {
        // The coarse backdrop pass is not a view render; keep it out of the count.
        const coarse = Math.abs(scale - state.zoom * state.dpr * COARSE_SCALE) < 1e-9;
        if (!coarse) renders.push({ page, rect: { ...rect }, scale });
        return {
          pageNumber: page,
          rect: { ...rect },
          canvas: {} as HTMLCanvasElement,
          renderScale: scale,
        };
      },
    ),
  } as unknown as PdfRenderer;
  const host: CanvasRasterHost = {
    renderer: () => renderer,
    pageSize: () => PAGE,
    page: () => state.page,
    pageId: () => `page_${state.page}`,
    zoom: () => state.zoom,
    panX: () => state.panX,
    panY: () => state.panY,
    dpr: () => state.dpr,
    width: () => VIEWPORT.width,
    height: () => VIEWPORT.height,
    bounds: () => VIEWPORT as DOMRect,
    loading: () => document.createElement("div"),
    drawBase: () => undefined,
    gestureActive: () => state.gesture,
    onError: (error) => {
      throw error;
    },
  };
  const controller = new CanvasRasterController(host, { tiled: false });
  return { state, renders, controller };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Schedules and lets the pending timer and the render promise settle. */
async function flush(controller: CanvasRasterController): Promise<void> {
  controller.schedule();
  await vi.advanceTimersByTimeAsync(1000);
}

describe("CanvasRasterController cover check", () => {
  it("renders once and then skips every pan step inside the crop", async () => {
    // A view over the middle of the page, so the crop has its full margin.
    const { state, renders, controller } = harness({ panX: -500, panY: -400 });
    await flush(controller);
    expect(renders).toHaveLength(1);
    const crop = renders[0].rect;
    expect(crop.width).toBe(VIEWPORT.width + 600);
    expect(crop.height).toBe(VIEWPORT.height + 600);

    for (let step = 1; step <= 10; step += 1) {
      state.panX = -500 - step * 20;
      state.panY = -400 - step * 10;
      await flush(controller);
    }
    expect(renders).toHaveLength(1);
    controller.dispose();
  });

  it("renders again after a pan past the crop margin", async () => {
    const { state, renders, controller } = harness({ panX: -500, panY: -400 });
    await flush(controller);
    state.panX = -2000;
    await flush(controller);
    expect(renders).toHaveLength(2);
    controller.dispose();
  });

  it("renders again when the zoom changes even though the crop still covers", async () => {
    const { state, renders, controller } = harness({ panX: -500, panY: -400 });
    await flush(controller);
    state.zoom = 1.5;
    await flush(controller);
    expect(renders).toHaveLength(2);
    controller.dispose();
  });

  it("renders again on another page", async () => {
    const { state, renders, controller } = harness({ panX: -500, panY: -400 });
    await flush(controller);
    state.page = 2;
    await flush(controller);
    expect(renders).toHaveLength(2);
    expect(renders[1].page).toBe(2);
    controller.dispose();
  });

  it("skips a pan while the fit view already shows the whole page", async () => {
    // The whole 2000 × 1500 page inside an 800 × 600 viewport at 0.3.
    const { state, renders, controller } = harness({ zoom: 0.3, panX: 100, panY: 75 });
    await flush(controller);
    expect(renders).toHaveLength(1);
    state.panX = 140;
    await flush(controller);
    expect(renders).toHaveLength(1);
    controller.dispose();
  });

  it("clears the cover on reset", async () => {
    const { renders, controller } = harness({ panX: -500, panY: -400 });
    await flush(controller);
    controller.reset();
    await flush(controller);
    expect(renders).toHaveLength(2);
    controller.dispose();
  });
});
