import { describe, expect, it } from "vitest";
import {
  createQuantityFilterState,
  emptyQuantitySummaryCache,
  quantityCacheKey,
  quantityFiltersFor,
  resolveQuantitySummary,
  sanitizeFilters,
  type QuantityFilterState,
} from "../src/features/quantities";
import { addLayer, createProject, defaultDocument, layersForKind } from "../src/model/layers";
import type { PageId, Project } from "../src/model/types";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

function makeProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 2)));
  project.settings.lengthUnit = "m";
  return project;
}

function filters(overrides: Partial<QuantityFilterState> = {}): QuantityFilterState {
  return { ...createQuantityFilterState(), ...overrides };
}

function cacheFor(
  project: Project,
  state: QuantityFilterState,
  revision = 1,
  currentPage: PageId | null = pageIdFor(1),
) {
  return resolveQuantitySummary({
    project,
    revision,
    currentPage,
    filters: state,
    cache: emptyQuantitySummaryCache(),
  });
}

describe("quantities filter sanitising", () => {
  it("keeps a category that still exists and clears one that disappeared", () => {
    const project = makeProject();
    const category = project.categories[0];

    expect(sanitizeFilters(project, filters({ categoryId: category.id })).categoryId).toBe(
      category.id,
    );
    expect(sanitizeFilters(project, filters({ categoryId: "cat_gone" })).categoryId).toBe("");
  });

  it("keeps only measurement layers that still exist", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    const secondMeasure = addLayer(project, "measure", pageIdFor(1));
    const draw = layersForKind(project, "draw")[0];

    const sanitized = sanitizeFilters(
      project,
      filters({ layerIds: new Set([measure.id, "layer_gone", draw.id, secondMeasure.id]) }),
    );

    expect([...(sanitized.layerIds ?? [])].sort()).toEqual([measure.id, secondMeasure.id].sort());
  });

  it("clears the layer filter when no selected layer survives", () => {
    const project = makeProject();
    const draw = layersForKind(project, "draw")[0];

    expect(sanitizeFilters(project, filters({ layerIds: new Set([draw.id]) })).layerIds).toBeNull();
    expect(
      sanitizeFilters(project, filters({ layerIds: new Set(["layer_gone"]) })).layerIds,
    ).toBeNull();
    expect(sanitizeFilters(project, filters({ layerIds: new Set() })).layerIds).toBeNull();
  });

  it("falls back to every page when the current page disappears", () => {
    expect(quantityFiltersFor(pageIdFor(2), filters({ page: "current" })).page).toBe(pageIdFor(2));
    expect(quantityFiltersFor(null, filters({ page: "current" })).page).toBe("all");
    expect(quantityFiltersFor(pageIdFor(2), filters({ page: "all" })).page).toBe("all");
  });

  it("maps the remaining filter fields onto the domain filter object", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];

    expect(
      quantityFiltersFor(
        pageIdFor(2),
        filters({
          categoryId: project.categories[0].id,
          room: "  Kitchen ",
          includeHidden: true,
          layerIds: new Set([measure.id]),
        }),
      ),
    ).toEqual({
      page: pageIdFor(2),
      layerIds: [measure.id],
      categoryId: project.categories[0].id,
      room: "  Kitchen ",
      includeHidden: true,
    });

    expect(quantityFiltersFor(pageIdFor(2), filters({ categoryId: "" })).categoryId).toBeNull();
    expect(quantityFiltersFor(pageIdFor(2), filters()).layerIds).toBeNull();
  });
});

