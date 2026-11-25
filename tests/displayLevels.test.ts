import { describe, expect, it } from "vitest";
import {
  DisplayLevelController,
  LEVEL_MAX_DIMENSION,
  LEVEL_MAX_PIXELS,
  levelByteSize,
  levelIndexFor,
  levelIsSharpEnough,
  levelKey,
  levelPixels,
  levelScaleFor,
  selectLevelEvictions,
  type DisplayLevel,
  type LevelPageSize,
  type LevelRequest,
} from "../src/features/displayLevels";

const PAGE: LevelPageSize = { width: 2000, height: 1500 };

function request(scale: number, page = 1, pageId = "page_1"): LevelRequest {
  return { contentKey: "doc-a", pageId, page, pageSize: PAGE, scale };
}

/** A fake whole-page raster with the size the level would really have. */
function fakeLevel(scale: number): { canvas: HTMLCanvasElement; scale: number } {
  const pixels = levelPixels(PAGE, scale);
  return {
    canvas: { width: pixels.width, height: pixels.height } as HTMLCanvasElement,
    scale: pixels.scale,
  };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
}

describe("levelIndexFor", () => {
  it("picks the smallest octave that reaches the requested scale", () => {
    expect(levelIndexFor(0.29)).toBe(-1);
    expect(levelIndexFor(0.5)).toBe(-1);
    expect(levelIndexFor(1)).toBe(0);
    expect(levelIndexFor(1.2)).toBe(1);
    expect(levelIndexFor(2)).toBe(1);
    expect(levelIndexFor(4)).toBe(2);
  });

  it("never leaves the integer octaves", () => {
    expect(levelIndexFor(0)).toBe(0);
    expect(levelIndexFor(Number.NaN)).toBe(0);
    expect(levelScaleFor(levelIndexFor(0.3))).toBeGreaterThanOrEqual(0.3);
  });
});

describe("levelPixels", () => {
  it("renders the whole page at the octave scale when it fits", () => {
    expect(levelPixels(PAGE, 1)).toEqual({ scale: 1, width: 2000, height: 1500 });
    expect(levelPixels(PAGE, 0.5)).toEqual({ scale: 0.5, width: 1000, height: 750 });
  });

  it("caps a level by its pixel budget, not by the page's page size", () => {
    const huge = { width: 10000, height: 7000 };
    const pixels = levelPixels(huge, 2);
    expect(pixels.width * pixels.height).toBeLessThanOrEqual(LEVEL_MAX_PIXELS);
    expect(pixels.scale).toBeLessThan(2);
  });

  it("caps a long thin page by the maximum canvas dimension", () => {
    const long = { width: 20000, height: 400 };
    const pixels = levelPixels(long, 1);
    expect(Math.max(pixels.width, pixels.height)).toBeLessThanOrEqual(LEVEL_MAX_DIMENSION);
  });
});

describe("levelIsSharpEnough", () => {
  it("accepts a level at or above the requested scale", () => {
    expect(levelIsSharpEnough(1, 0.5)).toBe(true);
    expect(levelIsSharpEnough(1, 1)).toBe(true);
    expect(levelIsSharpEnough(1.93, 2)).toBe(false);
  });
});

describe("levelKey", () => {
  it("covers the document set, the page and the octave", () => {
    expect(levelKey("doc-a", "page_1", 1, 0)).not.toBe(levelKey("doc-b", "page_1", 1, 0));
    expect(levelKey("doc-a", "page_1", 1, 0)).not.toBe(levelKey("doc-a", "page_1", 1, 1));
    expect(levelKey("doc-a", "page_1", 1, 0)).not.toBe(levelKey("doc-a", "page_2", 2, 0));
  });
});

describe("selectLevelEvictions", () => {
  const entries = [
    { key: "a", bytes: 60, lastUsed: 1 },
    { key: "b", bytes: 60, lastUsed: 3 },
    { key: "c", bytes: 60, lastUsed: 2 },
  ];

  it("evicts nothing inside the budget", () => {
    expect(selectLevelEvictions(entries, 500, new Set())).toEqual([]);
  });

  it("evicts least recently used first until the budget fits", () => {
    expect(selectLevelEvictions(entries, 120, new Set())).toEqual(["a"]);
    expect(selectLevelEvictions(entries, 100, new Set())).toEqual(["a", "c"]);
  });

  it("never evicts the level the current view is drawing", () => {
    expect(selectLevelEvictions(entries, 60, new Set(["a", "c"]))).toEqual(["b"]);
  });
});

