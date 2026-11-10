import { describe, expect, it } from "vitest";
import { pageIdFor, withTestPageIds } from "./helpers/pages";
import {
  compareProjectShape,
  projectShape,
  validateProject,
  type ProjectIssue,
} from "../src/model/integrity";
import { createProject, defaultDocument } from "../src/model/layers";
import type { ImageAsset, MarkupItem, Project } from "../src/model/types";

const NOW = "2026-01-01T00:00:00.000Z";

function codes(issues: readonly ProjectIssue[]): string[] {
  return issues.map((entry) => entry.code);
}

function item(id: string, pageId: string, extra: Partial<MarkupItem> = {}): MarkupItem {
  return {
    id,
    pageId,
    kind: "length",
    points: [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

function asset(id: string, data = "data:image/png;base64,AAAA"): ImageAsset {
  return {
    id,
    name: `${id}.png`,
    mime: "image/png",
    width: 10,
    height: 10,
    byteSize: 4,
    data,
  };
}

function makeProject(): Project {
  const document = defaultDocument("Plan.pdf", 2);
  document.sha256 = "a".repeat(64);
  const project = withTestPageIds(createProject(document));
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  measure.items.push(
    item("item_a", pageIdFor(1), {
      categoryId: project.settings.quantity.defaultCategoryId,
      scale: { pointsPerMeter: 20, sourceUnit: "m" },
    }),
  );
  return project;
}

describe("project integrity validator", () => {
  it("accepts a normal project and an empty project", () => {
    const project = makeProject();
    expect(validateProject(project)).toEqual([]);

    const empty = withTestPageIds(createProject(null));
    expect(empty.documents).toHaveLength(0);
    expect(empty.pages).toHaveLength(0);
    expect(validateProject(empty).filter((entry) => entry.severity === "error")).toEqual([]);
  });

  it("reports duplicate ids for every entity kind", () => {
    const project = makeProject();
    project.pages.push({ ...project.pages[0] });
    project.categories.push({ ...project.categories[0] });
    project.countTypes.push({ ...project.countTypes[0] });
    project.lineTypes.push({ ...project.lineTypes[0] });
    project.countPresets.push({
      id: "preset_1",
      countType: project.countTypes[0].id,
      categoryId: project.categories[0].id,
      room: "",
      quantity: 1,
    });
    project.countPresets.push({ ...project.countPresets[0] });
    project.markupsViews.push({
      id: "view_1",
      name: "View",
      columns: ["name"],
      pageFilter: "all",
      typeFilter: "all",
      categoryId: null,
      symbolCategory: null,
      countType: null,
      search: "",
      groupBy: [],
      sort: null,
    });
    project.markupsViews.push({ ...project.markupsViews[0] });
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    measure.items.push({ ...measure.items[0] });

    const found = codes(validateProject(project));
    expect(found).toEqual(
      expect.arrayContaining([
        "duplicatePageId",
        "duplicateCategoryId",
        "duplicateCountTypeId",
        "duplicateLineTypeId",
        "duplicateCountPresetId",
        "duplicateMarkupsViewId",
        "duplicateItemId",
      ]),
    );
  });

  it("reports dangling page, layer and item references", () => {
    const project = makeProject();
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    measure.homePageId = "page_missing";
    measure.pageState = { page_missing: { visible: false } };
    measure.items.push(
      item("item_missing_page", "page_missing", {
        categoryId: project.settings.quantity.defaultCategoryId,
      }),
    );
    project.pages[0].documentId = "doc_missing";
    project.activeLayerId = "layer_missing";

    const found = codes(validateProject(project));
    expect(found).toEqual(
      expect.arrayContaining([
        "missingLayerHomePage",
        "missingLayerPageState",
        "missingItemPage",
        "missingPageDocument",
        "missingActiveLayer",
      ]),
    );
  });

  it("reports dangling category, count type, line type, asset and logo references", () => {
    const project = makeProject();
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    measure.items.push(
      item("item_missing_category", pageIdFor(1), { categoryId: "cat_missing" }),
      item("item_missing_type", pageIdFor(1), {
        kind: "count",
        categoryId: project.settings.quantity.defaultCategoryId,
        countType: "missing_type",
      }),
      item("item_missing_line", pageIdFor(1), {
        kind: "polyline",
        categoryId: project.settings.quantity.defaultCategoryId,
        lineTypeId: "missing_line",
      }),
    );
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    draw.items.push(
      item("item_missing_image", pageIdFor(1), {
        kind: "image",
        image: { assetId: "asset_missing", mode: "annotation" },
      }),
    );
    project.reportLogoAssetId = "asset_missing";

    const found = codes(validateProject(project));
    expect(found).toEqual(
      expect.arrayContaining([
        "missingItemCategory",
        "missingItemCountType",
        "missingItemLineType",
        "missingImageAsset",
        "missingReportLogo",
      ]),
    );
  });

  it("reports count presets, views, excluded pages, copiedFrom and OCR mismatches", () => {
    const project = makeProject();
    project.countPresets.push({
      id: "preset_missing",
      countType: "missing",
      categoryId: "cat_missing",
      room: "",
      quantity: 1,
    });
    project.markupsViews.push({
      id: "view_missing",
      name: "View",
      columns: ["name"],
      pageFilter: "all",
      typeFilter: "all",
      categoryId: "cat_missing",
      symbolCategory: null,
      countType: "missing",
      search: "",
      groupBy: [],
      sort: null,
    });
    project.documents[0].excludedPages = [9];
    project.documents[0].copiedFrom = { documentId: "doc_missing", page: 1 };
    project.pages[0].state.ocr = {
      text: "hello",
      words: [],
      engine: "tesseract",
      languages: "eng",
      generatedAt: NOW,
      documentSha256: "b".repeat(64),
      sourcePage: 2,
      width: 100,
      height: 100,
    };

    const found = codes(validateProject(project));
    expect(found).toEqual(
      expect.arrayContaining([
        "missingCountPresetCategory",
        "missingCountPresetType",
        "missingMarkupsViewCategory",
        "missingMarkupsViewCountType",
        "invalidExcludedPage",
        "missingCopiedFromDocument",
        "ocrDocumentMismatch",
        "ocrSourcePageMismatch",
      ]),
    );
  });

  it("reports asset content and image geometry problems", () => {
    const project = makeProject();
    project.assets.asset_bad = asset("asset_bad", "data:image/jpeg;base64,AAAA");
    project.assets.asset_zero = { ...asset("asset_zero"), width: 0 };
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    draw.items.push(
      item("item_image", pageIdFor(1), {
        kind: "image",
        image: { assetId: "asset_bad", mode: "annotation" },
        points: [
          { x: 10, y: 10 },
          { x: 10.1, y: 10.1 },
        ],
      }),
      item("item_textbox", pageIdFor(1), {
        kind: "textbox",
        points: [
          { x: 10, y: 10 },
          { x: 11, y: 11 },
        ],
        text: "note",
      }),
    );

    const found = codes(validateProject(project));
    expect(found).toEqual(
      expect.arrayContaining([
        "assetMimeMismatch",
        "assetInvalidSize",
        "invalidImageGeometry",
        "invalidTextboxGeometry",
      ]),
    );
  });

  it("accepts superseded documents and managed sources without pages", () => {
    const project = makeProject();
    project.documents[0].storage = "managed";
    project.documents[0].relativePath = "Plan.drawings/plan-aaaaaaaa.pdf";
    project.documents[0].superseded = true;
    project.pages = [];
    for (const layer of project.layers) {
      layer.items = [];
      layer.homePageId = undefined;
      layer.pageState = undefined;
    }
    expect(validateProject(project).filter((entry) => entry.severity === "error")).toEqual([]);
  });

  it("validates page provenance", () => {
    const project = makeProject();
    project.pages[0].provenance = {
      sourceProjectId: "project_source",
      sourceRevisionSha256: "c".repeat(64),
      sourceRevisionSize: 1024,
      sourceRevisionModifiedAt: NOW,
      sourcePageId: "page_source",
      importedAt: NOW,
      appVersion: "0.22.4",
    };
    expect(validateProject(project)).toEqual([]);
    project.pages[0].provenance!.sourceRevisionSha256 = "nope";
    expect(codes(validateProject(project))).toContain("invalidPageProvenance");
  });
});

describe("project shape comparison", () => {
  it("reports entity counts lost in a round trip", () => {
    const project = makeProject();
    const parsed = JSON.parse(JSON.stringify(project)) as Project;
    for (const layer of parsed.layers) layer.items = [];
    const found = compareProjectShape(project, parsed);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      severity: "error",
      code: "roundTripItems",
      entity: { kind: "project" },
    });
    expect(projectShape(project)).toMatchObject({ pages: 2, layers: 2, items: 1 });
  });
});
