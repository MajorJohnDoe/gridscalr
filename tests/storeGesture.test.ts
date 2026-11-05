// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import { Store } from "../src/state/store";

function makeStore(): Store {
  const store = new Store();
  store.setProject(createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers()), null);
  return store;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("canvas gesture revision", () => {
  it("bumps the project revision when a gesture commits a change", () => {
    const store = makeStore();
    const before = store.revision;

    store.beginGesture();
    store.project!.settings.snapTolerancePx = 12;
    store.endGesture();

    expect(store.revision).toBe(before + 1);
  });

  it("keeps the revision unchanged when a gesture changes nothing", () => {
    const store = makeStore();
    const before = store.revision;

    store.beginGesture();
    store.endGesture();

    expect(store.revision).toBe(before);
  });

  it("bumps the project revision when a cancelled gesture restores the snapshot", () => {
    const store = makeStore();
    const before = store.revision;
    const original = store.project!.settings.snapTolerancePx;

    store.beginGesture();
    store.project!.settings.snapTolerancePx = original + 4;
    store.cancelGesture();

    expect(store.project!.settings.snapTolerancePx).toBe(original);
    expect(store.revision).toBe(before + 1);
  });
});
