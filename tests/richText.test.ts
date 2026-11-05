import { describe, expect, it } from "vitest";
import {
  applyRunStyle,
  layoutRichText,
  reconcileRuns,
  runsEqual,
  runsFromItem,
  runsHaveFormatting,
  textRunDefaults,
  type ResolvedTextRun,
} from "../src/model/richText";
import { createProject, defaultDocument } from "../src/model/layers";
import { parseProject, serializeProject } from "../src/io/projectFile";
import type { MarkupItem, TextRun } from "../src/model/types";

const defaults = {
  fontSize: 12,
  color: "#1a2024",
  bold: false,
  italic: false,
  underline: false,
};

const measure = (text: string, run: ResolvedTextRun) =>
  text.length * 5 * (run.bold ? 1.1 : 1) * (run.size / 12);

describe("rich text layout", () => {
  it("wraps styled runs without losing their formatting", () => {
    const runs: TextRun[] = [{ text: "one two " }, { text: "three four", bold: true }];
    const layout = layoutRichText(runs, 55, measure, defaults);
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.lines.flatMap((line) => line.segments).some((segment) => segment.run.bold)).toBe(
      true,
    );
    expect(
      layout.lines
        .map((line) => line.segments.map((segment) => segment.text).join(""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    ).toBe("one two three four");
  });

  it("preserves explicit line breaks and per-run sizes", () => {
    const runs: TextRun[] = [{ text: "Title\n" }, { text: "Body", size: 18, color: "#ff0000" }];
    const layout = layoutRichText(runs, 200, measure, defaults);
    expect(layout.lines).toHaveLength(2);
    expect(layout.lines[1].segments[0].run.size).toBe(18);
    expect(layout.lines[1].segments[0].run.color).toBe("#ff0000");
    expect(layout.fontSize).toBe(18);
  });

  it("returns one blank line for empty runs", () => {
    const layout = layoutRichText([{ text: "" }], 100, measure, defaults);
    expect(layout.lines).toHaveLength(1);
    expect(layout.lines[0].segments).toHaveLength(0);
  });
});

describe("run formatting", () => {
  it("splits a selection and leaves the rest untouched", () => {
    const runs = applyRunStyle([{ text: "hello world" }], 0, 5, { bold: true });
    expect(runs).toEqual([{ text: "hello", bold: true }, { text: " world" }]);
    expect(runsEqual(runs, [{ text: "hello", bold: true }, { text: " world" }])).toBe(true);
  });

  it("applies size and colour to an inner range across existing runs", () => {
    const runs = applyRunStyle([{ text: "ab", bold: true }, { text: "cd" }], 1, 3, {
      size: 20,
      color: "#00ff00",
    });
    expect(runs.map((run) => run.text).join("")).toBe("abcd");
    const covered = runs.filter((run) => run.size === 20);
    expect(covered.map((run) => run.text).join("")).toBe("bc");
    expect(covered.every((run) => run.color === "#00ff00")).toBe(true);
  });

  it("falls back to plain text when the text changed", () => {
    const runs = reconcileRuns([{ text: "old", bold: true }], "new text");
    expect(runs).toEqual([{ text: "new text" }]);
  });

  it("detects formatting that differs from the box style", () => {
    const item: MarkupItem = {
      id: "item",
      page: 1,
      kind: "textbox",
      points: [],
      color: "#1a2024",
      strokeWidth: 1,
      text: "plain bold",
      fontSize: 12,
      textColor: "#1a2024",
      createdAt: "",
      updatedAt: "",
    };
    expect(runsHaveFormatting([{ text: "plain bold" }], item)).toBe(false);
    expect(runsHaveFormatting([{ text: "plain " }, { text: "bold", bold: true }], item)).toBe(true);
    expect(textRunDefaults(item).fontSize).toBe(12);
  });

  it("uses one plain run for boxes without runs", () => {
    const item: MarkupItem = {
      id: "item",
      page: 1,
      kind: "textbox",
      points: [],
      color: "#1a2024",
      strokeWidth: 1,
      text: "Legacy",
      textBold: true,
      createdAt: "",
      updatedAt: "",
    };
    expect(runsFromItem(item)).toEqual([
      {
        text: "Legacy",
        bold: true,
        italic: undefined,
        underline: undefined,
        size: undefined,
        color: undefined,
      },
    ]);
  });
});

describe("rich text persistence", () => {
  it("round-trips runs and the plain-text fallback", () => {
    const project = createProject(defaultDocument("Plan.pdf", 1));
    const layer = project.layers.find((entry) => entry.kind === "draw")!;
    const now = "2026-11-04T00:00:00.000Z";
    layer.items.push({
      id: "item_rich",
      page: 1,
      kind: "textbox",
      points: [
        { x: 10, y: 10 },
        { x: 120, y: 60 },
      ],
      color: "#1a2024",
      strokeWidth: 1,
      text: "Bold world",
      textColor: "#1a2024",
      fontSize: 12,
      runs: [
        { text: "Bold", bold: true, size: 18, color: "#e30613" },
        { text: " world", italic: true, underline: true },
      ],
      createdAt: now,
      updatedAt: now,
    });

    const parsed = parseProject(serializeProject(project));
    const found = parsed.layers
      .flatMap((entry) => entry.items)
      .find((entry) => entry.id === "item_rich")!;
    expect(found.text).toBe("Bold world");
    expect(found.runs).toEqual([
      {
        text: "Bold",
        bold: true,
        italic: undefined,
        underline: undefined,
        size: 18,
        color: "#e30613",
      },
      {
        text: " world",
        bold: undefined,
        italic: true,
        underline: true,
        size: undefined,
        color: undefined,
      },
    ]);
  });

  it("drops malformed run entries without breaking the text", () => {
    const project = createProject(defaultDocument("Plan.pdf", 1));
    const raw = JSON.parse(serializeProject(project)) as {
      layers: Array<{ kind: string; items: unknown[] }>;
    };
    const drawLayer = raw.layers.find((entry) => entry.kind === "draw")!;
    drawLayer.items.push({
      id: "item_bad_runs",
      page: 1,
      kind: "textbox",
      points: [
        { x: 10, y: 10 },
        { x: 100, y: 50 },
      ],
      color: "#1a2024",
      strokeWidth: 1,
      text: "fallback",
      runs: [{ text: "ok" }, { text: 42 }, { nope: true }, { text: "!" }],
      createdAt: "2026-11-04T00:00:00.000Z",
      updatedAt: "2026-11-04T00:00:00.000Z",
    });
    const parsed = parseProject(JSON.stringify(raw));
    const found = parsed.layers
      .flatMap((entry) => entry.items)
      .find((entry) => entry.id === "item_bad_runs")!;
    expect(found.text).toBe("ok!");
    expect(found.runs?.map((run) => run.text)).toEqual(["ok", "!"]);
  });
});
