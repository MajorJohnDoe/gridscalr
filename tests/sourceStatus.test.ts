// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestPageIds } from "./helpers/pages";

vi.mock("../src/io/platform", () => ({
  isTauri: true,
  pathExists: vi.fn(),
  fileSize: vi.fn(),
}));

import { fileSize, pathExists } from "../src/io/platform";
import { pageStatus } from "../src/features/pageStatus";
import { createProject, defaultDocument } from "../src/model/layers";
import { sourceStatus } from "../src/source/sourceStatus";
import { store } from "../src/state/store";
import type { PanelActions } from "../src/ui/panels";
import type { ShellRefs } from "../src/ui/shell";
import { refreshSourceStatusPanels } from "../src/ui/sidebar";

function projectWithSize(sizeBytes = 100) {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 2)));
  project.documents[0].path = "/drawings/plan.pdf";
  project.documents[0].sizeBytes = sizeBytes;
  return project;
}

function fakeRefs(dockBody = document.createElement("div")): ShellRefs {
  const element = () => document.createElement("div");
  return {
    statusCoords: element(),
    statusLayer: element(),
    statusProject: element(),
    statusAutosave: element(),
    statusSources: element(),
    statusWarning: element(),
    statusCalibration: element(),
    dockBody,
  } as unknown as ShellRefs;
}

const actions = {
  getPageSize: () => undefined,
  refresh: () => undefined,
} as unknown as PanelActions;

/** The mounted Pages list with one card, as the badge refresh expects it. */
function mountedPageCard(pageId: string) {
  const dockBody = document.createElement("div");
  const list = document.createElement("div");
  list.className = "page-list";
  const card = document.createElement("button");
  card.className = "page-card";
  card.dataset.pageId = pageId;
  const info = document.createElement("div");
  info.className = "page-info";
  card.append(info);
  list.append(card);
  dockBody.append(list);
  return { dockBody, card };
}

beforeEach(async () => {
  sourceStatus.stop();
  store.project = null;
  store.projectPath = null;
  pageStatus.reset();
  vi.mocked(pathExists).mockReset();
  vi.mocked(fileSize).mockReset();
  // Clear the statuses left by the previous test without notifying anyone.
  await sourceStatus.refresh();
});

describe("source file status", () => {
  it("reports a missing source drawing", async () => {
    store.project = projectWithSize();
    vi.mocked(pathExists).mockResolvedValue(false);
    await sourceStatus.refresh();
    expect(sourceStatus.summary.missing).toBe(1);
    expect(sourceStatus.summary.changed).toBe(0);
    expect(sourceStatus.summary.statuses[0].state).toBe("missing");
  });

  it("reports a source drawing whose size changed", async () => {
    store.project = projectWithSize(100);
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(fileSize).mockResolvedValue(80);
    await sourceStatus.refresh();
    expect(sourceStatus.summary.changed).toBe(1);
    expect(sourceStatus.summary.statuses[0].state).toBe("changed");
  });

  it("accepts an unchanged source drawing", async () => {
    store.project = projectWithSize(100);
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(fileSize).mockResolvedValue(100);
    await sourceStatus.refresh();
    expect(sourceStatus.summary.missing).toBe(0);
    expect(sourceStatus.summary.changed).toBe(0);
    expect(sourceStatus.summary.statuses[0].state).toBe("ok");
  });

  it("skips embedded TIF documents", async () => {
    const project = projectWithSize();
    project.documents[0].kind = "tiff";
    project.documents[0].embeddedPdf = "JVBERi0xLjQK";
    store.project = project;
    await sourceStatus.refresh();
    expect(sourceStatus.summary.statuses).toEqual([]);
    expect(pathExists).not.toHaveBeenCalled();
  });

  it("starts and stops the desktop polling loop", async () => {
    store.project = projectWithSize();
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(fileSize).mockResolvedValue(100);
    sourceStatus.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    sourceStatus.stop();
    expect(sourceStatus.summary.statuses.length).toBe(1);
  });

  it("notifies subscribers and clears when the project closes", async () => {
    store.project = projectWithSize();
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(fileSize).mockResolvedValue(100);
    let notifications = 0;
    const unsubscribe = sourceStatus.subscribe(() => {
      notifications += 1;
    });
    await sourceStatus.refresh();
    expect(notifications).toBe(1);
    store.project = null;
    await sourceStatus.refresh();
    expect(notifications).toBe(2);
    expect(sourceStatus.summary.checked).toBe(false);
    unsubscribe();
  });

  it("does not notify subscribers when a check finds the same status set", async () => {
    store.project = projectWithSize();
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(fileSize).mockResolvedValue(100);
    let notifications = 0;
    const unsubscribe = sourceStatus.subscribe(() => {
      notifications += 1;
    });
    await sourceStatus.refresh();
    await sourceStatus.refresh();
    await sourceStatus.refresh();
    expect(notifications).toBe(1);
    unsubscribe();
  });

  it("notifies again when a source becomes changed", async () => {
    store.project = projectWithSize(100);
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(fileSize).mockResolvedValue(100);
    let notifications = 0;
    const unsubscribe = sourceStatus.subscribe(() => {
      notifications += 1;
    });
    await sourceStatus.refresh();
    vi.mocked(fileSize).mockResolvedValue(80);
    await sourceStatus.refresh();
    expect(notifications).toBe(2);
    await sourceStatus.refresh();
    expect(notifications).toBe(2);
    unsubscribe();
  });

  it("never emits a store event", async () => {
    store.project = projectWithSize();
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(fileSize).mockResolvedValue(100);
    const emit = vi.spyOn(store, "emit");
    await sourceStatus.refresh();
    expect(emit).not.toHaveBeenCalled();
    emit.mockRestore();
  });

  it("updates the status chip and page badge when a source changes", async () => {
    store.project = projectWithSize(100);
    store.ui.leftTab = "pages";
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(fileSize).mockResolvedValue(100);
    const { dockBody, card } = mountedPageCard("page_1");
    const refs = fakeRefs(dockBody);
    const unsubscribe = sourceStatus.subscribe(() => refreshSourceStatusPanels(refs, actions));

    await sourceStatus.refresh();
    expect(refs.statusSources.textContent).toBe("");

    vi.mocked(fileSize).mockResolvedValue(80);
    await sourceStatus.refresh();

    expect(refs.statusSources.textContent).toContain("source changed");
    expect(card.querySelector(".page-badge")?.getAttribute("data-badge")).toBe("sourceChanged");
    expect(card.getAttribute("aria-label")).toContain("Source changed");
    unsubscribe();
  });
});