describe("quantities summary cache key", () => {
  it("is stable for the same inputs regardless of layer selection order", () => {
    const project = makeProject();
    const first = quantityCacheKey({
      project,
      currentPage: pageIdFor(1),
      filters: filters({ layerIds: new Set(["layer_b", "layer_a"]) }),
    });
    const second = quantityCacheKey({
      project,
      currentPage: pageIdFor(1),
      filters: filters({ layerIds: new Set(["layer_a", "layer_b"]) }),
    });

    expect(first).toBe(second);
  });

  it("changes when the project, page, current page or any filter changes", () => {
    const project = makeProject();
    const category = project.categories[0];
    const currentPage = pageIdFor(1);
    const base = quantityCacheKey({
      project,
      currentPage,
      filters: filters({ categoryId: category.id, layerIds: new Set(["layer_a"]) }),
    });

    const variants = [
      quantityCacheKey({
        project: { ...project, id: "project_other" },
        currentPage,
        filters: filters({ categoryId: category.id, layerIds: new Set(["layer_a"]) }),
      }),
      quantityCacheKey({
        project,
        currentPage: pageIdFor(2),
        filters: filters({ categoryId: category.id, layerIds: new Set(["layer_a"]) }),
      }),
      quantityCacheKey({
        project,
        currentPage: null,
        filters: filters({ categoryId: category.id, layerIds: new Set(["layer_a"]) }),
      }),
      quantityCacheKey({
        project,
        currentPage,
        filters: filters({ page: "all", categoryId: category.id, layerIds: new Set(["layer_a"]) }),
      }),
      quantityCacheKey({
        project,
        currentPage,
        filters: filters({ categoryId: "", layerIds: new Set(["layer_a"]) }),
      }),
      quantityCacheKey({
        project,
        currentPage,
        filters: filters({
          categoryId: category.id,
          room: "Kitchen",
          layerIds: new Set(["layer_a"]),
        }),
      }),
      quantityCacheKey({
        project,
        currentPage,
        filters: filters({
          categoryId: category.id,
          includeHidden: true,
          layerIds: new Set(["layer_a"]),
        }),
      }),
      quantityCacheKey({
        project,
        currentPage,
        filters: filters({ categoryId: category.id, layerIds: new Set(["layer_b"]) }),
      }),
      quantityCacheKey({
        project,
        currentPage,
        filters: filters({ categoryId: category.id, layerIds: null }),
      }),
    ];

    for (const variant of variants) expect(variant).not.toBe(base);
  });
});

describe("quantities summary cache reuse", () => {
  it("reuses the cached summary for the same project, revision and filters", () => {
    const project = makeProject();
    const state = filters();

    const first = cacheFor(project, state);
    const second = resolveQuantitySummary({
      project,
      revision: 1,
      currentPage: pageIdFor(1),
      filters: filters(),
      cache: first,
    });

    expect(second).toBe(first);
    expect(second.summary).toBe(first.summary);
    expect(second.revision).toBe(1);
    expect(second.key).toBe(
      quantityCacheKey({ project, currentPage: pageIdFor(1), filters: state }),
    );
  });

  it("rebuilds when the project revision changes even though the key is the same", () => {
    const project = makeProject();
    const first = cacheFor(project, filters());
    const second = resolveQuantitySummary({
      project,
      revision: 2,
      currentPage: pageIdFor(1),
      filters: filters(),
      cache: first,
    });

    expect(second).not.toBe(first);
    expect(second.key).toBe(first.key);
    expect(second.revision).toBe(2);
  });

  it("rebuilds when a filter, the project or the current page changes", () => {
    const project = makeProject();
    const first = cacheFor(project, filters());

    const room = resolveQuantitySummary({
      project,
      revision: 1,
      currentPage: pageIdFor(1),
      filters: filters({ room: "Kitchen" }),
      cache: first,
    });
    const otherProject = resolveQuantitySummary({
      project: { ...project, id: "project_other" },
      revision: 1,
      currentPage: pageIdFor(1),
      filters: filters(),
      cache: first,
    });
    const pageGone = resolveQuantitySummary({
      project,
      revision: 1,
      currentPage: null,
      filters: filters(),
      cache: first,
    });

    expect(room).not.toBe(first);
    expect(room.key).not.toBe(first.key);
    expect(otherProject).not.toBe(first);
    expect(otherProject.key).not.toBe(first.key);
    expect(pageGone).not.toBe(first);
    expect(pageGone.key).not.toBe(first.key);
    expect(pageGone.summary).not.toBeNull();
  });
});
