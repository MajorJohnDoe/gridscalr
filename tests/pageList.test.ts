// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pageEditTargets, pageMenu } from "../src/features/pageMenu";
import { pageReorder } from "../src/features/pageReorder";
import { PAGE_WINDOW_SIZE, pageWindowState } from "../src/features/pageWindow";
import { pageStatus } from "../src/features/pageStatus";
import { createProject, defaultDocument } from "../src/model/layers";
import { store } from "../src/state/store";
import { refreshPageStatusBadges, renderPages } from "../src/ui/pageList";
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

  it("recentres on the current page after Previous/Next and drops the off-window selection", () => {
    store.setProject(projectWithPages(300), "/tmp/page-list.gridscalr", false);
    store.ui.leftTab = "pages";
    store.ui.page = 1;
    const { refs, actions, render } = mount();
    render();
    click(card(refs, 1));
    expect(pageReorder.selectionIds()).toEqual(["page_1"]);

    // Previous/Next pins the range without changing the drawing. Page 1 is no
    // longer mounted, so it leaves the selection.
    pageWindowState.shift(300, PAGE_WINDOW_SIZE, "page_1");
    render();
    expect(pageWindowState.startIndex).toBe(PAGE_WINDOW_SIZE);
    expect(card(refs, PAGE_WINDOW_SIZE + 1)).not.toBeNull();
    expect(pageReorder.selectionIds()).toEqual([]);

    // PageDown from the pinned range navigates to page 2 and follows it.
    pageMenu.handleKey(new KeyboardEvent("keydown", { key: "PageDown" }), actions);
    render();
    expect(store.ui.page).toBe(2);
    expect(pageWindowState.startIndex).toBe(0);
    expect(card(refs, 2)).not.toBeNull();
    expect(pageReorder.selectionIds()).toEqual([]);
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

  it("drops a Ctrl/Cmd selection when Previous/Next leaves it off-screen", () => {
    const project = projectWithPages(300);
    store.setProject(project, "/tmp/page-list.gridscalr", false);
    store.ui.leftTab = "pages";
    store.ui.page = 1;
    const { refs, render } = mount();
    render();
    card(refs, 1).dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    card(refs, 2).dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    expect(pageReorder.selectionIds()).toEqual(["page_1", "page_2"]);
    expect(pageEditTargets(store.project!, "page_1")).toEqual(["page_1", "page_2"]);

    pageWindowState.shift(300, PAGE_WINDOW_SIZE, "page_1");
    render();
    expect(card(refs, PAGE_WINDOW_SIZE + 1)).not.toBeNull();
    // The stale Ctrl selection cannot reach a bulk delete; only the current
    // page remains as the fallback target.
    expect(pageReorder.selectionIds()).toEqual([]);
    expect(pageEditTargets(store.project!, "page_1")).toEqual(["page_1"]);
  });

  it("drops a selection that a status filter no longer shows", () => {
    const project = projectWithPages(150);
    project.pages[0].state = { scaleLocked: true };
    store.setProject(project, "/tmp/page-list.gridscalr", false);
    store.ui.leftTab = "pages";
    store.ui.page = 1;
    const { refs, render } = mount();
    render();
    card(refs, 1).dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    card(refs, 5).dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    expect(pageReorder.selectionIds()).toEqual(["page_1", "page_5"]);

    pageStatus.setFilter("lockedScale");
    render();
    expect(refs.dockBody.querySelectorAll(".page-card")).toHaveLength(1);
    expect(pageReorder.selectionIds()).toEqual(["page_1"]);
  });

  it("restores focus to the jump field across a filtered status refresh", () => {
    const project = projectWithPages(150);
    project.documents[0].kind = "tiff";
    store.setProject(project, "/tmp/page-list.gridscalr", false);
    store.ui.leftTab = "pages";
    store.ui.page = 1;
    pageStatus.setFilter("missingOcr");
    const { refs, actions, render } = mount();
    render();
    const input = refs.dockBody.querySelector<HTMLInputElement>(".page-window-input")!;
    input.focus();
    expect(document.activeElement).toBe(input);

    refreshPageStatusBadges(refs, actions);
    const next = refs.dockBody.querySelector<HTMLInputElement>(".page-window-input")!;
    expect(next).not.toBe(input);
    expect(document.activeElement).toBe(next);
    expect(next.getAttribute("data-page-window-action")).toBe("jump");
  });

  it("hands the pending range focus to the filter when the list empties", () => {
    const project = projectWithPages(150);
    project.documents[0].kind = "tiff";
    store.setProject(project, "/tmp/page-list.gridscalr", false);
    store.ui.leftTab = "pages";
    store.ui.page = 1;
    pageStatus.setFilter("missingOcr");
    const { refs, actions, render } = mount();
    render();
    refs.dockBody.querySelector<HTMLInputElement>(".page-window-input")!.focus();

    // The scans gain a text layer, so the filter matches nothing and the range
    // bar that owned the focus is removed with the list.
    project.documents[0].kind = "pdf";
    refreshPageStatusBadges(refs, actions);
    expect(refs.dockBody.querySelector(".page-list")).toBeNull();
    const chip = refs.dockBody.querySelector<HTMLElement>(
      '.page-status-filter[data-filter="missingOcr"]',
    )!;
    expect(document.activeElement).toBe(chip);

    // The cleared request must not pull focus back to a range control on the
    // next render; focus returns to the page card instead.
    pageStatus.setFilter("all");
    render();
    expect(document.activeElement?.getAttribute("data-page")).toBe("1");
  });

  it("keeps a moved block selected when a render lands before the reveal", async () => {
    const project = projectWithPages(300);
    store.setProject(project, "/tmp/page-list.gridscalr", false);
    store.ui.leftTab = "pages";
    store.ui.page = 1;
    const { refs, actions, render } = mount();
    render();

    // A block that does not contain the page the editor shows: it is mounted
    // at the top, then the move sends it past the end of the window.
    card(refs, 2).dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    card(refs, 3).dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    expect(pageReorder.selectionIds()).toEqual(["page_2", "page_3"]);

    let resolveReorder!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveReorder = resolve;
    });
    vi.mocked(actions.reorderPages).mockImplementation((pageIds, insertionIndex) => {
      // The store applies the move and emits synchronously, so the panel
      // renders while the checkpoint is still awaiting. That render follows the
      // current page and prunes the moved block from the selection.
      store.reorderPages(pageIds, insertionIndex);
      render();
      return pending;
    });

    card(refs, 3).dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", altKey: true, bubbles: true }),
    );
    expect(pageReorder.selectionIds()).toEqual([]);

    resolveReorder();
    await pending;
    // The reveal mounts the block again, and the selection comes with it, so a
    // follow-up bulk command still acts on the moved pages.
    expect(pageReorder.selectionIds()).toEqual(["page_2", "page_3"]);
    expect(pageEditTargets(store.project!, "page_1")).toEqual(["page_2", "page_3"]);
  });
});
