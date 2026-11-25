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
  /** Whole-page level builds, in order. */
  levelBuilds: number[];
  controller: CanvasRasterController;
}

function harness(
  initial: Partial<Harness["state"]> = {},
  options: { levels?: boolean; pageSize?: PageSize } = {},
): Harness {
  const page = options.pageSize ?? PAGE;
  const state = { page: 1, zoom: 1, panX: 0, panY: 0, dpr: 1, gesture: false, ...initial };
  const renders: Raster[] = [];
  const levelBuilds: number[] = [];
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
    renderPageLevel: vi.fn(async (pageNumber: number, scale: number) => {
      levelBuilds.push(pageNumber);
      return {
        canvas: { width: Math.round(page.width * scale), height: Math.round(page.height * scale) },
        scale,
      } as unknown as HTMLCanvasElement;
    }),
    contentKey: "doc-test",
  } as unknown as PdfRenderer;
  const host: CanvasRasterHost = {
    renderer: () => renderer,
    pageSize: () => page,
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
  const controller = new CanvasRasterController(host, {
    tiled: false,
    levels: options.levels !== false,
  });
  return { state, renders, levelBuilds, controller };
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
  // The level build resolves on a promise chain, not a timer.
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
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
    const { state, renders, controller } = harness({ panX: -500, panY: -400 }, { levels: false });
    await flush(controller);
    state.panX = -2000;
    await flush(controller);
    expect(renders).toHaveLength(2);
    controller.dispose();
  });

  it("renders again when the zoom changes even though the crop still covers", async () => {
    const { state, renders, controller } = harness({ panX: -500, panY: -400 }, { levels: false });
    await flush(controller);
    state.zoom = 1.5;
    await flush(controller);
    expect(renders).toHaveLength(2);
    controller.dispose();
  });

  it("renders again on another page", async () => {
    const { state, renders, controller } = harness({ panX: -500, panY: -400 }, { levels: false });
    await flush(controller);
    state.page = 2;
    await flush(controller);
    expect(renders).toHaveLength(2);
    expect(renders[1].page).toBe(2);
    controller.dispose();
  });

  it("skips a pan while the fit view already shows the whole page", async () => {
    // The whole 2000 × 1500 page inside an 800 × 600 viewport at 0.3.
    const { state, renders, controller } = harness(
      { zoom: 0.3, panX: 100, panY: 75 },
      { levels: false },
    );
    await flush(controller);
    expect(renders).toHaveLength(1);
    state.panX = 140;
    await flush(controller);
    expect(renders).toHaveLength(1);
    controller.dispose();
  });

  it("clears the cover on reset", async () => {
    const { renders, controller } = harness({ panX: -500, panY: -400 }, { levels: false });
    await flush(controller);
    controller.reset();
    await flush(controller);
    expect(renders).toHaveLength(2);
    controller.dispose();
  });
});

describe("CanvasRasterController display levels", () => {
  it("builds one whole-page level after the first sharp render", async () => {
    const { renders, levelBuilds, controller } = harness({ panX: -500, panY: -400 });
    await flush(controller);
    expect(renders).toHaveLength(1);
    expect(levelBuilds).toEqual([1]);
    expect(controller.levelStats()).toMatchObject({ builds: 1, levels: 1 });
    controller.dispose();
  });

  it("does not build a level while the pointer gesture is running", async () => {
    const { state, levelBuilds, controller } = harness({ panX: -500, panY: -400, gesture: true });
    await flush(controller);
    expect(levelBuilds).toEqual([]);
    state.gesture = false;
    await flush(controller);
    expect(levelBuilds.length).toBeGreaterThan(0);
    controller.dispose();
  });

  it("uses the level instead of a crop render after a pan past the margin", async () => {
    const { state, renders, controller } = harness({ panX: -500, panY: -400 });
    await flush(controller);
    expect(renders).toHaveLength(1);
    state.panX = -2000;
    await flush(controller);
    expect(renders).toHaveLength(1);
    expect(controller.underlay()).not.toBeNull();
    expect(controller.levelStats()?.hits).toBeGreaterThan(0);
    controller.dispose();
  });

  it("renders a new octave once and then serves a return from the level", async () => {
    const { state, renders, controller } = harness({ panX: -500, panY: -400 });
    await flush(controller);
    expect(renders).toHaveLength(1);

    state.zoom = 4;
    await flush(controller);
    expect(renders).toHaveLength(2);

    state.zoom = 1;
    await flush(controller);
    expect(renders).toHaveLength(2);
    expect(controller.underlay()).not.toBeNull();
    controller.dispose();
  });

  it("never builds a level whose page cannot fit the level caps", async () => {
    // 20 000 x 14 000 pt exceeds the 8192 px dimension cap at scale 1.
    const { state, renders, levelBuilds, controller } = harness(
      { panX: -500, panY: -400 },
      { pageSize: { width: 20000, height: 14000 } },
    );
    await flush(controller);
    expect(levelBuilds).toEqual([]);
    state.panX = -9000;
    await flush(controller);
    expect(renders.length).toBeGreaterThan(1);
    expect(controller.levelStats()?.levels).toBe(0);
    controller.dispose();
  });

  it("keeps levels across a reset so a page return is still free", async () => {
    const { state, renders, controller } = harness({ panX: -500, panY: -400 });
    await flush(controller);
    expect(renders).toHaveLength(1);
    controller.reset();
    expect(controller.current).toBeNull();
    state.panX = -1500;
    await flush(controller);
    expect(renders).toHaveLength(1);
    controller.dispose();
  });

  it("fills a gesture from the level and renders once on release", async () => {
    // 0.7 is inside octave 0 but is not the octave's own scale, so the level is
    // a stand-in during the gesture and the exact crop lands on release.
    const { state, renders, controller } = harness({ zoom: 0.7, panX: -500, panY: -400 });
    await flush(controller);
    const afterFirst = renders.length;
    state.gesture = true;
    // Pan towards the page edge so the crop no longer covers the view.
    state.panX = 0;
    await flush(controller);
    expect(renders.length).toBe(afterFirst);
    state.gesture = false;
    await flush(controller);
    expect(renders.length).toBe(afterFirst + 1);
    controller.dispose();
  });

  it("reports no underlay while an exact raster covers the view", async () => {
    const { controller } = harness({ panX: -500, panY: -400 });
    await flush(controller);
    expect(controller.underlay()).toBeNull();
    controller.dispose();
  });
});
