// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { OpenPagesController } from "../src/features/openPages";
import { createProject, defaultDocument } from "../src/model/layers";
import { store } from "../src/state/store";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

function projectWithPages(count: number): ReturnType<typeof createProject> {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", count)));
}

interface Mounted {
  mount: HTMLElement;
  controller: OpenPagesController;
  visited: number[];
}

let current: OpenPagesController | null = null;

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

function tabs(mount: HTMLElement): HTMLElement[] {
  return [...mount.querySelectorAll<HTMLElement>('[role="tab"]')];
}

function activeTab(mount: HTMLElement): HTMLElement | undefined {
  return tabs(mount).find((tab) => tab.getAttribute("aria-selected") === "true");
}

afterEach(() => {
  current?.stop();
  current = null;
  document.querySelectorAll(".popover").forEach((node) => node.remove());
  store.closeProject();
  document.body.replaceChildren();
});

describe("open-pages row", () => {
  it("stays hidden with no project and shows the seeded preview when one opens", () => {
    const { mount } = mountController();
    expect(mount.hidden).toBe(true);

    store.setProject(projectWithPages(3), null);
    expect(mount.hidden).toBe(false);
    expect(mount.getAttribute("role")).toBe("navigation");
    expect(mount.getAttribute("aria-label")).toBe("Open page tabs");
    expect(mount.querySelector(".open-pages-label")?.textContent).toBe("Open");
    expect(mount.querySelector(".open-pages-hint")?.textContent).toBe(
      "Click = preview · double-click = pin",
    );

    const list = mount.querySelector<HTMLElement>('[role="tablist"]');
    expect(list?.getAttribute("aria-label")).toBe("Open pages");
    expect(tabs(mount)).toHaveLength(1);
    expect(activeTab(mount)?.querySelector(".open-page-numeral")?.textContent).toBe("1");
    expect(mount.querySelector(".open-page-pin")).not.toBeNull();
    // The last tab cannot close, so it carries no close control.
    expect(mount.querySelector(".open-page-close")).toBeNull();
  });

  it("previews another page in the same tab and pins it after a double-click", () => {
    const { mount, controller } = mountController();
    store.setProject(projectWithPages(3), null);

    store.setPage(2);
    expect(tabs(mount)).toHaveLength(1);
    expect(activeTab(mount)?.querySelector(".open-page-numeral")?.textContent).toBe("2");

    controller.pinPage(pageIdFor(2));
    expect(mount.querySelector(".open-page-pin")).toBeNull();
    expect(mount.querySelector(".open-page-close")).toBeNull();
  });

  it("shows pinned tabs plus one preview tab with its pin icon", () => {
    const { mount, controller } = mountController();
    store.setProject(projectWithPages(3), null);

    store.setPage(2);
    controller.pinPage(pageIdFor(2));
    store.setPage(3);

    const all = tabs(mount);
    expect(all).toHaveLength(2);
    expect(all[0].getAttribute("aria-selected")).toBe("false");
    expect(all[0].querySelector(".open-page-pin")).toBeNull();
    expect(all[0].querySelector(".open-page-numeral")?.textContent).toBe("2");
    expect(all[1].getAttribute("aria-selected")).toBe("true");
    expect(all[1].querySelector(".open-page-pin")).not.toBeNull();
    expect(all[1].querySelector(".open-page-numeral")?.textContent).toBe("3");

    const close = mount.querySelector<HTMLElement>(".open-page-close");
    expect(close?.getAttribute("aria-label")).toBe("Close tab: Page 2");
  });

  it("opens the overflow list from the shared popover and activates an entry", () => {
    const { mount, controller, visited } = mountController();
    store.setProject(projectWithPages(3), null);
    store.setPage(2);
    controller.pinPage(pageIdFor(2));
    store.setPage(3);

    const overflow = mount.querySelector<HTMLButtonElement>(".open-pages-overflow");
    expect(overflow?.getAttribute("aria-label")).toBe("All open pages");
    overflow?.click();

    const popover = document.querySelector(".popover");
    expect(popover).not.toBeNull();
    const items = [...(popover?.querySelectorAll<HTMLElement>(".popover-item") ?? [])];
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Page 2");

    items[0].click();
    expect(visited).toContain(2);
    expect(activeTab(mount)?.querySelector(".open-page-numeral")?.textContent).toBe("2");
  });

  it("closes a non-active tab without moving the page and closes the active tab onto its neighbour", () => {
    const { mount, controller, visited } = mountController();
    store.setProject(projectWithPages(3), null);
    store.setPage(2);
    controller.pinPage(pageIdFor(2));
    store.setPage(3);

    controller.close(pageIdFor(2));
    expect(tabs(mount)).toHaveLength(1);
    expect(activeTab(mount)?.querySelector(".open-page-numeral")?.textContent).toBe("3");
    expect(visited).toHaveLength(0);

    // Page 3 is now the last tab and the active page; closing it is refused.
    controller.close(pageIdFor(3));
    expect(tabs(mount)).toHaveLength(1);

    store.setPage(1);
    controller.pinPage(pageIdFor(1));
    store.setPage(2);
    controller.pinPage(pageIdFor(2));
    store.setPage(3);
    // Tabs are now [1 pinned, 2 pinned, 3 preview]; close the active preview.
    controller.close(pageIdFor(3));
    expect(tabs(mount)).toHaveLength(2);
    expect(activeTab(mount)?.querySelector(".open-page-numeral")?.textContent).toBe("2");
    expect(visited).toContain(2);
  });

  it("prunes deleted pages and hides the row for a zero-page project", () => {
    const project = projectWithPages(2);
    const { mount } = mountController();
    store.setProject(project, null);
    store.setPage(2);
    expect(tabs(mount)).toHaveLength(1);

    store.deletePage(pageIdFor(2));
    expect(tabs(mount)).toHaveLength(1);
    expect(activeTab(mount)?.querySelector(".open-page-numeral")?.textContent).toBe("1");

    store.setProject(createProject(), null);
    expect(mount.hidden).toBe(true);
    expect(tabs(mount)).toHaveLength(0);
  });

  it("seeds a fresh preview when the project switches", () => {
    const { mount } = mountController();
    store.setProject(projectWithPages(3), null);
    store.setPage(3);
    expect(tabs(mount)).toHaveLength(1);

    store.setProject(projectWithPages(2), null);
    expect(tabs(mount)).toHaveLength(1);
    expect(activeTab(mount)?.querySelector(".open-page-numeral")?.textContent).toBe("1");
  });
});
