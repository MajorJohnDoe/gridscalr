import { describe, expect, it } from "vitest";
import { normalizeItem } from "../src/io/projectFile/items";
import { canonicalColor, normalizeColor } from "../src/model/color";
import { resolveItemColor } from "../src/model/layers";

describe("colour normalization", () => {
  it("canonicalizes accepted project colours", () => {
    expect(canonicalColor("#FFF")).toBe("#ffffff");
    expect(canonicalColor("#F2A93B")).toBe("#f2a93b");
    expect(canonicalColor("#ff000080")).toBe("#ff0000");
    expect(canonicalColor("#f008")).toBe("#ff0000");
    expect(canonicalColor("rgba(255, 0, 0, 0.5)")).toBe("#ff0000");
    expect(canonicalColor("rgb(0 128 255)")).toBe("#0080ff");
  });

  it("rejects non-colour values without producing black", () => {
    expect(canonicalColor("not-a-colour")).toBeNull();
    expect(canonicalColor("")).toBeNull();
    expect(normalizeColor("not-a-colour", "#123456")).toBe("#123456");
    expect(normalizeColor(undefined, "also invalid")).toBe("#f2a93b");
  });

  it("falls back to the item or measurement default", () => {
    expect(resolveItemColor({ kind: "text", color: "" })).toBe("#f2a93b");
    expect(resolveItemColor({ kind: "length", color: "" })).toBe("#f70808");
    expect(resolveItemColor({ kind: "cloud", color: "#abc" })).toBe("#aabbcc");
  });

  it("repairs invalid item colours on load", () => {
    const item = normalizeItem(
      {
        kind: "cloud",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        color: "",
        fillColor: "#f26d6d",
        textColor: "rgba(255, 0, 0, 1)",
      },
      "draw",
      "#f70808",
      new Set(),
      "category",
      new Set(),
      new Set(),
    );
    expect(item?.color).toBe("#f70808");
    expect(item?.fillColor).toBe("#f26d6d");
    expect(item?.textColor).toBe("#ff0000");
  });
});
