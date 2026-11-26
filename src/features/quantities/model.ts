import {
  calculateQuantities,
  type QuantityFilters,
  type QuantitySummary,
} from "../../model/quantity";
import type { PageId, Project } from "../../model/types";

/** Show the current page or every page in the project. */
export type QuantityPageFilter = "current" | "all";

/** Session-only filters owned by the quantities panel. */
export interface QuantityFilterState {
  page: QuantityPageFilter;
  categoryId: string;
  room: string;
  includeHidden: boolean;
  /** null means every measurement layer, an empty set selects none. */
  layerIds: ReadonlySet<string> | null;
  layersOpen: boolean;
}

export interface QuantitySummaryCache {
  revision: number;
  key: string;
  summary: QuantitySummary | null;
}

export interface QuantitySummaryInput {
  project: Project;
  revision: number;
  currentPage: PageId | null;
  filters: QuantityFilterState;
  cache: QuantitySummaryCache;
}

/** The filter state a newly opened panel starts with. */
export function createQuantityFilterState(): QuantityFilterState {
  return {
    page: "current",
    categoryId: "",
    room: "",
    includeHidden: false,
    layerIds: null,
    layersOpen: false,
  };
}

/** A cache that cannot match a real revision, so the first summary is built. */
export function emptyQuantitySummaryCache(): QuantitySummaryCache {
  return { revision: -1, key: "", summary: null };
}

/**
 * Drop a category that no longer exists and layer ids that are gone or belong
 * to a drawing layer. Returns the same object when nothing changed.
 */
export function sanitizeFilters(
  project: Project,
  filters: QuantityFilterState,
): QuantityFilterState {
  let categoryId = filters.categoryId;
  if (categoryId && !project.categories.some((category) => category.id === categoryId)) {
    categoryId = "";
  }

  let layerIds = filters.layerIds;
  if (layerIds) {
    const valid = new Set(
      project.layers.filter((layer) => layer.kind === "measure").map((layer) => layer.id),
    );
    const next = new Set([...layerIds].filter((id) => valid.has(id)));
    layerIds = next.size ? next : null;
  }

  if (categoryId === filters.categoryId && layerIds === filters.layerIds) return filters;
  return { ...filters, categoryId, layerIds };
}

/** Translate the panel state into the domain filter object. */
export function quantityFiltersFor(
  currentPage: PageId | null,
  filters: QuantityFilterState,
): QuantityFilters {
  return {
    page: filters.page === "current" ? (currentPage ?? "all") : "all",
    layerIds: filters.layerIds ? [...filters.layerIds] : null,
    categoryId: filters.categoryId || null,
    room: filters.room,
    includeHidden: filters.includeHidden,
  };
}

/**
 * Everything that changes the rendered summary. The project id keeps a reopened
 * project from reusing a cache built for a different one; the current page is
 * part of the key even in all-pages mode because the panel still shows it.
 */
export function quantityCacheKey(input: {
  project: Project;
  currentPage: PageId | null;
  filters: QuantityFilterState;
}): string {
  return JSON.stringify({
    projectId: input.project.id,
    page: input.filters.page,
    currentPage: input.currentPage,
    category: input.filters.categoryId,
    room: input.filters.room,
    hidden: input.filters.includeHidden,
    layers: input.filters.layerIds ? [...input.filters.layerIds].sort() : null,
  });
}

/** True when the cached summary was built from the same revision and filters. */
export function summaryCacheIsReusable(
  cache: QuantitySummaryCache,
  revision: number,
  key: string,
): boolean {
  return cache.summary !== null && cache.revision === revision && cache.key === key;
}

/**
 * Return the cache unchanged for identical inputs, otherwise rebuild from the
 * shared domain calculation and record the revision and key it belongs to.
 */
export function resolveQuantitySummary(input: QuantitySummaryInput): QuantitySummaryCache {
  const key = quantityCacheKey(input);
  if (summaryCacheIsReusable(input.cache, input.revision, key)) return input.cache;
  return {
    revision: input.revision,
    key,
    summary: calculateQuantities(
      input.project,
      quantityFiltersFor(input.currentPage, input.filters),
    ),
  };
}
