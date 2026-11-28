// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { OpenPagesController } from "../src/features/openPages";
import { createProject, defaultDocument } from "../src/model/layers";
import { store } from "../src/state/store";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

function projectWithPages(count: number): ReturnType<typeof createProject> {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", count)));
}

function tabIds(mount: HTMLElement): Array<string | undefined> {
  return [...mount.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) => tab.dataset.pageId);
}

function activeId(mount: HTMLElement): string | undefined {
  return [...mount.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (tab) => tab.getAttribute("aria-selected") === "true",
  )?.dataset.pageId;
}

function tabName(mount: HTMLElement, pageId: string): string | undefined {
  return mount.querySelector<HTMLElement>(
    `.open-page-tab-cell[data-page-id="${pageId}"] .open-page-name`,
  )?.textContent;
}

let current: OpenPagesController | null = null;

interface Mounted {
  mount: HTMLElement;
  controller: OpenPagesController;
  visited: number[];
}

function mountController(): Mounted {
  const mount = document.createElement("div");
  document.body.append(mount);
  const visited: number[] = [];
  const controller = new OpenPagesController({
    mount,
    goToPage: (page) => {
      visited.push(page);
      store.setPage(page);
    },
  });
  current = controller;
  controller.start();
  return { mount, controller, visited };
}

/** The three-tab starting point: page 2 pinned, page 3 pinned, page 4 preview. */
function threePinnedTabs(): Mounted {
  const mounted = mountController();
  store.setProject(projectWithPages(4), null);
  store.setPage(2);
  mounted.controller.pinPage(pageIdFor(2));
  store.setPage(3);
  mounted.controller.pinPage(pageIdFor(3));
  store.setPage(4);
  return mounted;
}

afterEach(() => {
  current?.stop();
  current = null;
  store.closeProject();
  document.body.replaceChildren();
});

describe("open-pages controller lifecycle", () => {
  it("increments the project load id only on open and close", () => {
    const before = store.projectLoadId;
    store.setProject(projectWithPages(2), null);
    expect(store.projectLoadId).toBe(before + 1);
    store.setPage(2);
    store.beginGesture();
    store.cancelGesture();
    store.mutate(() => undefined, "change");
    expect(store.projectLoadId).toBe(before + 1);
    store.closeProject();
    expect(store.projectLoadId).toBe(before + 2);
  });

  it("keeps pinned tabs when a no-move gesture cancel replaces the project object", () => {
    const { mount } = mountController();
    store.setProject(projectWithPages(3), null);
    store.setPage(2);
    current!.pinPage(pageIdFor(2));
    store.setPage(3);
    expect(tabIds(mount)).toEqual([pageIdFor(2), pageIdFor(3)]);

    // The real no-move click path: beginSelection opens a gesture, endDrag
    // cancels it and restores a different project object without emitting.
    store.beginGesture();
    store.cancelGesture();
    store.setPage(1);

    expect(tabIds(mount)).toEqual([pageIdFor(2), pageIdFor(1)]);
    expect(activeId(mount)).toBe(pageIdFor(1));
    expect(
      mount.querySelector(`.open-page-tab-cell[data-page-id="${pageIdFor(2)}"] .open-page-pin`),
    ).toBeNull();
  });

  it("prunes only the deleted page and moves the active tab to its nearest neighbour", async () => {
    const { mount, visited } = mountController();
    store.setProject(projectWithPages(3), null);
    store.setPage(3);
    current!.pinPage(pageIdFor(3));
    store.setPage(1);
    expect(tabIds(mount)).toEqual([pageIdFor(3), pageIdFor(1)]);

    // The active preview (page 1) is deleted; the tab at its index is gone but
    // the pinned page 3 survives. The store selects page 2, so the controller
    // must activate the nearest tab, page 3, at its new display number 2.
    store.deletePage(pageIdFor(1));
    await Promise.resolve();

    expect(tabIds(mount)).toEqual([pageIdFor(3)]);
    expect(activeId(mount)).toBe(pageIdFor(3));
    expect(store.ui.page).toBe(2);
    expect(visited).toContain(2);
  });

  it("prunes a non-active tab without changing the current page", () => {
    const { mount } = threePinnedTabs();
    store.setPage(3);
    expect(tabIds(mount)).toEqual([pageIdFor(2), pageIdFor(3), pageIdFor(4)]);

    // Page 4 is the non-active preview; deleting the last page keeps page 3.
    store.deletePage(pageIdFor(4));
    expect(tabIds(mount)).toEqual([pageIdFor(2), pageIdFor(3)]);
    expect(activeId(mount)).toBe(pageIdFor(3));
    expect(store.ui.page).toBe(3);
  });

  it("keeps tab order when pages reorder", () => {
    const { mount } = threePinnedTabs();
    store.reorderPage(pageIdFor(4), 0);
    expect(tabIds(mount)).toEqual([pageIdFor(2), pageIdFor(3), pageIdFor(4)]);
  });

  it("keeps pinned tabs through a page insert and a page duplicate", () => {
    const { mount } = threePinnedTabs();
    const inserted = store.insertPageRecord(pageIdFor(1), 0);
    expect(inserted).not.toBeNull();
    expect(tabIds(mount)).toEqual([pageIdFor(2), pageIdFor(3), inserted]);

    const duplicated = store.duplicatePage(pageIdFor(2), {
      copyMarkups: false,
      copyScale: false,
      copyName: false,
      name: "Copy",
    });
    expect(duplicated).not.toBeNull();
    expect(tabIds(mount)).toContain(pageIdFor(2));
    expect(tabIds(mount)).toContain(pageIdFor(3));
    expect(tabIds(mount)).toHaveLength(3);
  });

  it("reseeds for a new project and clears on close", () => {
    const { mount } = mountController();
    const first = projectWithPages(3);
    store.setProject(first, null);
    store.setPage(2);
    current!.pinPage(pageIdFor(2));
    store.setPage(3);
    expect(tabIds(mount)).toHaveLength(2);

    store.setProject(projectWithPages(2), null);
    expect(tabIds(mount)).toEqual([pageIdFor(1)]);
    expect(activeId(mount)).toBe(pageIdFor(1));
    expect(mount.querySelector(".open-page-pin")).not.toBeNull();

    store.closeProject();
    expect(mount.hidden).toBe(true);
    expect(tabIds(mount)).toEqual([]);

    // Reopening the same project object still seeds a fresh preview.
    store.setProject(first, "/tmp/same.gridscalr");
    expect(tabIds(mount)).toEqual([pageIdFor(1)]);
  });

  it("updates a renamed label without moving the tab", () => {
    const { mount } = mountController();
    store.setProject(projectWithPages(3), null);
    store.setPage(2);
    current!.pinPage(pageIdFor(2));
    store.setPage(3);

    store.renamePage(pageIdFor(2), "Renamed plan");
    expect(tabIds(mount)).toEqual([pageIdFor(2), pageIdFor(3)]);
    expect(tabName(mount, pageIdFor(2))).toBe("Renamed plan");
    expect(activeId(mount)).toBe(pageIdFor(3));
  });

  it("shows no tabs and no row for a zero-page project", () => {
    const { mount } = mountController();
    store.setProject(createProject(), null);
    expect(mount.hidden).toBe(true);
    expect(tabIds(mount)).toEqual([]);
  });
});
