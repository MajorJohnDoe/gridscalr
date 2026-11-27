// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pageMenu } from "../src/features/pageMenu";
import { pageReorder } from "../src/features/pageReorder";
import { PAGE_WINDOW_SIZE, pageWindowState } from "../src/features/pageWindow";
import { pageStatus } from "../src/features/pageStatus";
import { createProject, defaultDocument } from "../src/model/layers";
import { store } from "../src/state/store";
import { renderPages } from "../src/ui/pageList";
import type { PanelActions } from "../src/ui/panels";
import type { ShellRefs } from "../src/ui/shell";
import { withTestPageIds } from "./helpers/pages";

function projectWithPages(count: number): ReturnType<typeof createProject> {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", count)));
}

interface Mounted {
  refs: ShellRefs;
  actions: PanelActions;
  render: () => void;
}

function mount(): Mounted {
  document.body.innerHTML = "";
  const dockBody = document.createElement("div");
  document.body.append(dockBody);
  const refs = { dockBody, dockTabs: [] } as unknown as ShellRefs;
  const renderRef: { current: () => void } = { current: () => undefined };
  const actions = {
    refresh: () => renderRef.current(),
    goToPage: (page: number) => store.setPage(page),
    getPageSize: () => undefined,
    getPageThumbnail: () => null,
    ensurePageSize: vi.fn(async () => undefined),
    requestPageThumbnail: vi.fn(async () => null),
    reorderPages: vi.fn(),
    addPages: vi.fn(),
    importProjectPages: vi.fn(),
    duplicatePage: vi.fn(),
    duplicatePages: vi.fn(),
    deletePage: vi.fn(),
    deletePages: vi.fn(),
    insertPage: vi.fn(),
  } as unknown as PanelActions;
  const render = () => renderPages(refs, actions);
  renderRef.current = render;
  return { refs, actions, render };
}

function card(refs: ShellRefs, page: number): HTMLElement {
  return refs.dockBody.querySelector<HTMLElement>(`.page-card[data-page="${page}"]`)!;
}

function click(target: HTMLElement, shiftKey = false): void {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey }));
}

beforeEach(() => {
  store.project = null;
  store.readOnly = false;
  pageStatus.reset();
  pageWindowState.reset();
  pageReorder.reset();
  localStorage.clear();
});

describe("Pages panel window", () => {
  it("mounts at most one window of cards and reports the range", () => {
    store.setProject(projectWithPages(150), "/tmp/page-list.gridscalr", false);
    store.ui.leftTab = "pages";
    store.ui.page = 1;
    const { refs, render } = mount();
    render();

    const cards = refs.dockBody.querySelectorAll(".page-card");
    expect(cards).toHaveLength(PAGE_WINDOW_SIZE);
    const bar = refs.dockBody.querySelector<HTMLElement>(".page-window-bar")!;
    expect(bar.textContent).toContain("Pages 1–120 of 150");
    expect(refs.dockBody.querySelectorAll(".page-window-bar")).toHaveLength(1);
  });

  it("jumps to a page and clamps a Shift range to the mounted window", () => {
    store.setProject(projectWithPages(150), "/tmp/page-list.gridscalr", false);
    store.ui.leftTab = "pages";
    store.ui.page = 1;
    const { refs, render } = mount();
    render();

    // Select page 1 as the anchor, then jump far away.
    click(card(refs, 1));
    expect(pageReorder.selectionIds()).toEqual(["page_1"]);

    const input = refs.dockBody.querySelector<HTMLInputElement>(".page-window-input")!;
    input.value = "140";
    input.dispatchEvent(new Event("change"));
    render();
    expect(store.ui.page).toBe(140);
    expect(card(refs, 140)).not.toBeNull();
    expect(refs.dockBody.querySelectorAll(".page-card")).toHaveLength(PAGE_WINDOW_SIZE);

    // Shift-click in the new window must not select the 139 hidden pages
    // between the stale anchor and the click.
    click(card(refs, 100), true);
    expect(pageReorder.selectionIds()).toEqual(["page_100"]);
    expect(refs.dockBody.querySelectorAll(".page-card")).toHaveLength(PAGE_WINDOW_SIZE);
  });

  it("recentres on the current page after Previous/Next, even with a selection", () => {
    store.setProject(projectWithPages(300), "/tmp/page-list.gridscalr", false);
    store.ui.leftTab = "pages";
    store.ui.page = 1;
    const { refs, actions, render } = mount();
    render();
    click(card(refs, 1));
    expect(pageReorder.selectionIds()).toEqual(["page_1"]);

    // Previous/Next pins the range without changing the drawing.
    pageWindowState.shift(300, PAGE_WINDOW_SIZE, "page_1");
    render();
    expect(pageWindowState.startIndex).toBe(PAGE_WINDOW_SIZE);
    expect(card(refs, PAGE_WINDOW_SIZE + 1)).not.toBeNull();

    // PageDown from the pinned range navigates to page 2 and follows it.
    pageMenu.handleKey(new KeyboardEvent("keydown", { key: "PageDown" }), actions);
    render();
    expect(store.ui.page).toBe(2);
    expect(pageWindowState.startIndex).toBe(0);
    expect(card(refs, 2)).not.toBeNull();
    expect(pageReorder.selectionIds()).toEqual(["page_1"]);
  });

  it("counts matching pages when a status filter narrows the list", () => {
    const project = projectWithPages(150);
    project.documents[0].kind = "tiff";
    store.setProject(project, "/tmp/page-list.gridscalr", false);
    store.ui.leftTab = "pages";
    store.ui.page = 1;
    pageStatus.setFilter("missingOcr");
    const { refs, render } = mount();
    render();

    const bar = refs.dockBody.querySelector<HTMLElement>(".page-window-bar")!;
    expect(bar.textContent).toContain("Matching pages 1–120 of 150");
    const input = refs.dockBody.querySelector<HTMLInputElement>(".page-window-input")!;
    expect(input.max).toBe("150");
    expect(input.getAttribute("aria-label")).toContain("matching");
    input.value = "130";
    input.dispatchEvent(new Event("change"));
    render();
    expect(store.ui.page).toBe(130);
    expect(card(refs, 130)).not.toBeNull();
  });

  it("moves focus to the current card when the focused page leaves the window", () => {
    store.setProject(projectWithPages(300), "/tmp/page-list.gridscalr", false);
    store.ui.leftTab = "pages";
    store.ui.page = 1;
    const { refs, render } = mount();
    render();
    card(refs, 1).focus();
    expect(document.activeElement).toBe(card(refs, 1));

    store.setPage(140);
    render();
    expect(document.activeElement?.getAttribute("data-page")).toBe("140");
  });

  it("keeps one range bar when a filtered status refresh rebuilds the panel", () => {
    store.setProject(projectWithPages(150), "/tmp/page-list.gridscalr", false);
    store.ui.leftTab = "pages";
    store.ui.page = 1;
    const { refs, render } = mount();
    render();
    expect(refs.dockBody.querySelectorAll(".page-window-bar")).toHaveLength(1);
    render();
    render();
    expect(refs.dockBody.querySelectorAll(".page-window-bar")).toHaveLength(1);
  });
});
