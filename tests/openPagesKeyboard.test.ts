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

function tabs(mount: HTMLElement): HTMLButtonElement[] {
  return [...mount.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

function tabFor(mount: HTMLElement, pageId: string): HTMLButtonElement {
  const tab = tabs(mount).find((entry) => entry.dataset.pageId === pageId);
  if (!tab) throw new Error(`missing tab ${pageId}`);
  return tab;
}

function activeTab(mount: HTMLElement): HTMLButtonElement | undefined {
  return tabs(mount).find((tab) => tab.getAttribute("aria-selected") === "true");
}

function press(target: EventTarget, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
}

function menuItem(label: string): HTMLButtonElement {
  const item = [...document.querySelectorAll<HTMLButtonElement>(".popover .popover-item")].find(
    (button) => button.querySelector("span")?.textContent === label,
  );
  if (!item) throw new Error(`missing menu item ${label}`);
  return item;
}

function menuLabels(): string[] {
  return [...document.querySelectorAll<HTMLElement>(".popover .popover-item > span")].map(
    (node) => node.textContent ?? "",
  );
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Page 1 is pinned and page 2 is the active preview. */
function pinnedPlusPreview(): Mounted {
  const mounted = mountController();
  store.setProject(projectWithPages(3), null);
  mounted.controller.pinPage(pageIdFor(1));
  store.setPage(2);
  return mounted;
}

afterEach(() => {
  current?.dispose();
  current = null;
  document.querySelectorAll(".popover").forEach((node) => node.remove());
  store.closeProject();
  document.body.replaceChildren();
});

describe("open-pages keyboard and focus", () => {
  it("keeps exactly one tab in the tab order and moves with the arrow keys", () => {
    const { mount } = pinnedPlusPreview();
    const initial = tabs(mount);
    expect(initial.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
    expect(initial.filter((tab) => tab.tabIndex === 0)[0].dataset.pageId).toBe(pageIdFor(2));

    press(tabFor(mount, pageIdFor(2)), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabFor(mount, pageIdFor(1)));
    expect(tabFor(mount, pageIdFor(1)).tabIndex).toBe(0);
    expect(tabFor(mount, pageIdFor(2)).tabIndex).toBe(-1);

    // Wrapping keeps both ends reachable without a disabled dead end.
    press(tabFor(mount, pageIdFor(1)), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabFor(mount, pageIdFor(2)));
    expect(tabFor(mount, pageIdFor(2)).tabIndex).toBe(0);
  });

  it("activates the focused tab with Enter and Space", () => {
    const { mount, visited } = pinnedPlusPreview();
    const pinned = tabFor(mount, pageIdFor(1));
    pinned.focus();

    press(pinned, { key: "Enter" });
    expect(visited).toContain(1);
    expect(activeTab(mount)?.dataset.pageId).toBe(pageIdFor(1));
    expect(document.activeElement).toBe(tabFor(mount, pageIdFor(1)));

    tabFor(mount, pageIdFor(2)).focus();
    press(tabFor(mount, pageIdFor(2)), { key: " " });
    expect(visited).toContain(2);
    expect(activeTab(mount)?.dataset.pageId).toBe(pageIdFor(2));
  });

  it("closes the focused tab with Delete or Backspace and keeps focus visible", () => {
    const { mount, visited } = pinnedPlusPreview();
    const preview = tabFor(mount, pageIdFor(2));
    preview.focus();

    press(preview, { key: "Delete" });
    expect(tabs(mount)).toHaveLength(1);
    expect(activeTab(mount)?.dataset.pageId).toBe(pageIdFor(1));
    expect(visited).toContain(1);
    expect(document.activeElement).toBe(tabFor(mount, pageIdFor(1)));
    expect(document.activeElement?.getAttribute("role")).toBe("tab");

    // The last tab cannot close; Backspace stays inert.
    press(tabFor(mount, pageIdFor(1)), { key: "Backspace" });
    expect(tabs(mount)).toHaveLength(1);
    expect(document.activeElement).toBe(tabFor(mount, pageIdFor(1)));
  });

  it("opens the tab menu with Shift+F10 and the ContextMenu key", async () => {
    const { mount } = pinnedPlusPreview();
    const pinned = tabFor(mount, pageIdFor(1));
    pinned.focus();

    press(pinned, { key: "F10", shiftKey: true });
    expect(document.querySelector(".popover")).not.toBeNull();
    expect(menuLabels()).toEqual(["Pin tab", "Preview", "Close tab", "Close other tabs"]);
    // Pin is disabled on a pinned tab, so the first enabled item takes focus.
    expect((document.activeElement as HTMLElement).textContent).toContain("Preview");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flush();
    expect(document.querySelector(".popover")).toBeNull();
    expect(document.activeElement).toBe(pinned);

    press(pinned, { key: "ContextMenu" });
    expect(document.querySelector(".popover")).not.toBeNull();
  });

  it("opens the menu from a right-click and applies Pin, Preview and Close others", async () => {
    const { mount } = pinnedPlusPreview();
    const preview = tabFor(mount, pageIdFor(2));
    preview.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 30 }),
    );
    expect(menuLabels()).toEqual(["Pin tab", "Preview", "Close tab", "Close other tabs"]);
    expect(menuItem("Pin tab").disabled).toBe(false);
    expect(menuItem("Preview").disabled).toBe(true);

    menuItem("Pin tab").click();
    expect(activeTab(mount)?.dataset.pageId).toBe(pageIdFor(2));
    expect(mount.querySelector(".open-page-pin")).toBeNull();
    expect(document.activeElement).toBe(tabFor(mount, pageIdFor(2)));

    tabFor(mount, pageIdFor(2)).dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 30 }),
    );
    expect(menuItem("Preview").disabled).toBe(false);
    menuItem("Preview").click();
    expect(mount.querySelectorAll(".open-page-tab-cell.is-preview")).toHaveLength(1);
    expect(activeTab(mount)?.dataset.pageId).toBe(pageIdFor(2));

    tabFor(mount, pageIdFor(2)).dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 30 }),
    );
    menuItem("Close other tabs").click();
    expect(tabs(mount)).toHaveLength(1);
    expect(tabs(mount)[0].dataset.pageId).toBe(pageIdFor(2));
    expect(document.activeElement).toBe(tabFor(mount, pageIdFor(2)));
    // Close others removes tabs only; the project keeps all three pages.
    expect(store.project?.pages).toHaveLength(3);
  });

  it("restores focus to the surviving tab after a menu close", () => {
    const { mount } = pinnedPlusPreview();
    tabFor(mount, pageIdFor(2)).dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 30 }),
    );
    menuItem("Close tab").click();
    expect(tabs(mount)).toHaveLength(1);
    expect(document.activeElement).toBe(tabFor(mount, pageIdFor(1)));
  });
});
