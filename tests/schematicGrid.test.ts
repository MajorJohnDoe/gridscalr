import { describe, expect, it } from "vitest";
import { createDefaultLayers, createProject } from "../src/model/layers";
import { createTemplateDocument } from "../src/features/schematics/model/sheetDocument";
import {
  SCHEMATIC_GRID_STEP,
  snapToSchematicGrid,
  usesSchematicGrid,
} from "../src/features/schematics/model/schematicGrid";
import type { DocumentRef } from "../src/model/types";

const plainDocument: DocumentRef = {
  id: "doc_plain",
  kind: "pdf",
  name: "Plan.pdf",
  path: "/tmp/Plan.pdf",
  relativePath: null,
  sha256: "",
  pageCount: 1,
  sizeBytes: 0,
};

function projectWith(document: DocumentRef) {
  return createProject(document, createDefaultLayers());
}

describe("schematic grid", () => {
  it("leaves pipe and duct points exact on drawing pages", () => {
    const project = projectWith(plainDocument);
    expect(usesSchematicGrid(project, 1)).toBe(false);
    const point = { x: 123.456, y: 78.9 };
    expect(snapToSchematicGrid(project, 1, point)).toEqual(point);
  });

  it("rounds to the 5 mm grid on operation-card sheets", () => {
    const project = projectWith(
      createTemplateDocument("gridscalr.operation-card.frame", "A3", "Sheet"),
    );
    expect(usesSchematicGrid(project, 1)).toBe(true);
    const point = { x: SCHEMATIC_GRID_STEP * 1.6, y: SCHEMATIC_GRID_STEP * 2.4 };
    expect(snapToSchematicGrid(project, 1, point)).toEqual({
      x: SCHEMATIC_GRID_STEP * 2,
      y: SCHEMATIC_GRID_STEP * 2,
    });
  });
});
