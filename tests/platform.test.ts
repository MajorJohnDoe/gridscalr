import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addRecent,
  basename,
  clearRecent,
  formatBytes,
  getRecent,
  joinPath,
} from "../src/io/platform";
import type { RecentEntry } from "../src/model/types";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function recent(name: string, path: string, kind: RecentEntry["kind"]): RecentEntry {
  return { name, path, kind, at: "2026-11-07T00:00:00.000Z" };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("path helpers", () => {
  it("takes the last segment on both separators", () => {
    expect(basename("/home/user/plan.pdf")).toBe("plan.pdf");
    expect(basename("C:\\projects\\plan.pdf")).toBe("plan.pdf");
    expect(basename("plan.pdf")).toBe("plan.pdf");
    expect(basename("")).toBe("");
  });

  it("joins paths with the separator already in use", () => {
    expect(joinPath("/home/user", "plan.pdf")).toBe("/home/user/plan.pdf");
    expect(joinPath("/home/user/", "plan.pdf")).toBe("/home/user/plan.pdf");
    expect(joinPath("C:\\projects", "plan.pdf")).toBe("C:\\projects\\plan.pdf");
    expect(joinPath("C:\\projects\\", "plan.pdf")).toBe("C:\\projects\\plan.pdf");
  });

  it("formats bytes for the recent-file status", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});

describe("recent files", () => {
  it("starts empty and tolerates malformed storage", () => {
    expect(getRecent()).toEqual([]);
    localStorage.setItem("gridscalr.recent.v1", "{not json");
    expect(getRecent()).toEqual([]);
    localStorage.setItem("gridscalr.recent.v1", JSON.stringify([{ name: "no path" }]));
    expect(getRecent()).toEqual([]);
  });

  it("puts the newest entry first and replaces the same path and kind", () => {
    addRecent(recent("A", "/a.pdf", "pdf"));
    addRecent(recent("B", "/b.gridscalr", "project"));
    addRecent(recent("A again", "/a.pdf", "pdf"));

    expect(getRecent().map((entry) => entry.name)).toEqual(["A again", "B"]);
  });

  it("keeps the same path when the kind differs and caps the list at ten", () => {
    addRecent(recent("drawing", "/same", "pdf"));
    addRecent(recent("project", "/same", "project"));
    expect(getRecent()).toHaveLength(2);

    for (let index = 0; index < 12; index += 1) {
      addRecent(recent(`file ${index}`, `/file-${index}`, "pdf"));
    }
    const entries = getRecent();
    expect(entries).toHaveLength(10);
    expect(entries[0].name).toBe("file 11");
  });

  it("ignores empty paths and can be cleared", () => {
    addRecent(recent("empty", "", "pdf"));
    expect(getRecent()).toEqual([]);

    addRecent(recent("A", "/a.pdf", "pdf"));
    clearRecent();
    expect(getRecent()).toEqual([]);
  });
});
