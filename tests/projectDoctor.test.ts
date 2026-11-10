import { describe, expect, it } from "vitest";
import { pageIdFor, withTestPageIds } from "./helpers/pages";
import { validateProject } from "../src/model/integrity";
import { createProject, defaultDocument } from "../src/model/layers";
import type { MarkupItem, Project } from "../src/model/types";
import {
  applyRepair,
  availableRepairs,
  repairDanglingReferences,
  repairDuplicateIds,
  repairStaleOcr,
} from "../src/features/projectIntegrity/repair";
import { runLoadReport } from "../src/features/projectIntegrity/doctor";

const NOW = "2026-01-01T00:00:00.000Z";

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

function errorsIn(project: Project): string[] {
  return validateProject(project)
    .filter((entry) => entry.severity === "error")
    .map((entry) => entry.code);
}

describe("duplicate id repair", () => {
  it("renames every repeated id after the first and is deterministic", () => {
    const project = makeProject();
    project.documents.push(structuredClone(project.documents[0]));
    project.pages.push(structuredClone(project.pages[0]));
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    const clone = structuredClone(measure);
    clone.items = [];
    project.layers.push(clone);
    measure.items.push({ ...measure.items[0] });
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
    expect(errorsIn(project)).not.toEqual([]);

    const before = JSON.stringify(project);
    const first = repairDuplicateIds(project);
    const second = repairDuplicateIds(project);
    expect(JSON.stringify(project)).toBe(before);
    expect(JSON.stringify(first.project)).toBe(JSON.stringify(second.project));
    expect(first.changed).toBeGreaterThan(0);
    expect(errorsIn(first.project)).toEqual([]);
  });
});

describe("dangling reference repair", () => {
  it("removes or rewrites every missing reference without mutating the input", () => {
    const project = makeProject();
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    const draw = project.layers.find((layer) => layer.kind === "draw")!;
    measure.homePageId = "page_missing";
    measure.pageState = { page_missing: { visible: false } };
    measure.items.push(
      item("item_missing_page", "page_missing"),
      item("item_missing_category", pageIdFor(1), { categoryId: "cat_missing" }),
      item("item_missing_count", pageIdFor(1), {
        kind: "count",
        categoryId: project.settings.quantity.defaultCategoryId,
        countType: "missing_type",
      }),
    );
    draw.items.push(
      item("item_missing_line", pageIdFor(1), {
        kind: "polyline",
        lineTypeId: "line_missing",
      }),
      item("item_missing_image", pageIdFor(1), {
        kind: "image",
        image: { assetId: "asset_missing", mode: "annotation" },
      }),
    );
    project.pages.push({ id: "page_orphan", documentId: "doc_missing", localPage: 1, state: {} });
    project.reportLogoAssetId = "asset_missing";
    project.activeLayerId = "layer_missing";
    project.settings.quantity.defaultCategoryId = "cat_missing";
    project.countPresets.push({
      id: "preset_bad",
      countType: "missing_type",
      categoryId: "cat_missing",
      room: "",
      quantity: 1,
    });
    project.markupsViews.push({
      id: "view_bad",
      name: "View",
      columns: ["name"],
      pageFilter: "all",
      typeFilter: "all",
      categoryId: "cat_missing",
      symbolCategory: null,
      countType: "missing_type",
      search: "",
      groupBy: [],
      sort: null,
    });
    project.documents[0].excludedPages = [9];
    project.documents[0].copiedFrom = { documentId: "doc_missing", page: 1 };

    const before = JSON.stringify(project);
    const result = repairDanglingReferences(project);
    expect(JSON.stringify(project)).toBe(before);
    expect(result.changed).toBeGreaterThan(0);
    expect(result.project.pages.map((page) => page.id)).not.toContain("page_orphan");
    expect(result.project.reportLogoAssetId).toBeNull();
    expect(result.project.settings.quantity.defaultCategoryId).toBe(
      result.project.categories[0].id,
    );
    expect(errorsIn(result.project)).toEqual([]);
  });
});

describe("stale OCR repair", () => {
  it("removes OCR text whose source revision or page changed", () => {
    const project = makeProject();
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
    const before = JSON.stringify(project);
    const result = repairStaleOcr(project);
    expect(JSON.stringify(project)).toBe(before);
    expect(result.changed).toBe(1);
    expect(result.project.pages[0].state.ocr).toBeUndefined();
  });
});

describe("project doctor repairs and load report", () => {
  it("lists repairs from the current issues and applies them by kind", () => {
    const project = makeProject();
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    measure.items.push({ ...measure.items[0] });
    const issues = validateProject(project);
    expect(availableRepairs(issues)).toContain("duplicateIds");
    const repaired = applyRepair(project, "duplicateIds");
    expect(errorsIn(repaired.project)).toEqual([]);
  });

  it("opens a clean project without a dialog", async () => {
    const project = makeProject();
    let dialogs = 0;
    const outcome = await runLoadReport(
      {
        project,
        report: { warnings: [], dropped: [], repaired: [], issues: [] },
        host: { saveRepairedCopy: async () => true, exportDiagnostics: async () => undefined },
      },
      {
        dialog: async () => {
          dialogs += 1;
          return { kind: "close" };
        },
      },
    );
    expect(outcome.decision).toBe("open");
    expect(dialogs).toBe(0);
  });
});
