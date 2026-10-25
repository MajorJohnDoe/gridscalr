import { describe, expect, it } from "vitest";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import type { MarkupItem } from "../src/model/types";
import { serializeMarkupCsv } from "../src/report/markupCsv";

function item(id: string, kind: MarkupItem["kind"], label: string, page = 1): MarkupItem {
  return {
    id,
    page,
    kind,
    points: [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ],
    color: "#4cc9f0",
    strokeWidth: 1,
    label,
    scale: { pointsPerMeter: 30, sourceUnit: "m" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("markup CSV", () => {
  it("includes visible measurements and drawings on visible layers", () => {
    const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    measure.items.push(item("length", "length", 'Wall, "A"'));
    draw.items.push(item("note", "text", "Note"));

    const csv = serializeMarkupCsv(project);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Page,Type,Layer,Label,Value,Unit,Details,Points");
    expect(csv).toContain('"Wall, ""A"""');
    expect(csv).toContain("Text");
    expect(csv).not.toContain("\n\n");
  });

  it("excludes hidden layers and hidden items", () => {
    const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    measure.items.push(item("visible", "length", "Visible"));
    measure.items.push({ ...item("hidden", "length", "Hidden"), visible: false });
    measure.visible = false;
    expect(serializeMarkupCsv(project)).toBe("Page,Type,Layer,Label,Value,Unit,Details,Points");
    measure.visible = true;
    const csv = serializeMarkupCsv(project);
    expect(csv).toContain("Visible");
    expect(csv).not.toContain("Hidden");
  });
});
