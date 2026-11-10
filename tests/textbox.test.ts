import { describe, expect, it } from "vitest";
import { pageIdFor, withTestPageIds } from "./helpers/pages";
import { createProject, defaultDocument } from "../src/model/layers";
import { parseProject, serializeProject } from "../src/io/projectFile";
import { wrapText } from "../src/model/text";
import type { MarkupItem } from "../src/model/types";

const measure = (line: string) => line.length * 5;

describe("text box wrapping", () => {
  it("wraps words to the available width", () => {
    expect(wrapText("one two three four", 35, measure)).toEqual(["one two", "three", "four"]);
    expect(wrapText("one two three four", 50, measure)).toEqual(["one two", "three four"]);
  });

  it("preserves explicit line breaks and blank lines", () => {
    expect(wrapText("one\n\ntwo", 100, measure)).toEqual(["one", "", "two"]);
  });

  it("keeps a word that is wider than the box on its own line", () => {
    expect(wrapText("abcdefghij klm", 15, measure)).toEqual(["abcdefghij", "klm"]);
  });

  it("returns one empty line for empty text", () => {
    expect(wrapText("", 100, measure)).toEqual([""]);
  });
});

describe("text box persistence", () => {
  it("round-trips text box fields and geometry", () => {
    const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
    const layer = project.layers.find((entry) => entry.kind === "draw")!;
    const now = "2026-11-04T00:00:00.000Z";
    const item: MarkupItem = {
      id: "item_textbox",
      pageId: pageIdFor(1),
      kind: "textbox",
      points: [
        { x: 10, y: 10 },
        { x: 110, y: 60 },
      ],
      color: "#1a2024",
      strokeWidth: 1,
      text: "Wrapped text",
      textColor: "#1a2024",
      textBackground: "white",
      padding: 6,
      fontSize: 12,
      textBold: true,
      textUnderline: true,
      textAlign: "center",
      createdAt: now,
      updatedAt: now,
    };
    layer.items.push(item);

    const parsed = parseProject(serializeProject(project));
    const found = parsed.layers
      .flatMap((entry) => entry.items)
      .find((entry) => entry.id === item.id)!;
    expect(found).toMatchObject({
      kind: "textbox",
      text: "Wrapped text",
      textColor: "#1a2024",
      textBackground: "white",
      padding: 6,
      textBold: true,
      textUnderline: true,
      textAlign: "center",
    });
    expect(found.points).toHaveLength(2);
  });

  it("drops a text box without two corners", () => {
    const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
    const layer = project.layers.find((entry) => entry.kind === "draw")!;
    const now = "2026-11-04T00:00:00.000Z";
    layer.items.push({
      id: "item_broken",
      pageId: pageIdFor(1),
      kind: "textbox",
      points: [{ x: 10, y: 10 }],
      color: "#1a2024",
      strokeWidth: 1,
      createdAt: now,
      updatedAt: now,
    });

    const parsed = parseProject(serializeProject(project));
    expect(
      parsed.layers.flatMap((entry) => entry.items).some((entry) => entry.id === "item_broken"),
    ).toBe(false);
  });
});
