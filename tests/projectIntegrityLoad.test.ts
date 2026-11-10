import { describe, expect, it } from "vitest";
import { pageIdFor, withTestPageIds } from "./helpers/pages";
import { createProject, defaultDocument } from "../src/model/layers";
import { parseProject, parseProjectWithReport, serializeProject } from "../src/io/projectFile";
import type { MarkupItem, Project } from "../src/model/types";

const NOW = "2026-01-01T00:00:00.000Z";

function makeProject(): Project {
  const document = defaultDocument("Plan.pdf", 2);
  document.sha256 = "a".repeat(64);
  const project = withTestPageIds(createProject(document));
  const draw = project.layers.find((layer) => layer.kind === "draw")!;
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  const text: MarkupItem = {
    id: "item_text",
    pageId: pageIdFor(1),
    kind: "text",
    points: [{ x: 10, y: 10 }],
    color: "#ffffff",
    strokeWidth: 2,
    text: "note",
    createdAt: NOW,
    updatedAt: NOW,
  };
  const length: MarkupItem = {
    id: "item_length",
    pageId: pageIdFor(1),
    kind: "length",
    points: [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    categoryId: project.settings.quantity.defaultCategoryId,
    scale: { pointsPerMeter: 20, sourceUnit: "m" },
    createdAt: NOW,
    updatedAt: NOW,
  };
  draw.items.push(text);
  measure.items.push(length);
  return project;
}

describe("project load report", () => {
  it("round-trips optional page provenance", () => {
    const project = makeProject();
    project.pages[0].provenance = {
      sourceProjectId: "project_source",
      sourceRevisionSha256: "b".repeat(64),
      sourceRevisionSize: 2048,
      sourceRevisionModifiedAt: NOW,
      sourcePageId: "page_source",
      importedAt: NOW,
      appVersion: "0.22.4",
    };
    const parsed = parseProject(serializeProject(project));
    expect(parsed.pages[0].provenance).toEqual(project.pages[0].provenance);
  });

  it("drops malformed provenance and reports it", () => {
    const raw = JSON.parse(serializeProject(makeProject()));
    raw.pages[0].provenance = { sourceProjectId: "project_source" };
    const { project, report } = parseProjectWithReport(JSON.stringify(raw));
    expect(project.pages[0].provenance).toBeUndefined();
    expect(report.dropped).toContainEqual({ code: "droppedPageProvenance", count: 1 });
  });

  it("reports invalid entities, repaired ids and remaining issues", () => {
    const raw = JSON.parse(serializeProject(makeProject()));
    const draw = raw.layers.find((layer: { kind: string }) => layer.kind === "draw");
    draw.items.push({
      id: "item_missing_image",
      pageId: pageIdFor(1),
      kind: "image",
      points: [
        { x: 10, y: 10 },
        { x: 30, y: 30 },
      ],
      color: "#ffffff",
      strokeWidth: 2,
      image: { assetId: "asset_missing", mode: "annotation" },
      createdAt: NOW,
      updatedAt: NOW,
    });
    draw.items.push({
      id: "item_polyline",
      pageId: pageIdFor(1),
      kind: "polyline",
      points: [
        { x: 10, y: 10 },
        { x: 30, y: 30 },
      ],
      color: "#ffffff",
      strokeWidth: 2,
      lineTypeId: "line_missing",
      createdAt: NOW,
      updatedAt: NOW,
    });
    raw.categories.push({ ...raw.categories[0] });
    raw.documents[0].excludedPages = [99];

    const { report } = parseProjectWithReport(JSON.stringify(raw));
    expect(report.dropped).toEqual(
      expect.arrayContaining([
        { code: "droppedItem", count: 1 },
        { code: "droppedImageAsset", count: 1 },
        { code: "droppedExcludedPage", count: 1 },
      ]),
    );
    expect(report.repaired).toContainEqual({ code: "repairedCategoryId", count: 1 });
    expect(report.issues.map((entry) => entry.code)).toContain("missingItemLineType");
  });

  it("does not report an empty project as corrupt", () => {
    const empty = withTestPageIds(createProject(null));
    const { report } = parseProjectWithReport(serializeProject(empty));
    expect(report.dropped.filter((entry) => entry.count > 0)).toEqual([]);
    expect(report.repaired.filter((entry) => entry.count > 0)).toEqual([]);
    expect(report.issues.filter((entry) => entry.severity === "error")).toEqual([]);
  });
});
