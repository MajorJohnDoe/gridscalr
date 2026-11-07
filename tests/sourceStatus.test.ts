// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/io/platform", () => ({
  isTauri: true,
  pathExists: vi.fn(),
  fileSize: vi.fn(),
}));

import { fileSize, pathExists } from "../src/io/platform";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import { sourceStatus } from "../src/source/sourceStatus";
import { store } from "../src/state/store";

function projectWithSize(sizeBytes = 100) {
  const project = createProject(defaultDocument("Plan.pdf", 2), createDefaultLayers());
  project.documents[0].path = "/drawings/plan.pdf";
  project.documents[0].sizeBytes = sizeBytes;
  return project;
}

beforeEach(() => {
  store.project = null;
  store.projectPath = null;
  vi.mocked(pathExists).mockReset();
  vi.mocked(fileSize).mockReset();
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
    await Promise.resolve();
    await Promise.resolve();
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
});
