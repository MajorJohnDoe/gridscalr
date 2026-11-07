// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  deletePageFlow,
  duplicatePageFlow,
  goToPage,
  navigateToItem,
  resetProject,
  type PageFlowHost,
} from "../src/app/pageFlows";
import { packageHost } from "../src/app/packageFlows";
import { store } from "../src/state/store";

function host(): PageFlowHost {
  return {
    renderer: () => null,
    thumbnails: () => null,
    resetPageSizes: vi.fn(),
    enqueuePageSize: vi.fn(async () => undefined),
    fitPage: vi.fn(),
    focusItem: vi.fn(),
    invalidate: vi.fn(),
    renderAll: vi.fn(),
    closeSearch: vi.fn(),
    closeReference: vi.fn(async () => undefined),
    closeSplitView: vi.fn(),
    destroyRenderer: vi.fn(async () => undefined),
  };
}

describe("app flows", () => {
  it("returns from page navigation when no project is open", async () => {
    store.project = null;
    const pageHost = host();
    await goToPage(pageHost, 2);
    await navigateToItem(pageHost, 2, "layer", "item");
    await duplicatePageFlow(pageHost, 1);
    await deletePageFlow(pageHost, 1);
    expect(pageHost.enqueuePageSize).not.toHaveBeenCalled();
  });

  it("resets an open project without a renderer", async () => {
    store.project = null;
    const pageHost = host();
    await resetProject(pageHost);
    expect(pageHost.closeSearch).toHaveBeenCalled();
    expect(pageHost.destroyRenderer).toHaveBeenCalled();
  });

  it("builds a package host that forwards discard confirmation", async () => {
    const confirmDiscard = vi.fn(async () => true);
    const hostValue = packageHost({
      confirmDiscard,
      loadProjectData: vi.fn(async () => undefined),
      renderer: () => null,
    });
    expect(await hostValue.confirmDiscard()).toBe(true);
    expect(confirmDiscard).toHaveBeenCalled();
  });
});
