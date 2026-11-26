// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  applyAnnotationEdit,
  applyItemText,
  applyTextBoxEdit,
  applyTextItemEdit,
  createTextItem,
  textEditChanged,
  type TextEditValues,
} from "../src/model/commands/editorText";
import {
  releaseItemLabelFit,
  resetItemLabelSize,
  setItemLabel,
  setItemLabelAnchor,
  setItemLabelFit,
} from "../src/model/commands/editorLabels";
import { insertItemPoint, setMeasurementVolumeDepth } from "../src/model/commands/editorItems";
import { createProject, defaultDocument } from "../src/model/layers";
import type { MarkupItem, Project } from "../src/model/types";
import { Store } from "../src/state/store";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

function makeProject(): Project {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", 2)));
}

function drawLayer(project: Project) {
  return project.layers.find((layer) => layer.kind === "draw")!;
}

function makeItem(id: string, kind: MarkupItem["kind"]): MarkupItem {
  return {
    id,
    pageId: pageIdFor(1),
    kind,
    points: [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
    ],
    color: "#4cc9f0",
    strokeWidth: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function withItem(project: Project, item: MarkupItem): MarkupItem {
  drawLayer(project).items.push(item);
  return item;
}

function values(overrides: Partial<TextEditValues> = {}): TextEditValues {
  return {
    text: "Note",
    color: "#4cc9f0",
    fontSize: 12,
    rotation: 0,
    bold: false,
    italic: false,
    underline: false,
    align: "left",
    ...overrides,
  };
}

describe("text editor commands", () => {
  it("treats an unchanged session as unchanged", () => {
    expect(textEditChanged(values(), values())).toBe(false);
    expect(textEditChanged(values(), values({ text: "Other" }))).toBe(true);
    expect(textEditChanged(values(), values({ rotation: 15 }))).toBe(true);
  });

  it("applies a text note edit and stores no explicit false flags", () => {
    const project = makeProject();
    const item = withItem(project, makeItem("text_1", "text"));

    expect(
      applyTextItemEdit(
        project,
        item.id,
        values({ text: "Changed", color: "#e30613", fontSize: 18, rotation: 90, bold: true }),
      ),
    ).toBe(true);

    expect(item.text).toBe("Changed");
    expect(item.color).toBe("#e30613");
    expect(item.fontSize).toBe(18);
    expect(item.rotation).toBe(90);
    expect(item.textBold).toBe(true);
    expect(item.textItalic).toBeUndefined();
    expect(item.textAlign).toBeUndefined();
    expect(item.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");

    applyTextItemEdit(project, item.id, values({ bold: false, rotation: 0 }));
    expect(item.textBold).toBeUndefined();
    expect(item.rotation).toBeUndefined();
  });

  it("keeps formatted runs for a text box and drops unstyled runs", () => {
    const project = makeProject();
    const item = withItem(project, makeItem("textbox_1", "textbox"));

    applyTextBoxEdit(
      project,
      item.id,
      values({
        text: "AB",
        runs: [{ text: "A", color: "#e30613" }, { text: "B" }],
      }),
    );
    expect(item.runs?.length).toBe(2);
    expect(item.text).toBe("AB");

    applyTextBoxEdit(project, item.id, values({ text: "Plain", runs: [{ text: "Plain" }] }));
    expect(item.runs).toBeUndefined();
  });

  it("uses the supplied placeholder for an empty annotation label", () => {
    const project = makeProject();
    const item = withItem(project, makeItem("cloud_1", "cloud"));

    applyAnnotationEdit(project, item.id, values({ text: "   " }), "Revision");
    expect(item.text).toBe("Revision");
    expect(item.textColor).toBe("#4cc9f0");

    applyAnnotationEdit(project, item.id, values({ text: "Set", boxWidth: 120 }), "Revision");
    expect(item.text).toBe("Set");
    expect(item.textBoxWidth).toBe(120);
    expect(item.textBoxHeight).toBeUndefined();
  });

  it("updates a stamp label and its status colour together", () => {
    const project = makeProject();
    const item = withItem(project, makeItem("stamp_1", "stamp"));

    expect(applyItemText(project, item.id, "  ", "Stamp")).toBe(true);
    expect(item.text).toBe("Stamp");
    expect(typeof item.color).toBe("string");

    expect(applyItemText(project, "missing", "Text", "")).toBe(false);
  });

  it("creates a text note in the drawing layer", () => {
    const project = makeProject();
    const created = createTextItem(project, {
      pageId: pageIdFor(1),
      anchor: { x: 40, y: 50 },
      text: "New note",
      color: "#e30613",
      fontSize: 14,
      rotation: 0,
      bold: true,
      italic: false,
      underline: false,
      align: "center",
    });

    const layer = project.layers.find((entry) => entry.id === created.layerId)!;
    const item = layer.items.find((entry) => entry.id === created.itemId)!;
    expect(layer.kind).toBe("draw");
    expect(item.kind).toBe("text");
    expect(item.points).toEqual([{ x: 40, y: 50 }]);
    expect(item.text).toBe("New note");
    expect(item.textBold).toBe(true);
    expect(item.textItalic).toBeUndefined();
    expect(item.textAlign).toBe("center");
    expect(item.rotation).toBeUndefined();
  });
});

describe("label editor commands", () => {
  it("sets and clears a measurement label", () => {
    const project = makeProject();
    const item = withItem(project, makeItem("length_1", "length"));

    expect(setItemLabel(project, item.id, "  Wall A  ")).toBe(true);
    expect(item.label).toBe("Wall A");

    setItemLabel(project, item.id, "   ");
    expect(item.label).toBeUndefined();
  });

  it("moves the label anchor to a copy of the point", () => {
    const project = makeProject();
    const item = withItem(project, makeItem("length_2", "length"));
    const point = { x: 5, y: 6 };

    setItemLabelAnchor(project, item.id, point);
    point.x = 99;

    expect(item.labelAnchor).toEqual({ x: 5, y: 6 });
  });

  it("resets a manual label size", () => {
    const project = makeProject();
    const item = withItem(project, makeItem("length_3", "length"));
    item.labelSize = 14;

    expect(resetItemLabelSize(project, item.id)).toBe(true);
    expect(item.labelSize).toBeUndefined();
  });

  it("pins and releases an area label inside the shape", () => {
    const project = makeProject();
    const area = withItem(project, makeItem("area_1", "area"));
    area.labelOffset = { x: 3, y: 4 };
    area.labelAnchor = { x: 1, y: 2 };

    expect(setItemLabelFit(project, area.id, "top-left")).toBe(true);
    expect(area.labelFit).toBe("top-left");
    expect(area.labelOffset).toBeUndefined();
    expect(area.labelAnchor).toBeUndefined();

    expect(releaseItemLabelFit(project, area.id)).toBe(true);
    expect(area.labelFit).toBeUndefined();
  });

  it("refuses an inside-shape pin for a length", () => {
    const project = makeProject();
    const item = withItem(project, makeItem("length_4", "length"));

    expect(setItemLabelFit(project, item.id, "center")).toBe(false);
    expect(item.labelFit).toBeUndefined();
  });
});

describe("canvas item commands", () => {
  it("inserts a vertex after the double-clicked segment", () => {
    const project = makeProject();
    const item = withItem(project, makeItem("length_5", "length"));

    expect(insertItemPoint(project, item.id, 0, { x: 15, y: 10 })).toBe(true);
    expect(item.points).toEqual([
      { x: 10, y: 10 },
      { x: 15, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
    ]);
  });

  it("clamps a volume depth and refuses another kind", () => {
    const project = makeProject();
    const volume = withItem(project, makeItem("volume_1", "volume"));
    const length = withItem(project, makeItem("length_6", "length"));

    expect(setMeasurementVolumeDepth(project, volume.id, 0)).toBe(true);
    expect(volume.depth).toBe(0.001);

    expect(setMeasurementVolumeDepth(project, length.id, 2)).toBe(false);
    expect(length.depth).toBeUndefined();
  });
});

describe("one editor action is one undo step", () => {
  it("restores a text edit and an item edit with one undo", () => {
    const project = makeProject();
    const text = withItem(project, makeItem("text_undo", "text"));
    text.text = "Before";
    const length = withItem(project, makeItem("length_undo", "length"));
    const store = new Store();
    store.setProject(project, null);

    store.mutate((current) => {
      applyTextItemEdit(current, text.id, values({ text: "Undo me" }));
    }, "change");
    store.mutate((current) => {
      setItemLabel(current, length.id, "Label");
    }, "change");
    expect(text.text).toBe("Undo me");
    expect(length.label).toBe("Label");

    const itemText = () =>
      store.project!.layers.flatMap((layer) => layer.items).find((item) => item.id === text.id)!
        .text;
    const itemLabel = () =>
      store.project!.layers.flatMap((layer) => layer.items).find((item) => item.id === length.id)!
        .label;

    store.undo();
    expect(itemLabel()).toBeUndefined();

    store.undo();
    expect(itemText()).toBe("Before");
    expect(store.canUndo).toBe(false);
  });
});
