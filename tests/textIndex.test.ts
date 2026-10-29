import { describe, expect, it } from "vitest";
import { searchTextPage, type PageText } from "../src/search/textIndex";

function makePage(words: string[], pageNumber = 1): PageText {
  let text = "";
  const entries = words.map((word, index) => {
    const start = text.length ? text.length + 1 : 0;
    if (text) text += " ";
    text += word;
    return {
      text: word,
      start,
      end: text.length,
      rect: { x: index * 30, y: 20, width: 26, height: 10 },
    };
  });
  return { page: pageNumber, text, words: entries };
}

describe("PDF text search", () => {
  it("finds case-insensitive single words and returns their rectangles", () => {
    const hits = searchTextPage(makePage(["Warehouse", "floor", "A-101"]), "warehouse");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ page: 1, text: "Warehouse" });
    expect(hits[0].rects).toEqual([{ x: 0, y: 20, width: 26, height: 10 }]);
    expect(Math.floor(hits[0].bounds.min.x)).toBe(0);
  });

  it("finds phrases spanning text items and highlights every covered word", () => {
    const hits = searchTextPage(
      makePage(["Mechanical", "room", "ventilation"]),
      "room ventilation",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].snippet).toContain("Mechanical room ventilation");
    expect(hits[0].rects).toHaveLength(2);
  });

  it("returns every occurrence on a page with a readable snippet", () => {
    const hits = searchTextPage(makePage(["Door", "Door", "Window"]), "door");
    expect(hits).toHaveLength(2);
    expect(hits[0].start).toBe(0);
    expect(hits[1].start).toBeGreaterThan(0);
  });

  it("ignores very short queries and missing text", () => {
    expect(searchTextPage(makePage(["A", "B"]), "a")).toEqual([]);
    expect(searchTextPage(makePage(["Warehouse"]), "missing")).toEqual([]);
  });

  it("keeps page numbers on hits", () => {
    const hits = searchTextPage(makePage(["Exit", "sign"], 4), "exit");
    expect(hits[0].page).toBe(4);
  });
});
