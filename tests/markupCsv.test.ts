import { describe, expect, it } from "vitest";
import {
  createDefaultLayers,
  createProject,
  defaultDocument,
  setLayerVisibleOnPage,
} from "../src/model/layers";
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
    expect(lines[0]).toBe(
      "Page,Type,Layer,Label,Value,Unit,Details,Points,Symbol,Symbol category,Status,Created,Modified",
    );
    expect(csv).toContain('"Wall, ""A"""');
    expect(csv).toContain("Text");
    expect(csv).not.toContain("\n\n");
  });

  it("keeps the value and unit consistent when smart lengths are enabled", () => {
    const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
    project.settings.lengthUnit = "cm";
    project.settings.smartLengthUnits = true;
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    measure.items.push({
      ...item("long", "length", "Long wall"),
      points: [
        { x: 0, y: 0 },
        { x: 3000, y: 0 },
      ],
    });
    measure.items.push({
      ...item("short", "length", "Short wall"),
      points: [
        { x: 0, y: 0 },
        { x: 15, y: 0 },
      ],
    });
    const csv = serializeMarkupCsv(project);
    expect(csv).toContain("Long wall,100 m,m");
    expect(csv).toContain("Short wall,50 cm,cm");
  });

  it("applies layer visibility separately per page", () => {
    const project = createProject(defaultDocument("Plan.pdf", 2), createDefaultLayers());
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    measure.items.push(item("page-1", "length", "Page 1 wall"));
    measure.items.push({ ...item("page-2", "length", "Page 2 wall"), page: 2 });
    setLayerVisibleOnPage(measure, 1, false);
    const csv = serializeMarkupCsv(project);
    expect(csv).not.toContain("Page 1 wall");
    expect(csv).toContain("Page 2 wall");
    setLayerVisibleOnPage(measure, 2, false);
    expect(serializeMarkupCsv(project)).not.toContain("Page 2 wall");
  });

  it("excludes hidden layers and hidden items", () => {
    const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    measure.items.push(item("visible", "length", "Visible"));
    measure.items.push({ ...item("hidden", "length", "Hidden"), visible: false });
    measure.visible = false;
    expect(serializeMarkupCsv(project)).toBe(
      "Page,Type,Layer,Label,Value,Unit,Details,Points,Symbol,Symbol category,Status,Created,Modified",
    );
    measure.visible = true;
    const csv = serializeMarkupCsv(project);
    expect(csv).toContain("Visible");
    expect(csv).not.toContain("Hidden");
  });

  it("exports symbol names, categories, and inspection status", () => {
    const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    draw.items.push({
      ...item("symbol", "symbol", "Extinguisher"),
      points: [{ x: 50, y: 60 }],
      symbolId: "fire.extinguisher",
      status: "approved",
      color: "#e5484d",
    });
    const csv = serializeMarkupCsv(project);
    expect(csv).toContain("Symbol");
    expect(csv).toContain("Fire extinguisher,Fire protection,Approved");
    expect(csv).toContain("50.00 60.00");
  });
});
