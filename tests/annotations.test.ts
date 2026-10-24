import { describe, expect, it } from "vitest";
import {
  calloutLayout,
  cloudLabelLayout,
  deltaLayout,
  stampLayout,
  textBoxLayout,
} from "../src/model/annotations";
import { DEFAULT_STAMP_PRESETS, normalizeStampPresets } from "../src/model/stamps";
import type { MarkupItem } from "../src/model/types";

const base: MarkupItem = {
  id: "item",
  page: 1,
  kind: "stamp",
  points: [{ x: 100, y: 100 }],
  color: "#35c2a1",
  strokeWidth: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("annotation layouts", () => {
  it("sizes text panels from their content", () => {
    const short = textBoxLayout("A", 12);
    const long = textBoxLayout("FOR INFORMATION", 12);
    expect(short.width).toBeGreaterThan(0);
    expect(long.width).toBeGreaterThan(short.width);
  });

  it("centres a stamp on its placement point", () => {
    const layout = stampLayout({ ...base, text: "APPROVED", fontSize: 12 });
    expect(layout.center).toEqual({ x: 100, y: 100 });
    expect(layout.lines).toEqual(["APPROVED"]);
  });

  it("places the callout box around its second point and the leader on the box edge", () => {
    const layout = calloutLayout({
      ...base,
      kind: "callout",
      points: [{ x: 200, y: 200 }, { x: 100, y: 100 }],
      text: "Check valve",
    });
    expect(layout.center).toEqual({ x: 100, y: 100 });
    expect(layout.leaderStart.x).toBeLessThanOrEqual(layout.box.x + layout.box.width);
    expect(layout.leaderStart.x).toBeGreaterThanOrEqual(layout.box.x);
  });

  it("places cloud text above the cloud by default and supports an offset", () => {
    const cloud: MarkupItem = {
      ...base,
      kind: "cloud",
      points: [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      text: "Revision",
      fontSize: 10,
    };
    const auto = cloudLabelLayout(cloud);
    expect(auto?.center.y).toBeLessThan(50);
    const offset = cloudLabelLayout({ ...cloud, textOffset: { x: 20, y: 30 } });
    expect(offset?.center).toEqual({ x: 70, y: 105 });
    expect(cloudLabelLayout({ ...cloud, text: "" })).toBeNull();
  });

  it("keeps revision deltas square", () => {
    const layout = deltaLayout({ ...base, kind: "delta", fontSize: 14 });
    expect(layout.size).toBeGreaterThan(12);
  });
});

describe("stamp presets", () => {
  it("normalizes, deduplicates, and trims custom presets", () => {
    expect(normalizeStampPresets(["  GODKÄND  ", "GODKÄND", "", 3, "EJ GODKÄND"])).toEqual([
      "GODKÄND",
      "EJ GODKÄND",
    ]);
  });

  it("falls back to the English defaults for old projects", () => {
    expect(normalizeStampPresets(undefined)).toEqual([...DEFAULT_STAMP_PRESETS]);
  });
});
