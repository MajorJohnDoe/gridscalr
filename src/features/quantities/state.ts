import type { Project } from "../../model/types";
import {
  createQuantityFilterState,
  emptyQuantitySummaryCache,
  sanitizeFilters,
  type QuantityFilterState,
  type QuantitySummaryCache,
} from "./model";

/** The panel's single mutable session state: filters, cache and mount point. */
export interface QuantityPanelState extends QuantityFilterState {
  projectIdentity: string;
  cache: QuantitySummaryCache;
  activeContainer: HTMLElement | null;
}

export function createQuantityPanelState(): QuantityPanelState {
  return {
    ...createQuantityFilterState(),
    projectIdentity: "",
    cache: emptyQuantitySummaryCache(),
    activeContainer: null,
  };
}

export const quantityPanelState = createQuantityPanelState();

/**
 * Reset filters and the cache but keep the mounted container and project
 * identity: a reset button must not unmount the panel.
 */
export function resetQuantityPanelFilters(state: QuantityPanelState = quantityPanelState): void {
  Object.assign(state, createQuantityFilterState());
  state.cache = emptyQuantitySummaryCache();
}

/** Apply the pure sanitiser to the one mutable state object. */
export function sanitizeQuantityPanelFilters(state: QuantityPanelState, project: Project): void {
  Object.assign(state, sanitizeFilters(project, state));
}
