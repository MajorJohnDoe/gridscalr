// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/state/snapshot", async (importOriginal) => {
  const actual = await importOriginal<{ serializeProject: (project: Project) => string }>();
  return { ...actual, serializeProject: vi.fn(actual.serializeProject) };
});

import { serializeProject } from "../src/state/snapshot";
import { parseProject } from "../src/io/projectFile";
import { createProject, defaultDocument } from "../src/model/layers";
import type { ImageAsset, MarkupItem, Project } from "../src/model/types";
import { Store } from "../src/state/store";
import { withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";

const PNG_DATA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG_DATA =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

/**
 * The snapshot form this phase replaced: a `JSON.stringify` replacer that drops
 * every string equal to an embedded image payload. Kept here so the new
 * serializer is compared against the shipped text, not against itself.
 */
function legacySnapshot(project: Project): string {
  const payloads = new Set<string>();
  for (const asset of Object.values(project.assets ?? {})) {
    if (asset.data) payloads.add(asset.data);
  }
  return JSON.stringify(project, (_key, value) =>
    typeof value === "string" && payloads.has(value) ? undefined : value,
  );
}

function asset(id: string, mime: ImageAsset["mime"], data: string): ImageAsset {
  return {
    id,
    name: `${id}.${mime === "image/png" ? "png" : "jpg"}`,
    mime,
    width: 1,
    height: 1,
    byteSize: data.length,
    data,
  };
}

function demoProject(): Project {
  return parseProject(readFileSync(resolve("fixtures/demo-project.gridscalr"), "utf8"));
}

function legacyProject(schema: string): Project {
  return parseProject(readFileSync(resolve(`fixtures/legacy/${schema}.gridscalr`), "utf8"));
}

function measureItem(project: Project, id: string): MarkupItem {
  return {
    id,
    pageId: project.pages[0].id,
    kind: "length",
    points: [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function smallProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  measure.items.push(measureItem(project, "item_length"));
  return project;
}

function serializeCount(): number {
  return vi.mocked(serializeProject).mock.calls.length;
}

describe("snapshot text is byte-identical without the replacer", () => {
  it("matches the previous replacer text for the documentation demo project", () => {
    const project = demoProject();
    const expected = legacySnapshot(project);
    expect(serializeProject(project)).toBe(expected);
    expect(serializeProject(project)).toBe(expected);
  });

  it("matches for a committed project fixture with an embedded PNG payload", () => {
    const project = legacyProject("schema-28");
    expect(Object.values(project.assets)).toHaveLength(1);
    expect(Object.values(project.assets)[0].data.startsWith("data:image/png")).toBe(true);

    const expected = legacySnapshot(project);
    expect(serializeProject(project)).toBe(expected);
    expect(serializeProject(project)).toBe(expected);
    expect(Object.values(project.assets)[0].data.startsWith("data:image/png")).toBe(true);
  });

  it("matches for PNG and JPEG payloads added in memory, and restores them", () => {
    const project = demoProject();
    project.assets.asset_png = asset("asset_png", "image/png", PNG_DATA);
    project.assets.asset_jpeg = asset("asset_jpeg", "image/jpeg", JPEG_DATA);

    const expected = legacySnapshot(project);
    expect(serializeProject(project)).toBe(expected);
    expect(serializeProject(project)).toBe(expected);
    expect(project.assets.asset_png.data).toBe(PNG_DATA);
    expect(project.assets.asset_jpeg.data).toBe(JPEG_DATA);
    expect(serializeProject(project)).not.toContain("base64");
  });
});

describe("history serialisation count", () => {
  it("serialises once per discrete edit", () => {
    const store = new Store();
    store.setProject(smallProject(), null);
    vi.mocked(serializeProject).mockClear();

    store.mutate((project) => {
      project.settings.snapTolerancePx = 12;
    });
    expect(serializeCount()).toBe(1);
    store.mutate((project) => {
      project.settings.snapTolerancePx = 13;
    });
    expect(serializeCount()).toBe(2);
    expect(store.canUndo).toBe(true);
  });

  it("serialises once per completed gesture, not twice", () => {
    const store = new Store();
    store.setProject(smallProject(), null);
    vi.mocked(serializeProject).mockClear();

    store.beginGesture();
    store.project!.settings.snapTolerancePx = 12;
    store.noteGestureChange();
    store.endGesture();

    expect(serializeCount()).toBe(1);
    expect(store.canUndo).toBe(true);
  });

  it("pushes nothing and serialises nothing for a gesture that changed nothing", () => {
    const store = new Store();
    store.setProject(smallProject(), null);
    vi.mocked(serializeProject).mockClear();

    store.beginGesture();
    store.endGesture();

    expect(serializeCount()).toBe(0);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
  });

  it("serialises nothing extra on undo or redo", () => {
    const store = new Store();
    store.setProject(smallProject(), null);
    store.mutate((project) => {
      const measure = project.layers.find((layer) => layer.kind === "measure")!;
      measure.items[0].label = "Edited";
    });
    vi.mocked(serializeProject).mockClear();

    store.undo();
    expect(serializeCount()).toBe(0);
    store.redo();
    expect(serializeCount()).toBe(0);
  });

  it("serialises nothing when a gesture is cancelled", () => {
    const store = new Store();
    store.setProject(smallProject(), null);
    vi.mocked(serializeProject).mockClear();

    store.beginGesture();
    store.project!.settings.snapTolerancePx = 21;
    store.noteGestureChange();
    store.cancelGesture();

    expect(serializeCount()).toBe(0);
    expect(store.project!.settings.snapTolerancePx).not.toBe(21);
    expect(store.canUndo).toBe(false);
  });
});

describe("history content is unchanged", () => {
  it("undoes and redoes an item edit in one step", () => {
    const store = new Store();
    store.setProject(smallProject(), null);
    const measure = () => store.project!.layers.find((layer) => layer.kind === "measure")!;
    const original = measure().items[0].label;

    store.mutate((project) => {
      const layer = project.layers.find((entry) => entry.kind === "measure")!;
      layer.items[0].label = "Edited";
    });
    expect(measure().items[0].label).toBe("Edited");

    store.undo();
    expect(measure().items[0].label).toBe(original);
    store.redo();
    expect(measure().items[0].label).toBe("Edited");
  });

  it("keeps an embedded image payload available across undo and redo", () => {
    const project = smallProject();
    project.assets.asset_png = asset("asset_png", "image/png", PNG_DATA);
    const store = new Store();
    store.setProject(project, null);

    store.mutate((next) => {
      delete next.assets.asset_png;
    });
    expect(store.project!.assets.asset_png).toBeUndefined();
    store.undo();
    expect(store.project!.assets.asset_png.data).toBe(PNG_DATA);
    store.redo();
    expect(store.project!.assets.asset_png).toBeUndefined();
    store.undo();
    expect(store.project!.assets.asset_png.data).toBe(PNG_DATA);
  });

  it("keeps one undo step for a page reorder and restores the page order", () => {
    const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 3)));
    const store = new Store();
    store.setProject(project, null);
    const before = store.project!.pages.map((page) => page.id);

    expect(store.reorderPage(before[0], 2)).toBe(true);
    expect(store.project!.pages.map((page) => page.id)).not.toEqual(before);
    store.undo();
    expect(store.project!.pages.map((page) => page.id)).toEqual(before);
    store.redo();
    expect(store.project!.pages.map((page) => page.id)).not.toEqual(before);
  });
});