describe("DisplayLevelController", () => {
  it("reports a miss, builds once and then serves the level", async () => {
    const calls: number[] = [];
    const levels = new DisplayLevelController({
      renderPageLevel: async (pageNumber, scale) => {
        calls.push(pageNumber);
        return fakeLevel(scale);
      },
    });
    expect(levels.ensure(request(1), { build: true })).toBeNull();
    expect(levels.ensure(request(1), { build: true })).toBeNull();
    await settle();
    expect(calls).toEqual([1]);
    const level = levels.ensure(request(1), { build: true });
    expect(level).not.toBeNull();
    expect(level?.scale).toBe(1);
    expect(levels.stats()).toMatchObject({ levels: 1, builds: 1, hits: 1, misses: 2 });
    expect(levels.stats().bytes).toBe(levelByteSize(2000, 1500));
  });

  it("does not start a build unless asked, so a gesture never renders a page", async () => {
    let calls = 0;
    const levels = new DisplayLevelController({
      renderPageLevel: async (_page, scale) => {
        calls += 1;
        return fakeLevel(scale);
      },
    });
    expect(levels.ensure(request(1), { build: false })).toBeNull();
    await settle();
    expect(calls).toBe(0);
    expect(levels.stats().misses).toBe(1);
  });

  it("keeps one level per page and octave", async () => {
    const seen: string[] = [];
    const levels = new DisplayLevelController(
      {
        renderPageLevel: async (_page, scale) => {
          seen.push(String(scale));
          return fakeLevel(scale);
        },
      },
      { onLevel: (level: DisplayLevel) => seen.push(level.key) },
    );
    levels.ensure(request(1), { build: true });
    levels.ensure(request(2), { build: true });
    levels.ensure(request(1, 2, "page_2"), { build: true });
    await settle();
    expect(levels.stats().builds).toBe(3);
    expect(levels.stats().levels).toBe(3);
    expect(levels.peek(request(1))?.index).toBe(0);
    expect(levels.peek(request(2))?.index).toBe(1);
    expect(levels.peek(request(1, 2, "page_2"))?.index).toBe(0);
  });

  it("evicts the least recently used level when the budget is exceeded", async () => {
    const levels = new DisplayLevelController(
      { renderPageLevel: async (_page, scale) => fakeLevel(scale) },
      // One level-2 entry fits; it and the level-1 entry together do not.
      { budget: levelByteSize(4000, 3000) },
    );
    levels.ensure(request(1), { build: true });
    await settle();
    expect(levels.peek(request(1))).not.toBeNull();
    levels.ensure(request(2), { build: true });
    await settle();
    expect(levels.stats().levels).toBe(1);
    expect(levels.peek(request(1))).toBeNull();
    expect(levels.peek(request(2))).not.toBeNull();
    expect(levels.stats().bytes).toBeLessThanOrEqual(levels.stats().budgetBytes);
  });

  it("drops a build that finishes after a clear", async () => {
    const gate: { release: (() => void) | null } = { release: null };
    const levels = new DisplayLevelController({
      renderPageLevel: (_page, scale) =>
        new Promise((resolve) => {
          gate.release = () => resolve(fakeLevel(scale));
        }),
    });
    levels.ensure(request(1), { build: true });
    await settle();
    levels.clear();
    gate.release?.();
    await settle();
    expect(levels.stats().levels).toBe(0);
    expect(levels.stats().builds).toBe(0);
    expect(levels.peek(request(1))).toBeNull();
  });

  it("survives a failed build without caching anything", async () => {
    const levels = new DisplayLevelController({
      renderPageLevel: async () => {
        throw new Error("render failed");
      },
    });
    levels.ensure(request(1), { build: true });
    await settle();
    expect(levels.stats()).toMatchObject({ levels: 0, builds: 0 });
    expect(levels.peek(request(1))).toBeNull();
  });
});
