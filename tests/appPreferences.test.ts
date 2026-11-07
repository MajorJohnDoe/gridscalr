import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_APP_PREFERENCES,
  loadAppPreferences,
  resetAppPreferences,
  saveAppPreferences,
} from "../src/io/appPreferences";

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

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("app preferences", () => {
  it("returns the defaults without stored preferences", () => {
    expect(loadAppPreferences()).toEqual(DEFAULT_APP_PREFERENCES);
    expect(DEFAULT_APP_PREFERENCES).toEqual({ language: "system", csvFormat: "locale" });
  });

  it("ignores malformed JSON and invalid values", () => {
    localStorage.setItem("gridscalr.preferences.v1", "{not json");
    expect(loadAppPreferences()).toEqual(DEFAULT_APP_PREFERENCES);

    localStorage.setItem(
      "gridscalr.preferences.v1",
      JSON.stringify({ language: "klingon", csvFormat: "semicolon" }),
    );
    expect(loadAppPreferences()).toEqual(DEFAULT_APP_PREFERENCES);
  });

  it("loads valid partial preferences and keeps defaults for missing fields", () => {
    localStorage.setItem("gridscalr.preferences.v1", JSON.stringify({ language: "sv" }));
    expect(loadAppPreferences()).toEqual({ language: "sv", csvFormat: "locale" });

    localStorage.setItem("gridscalr.preferences.v1", JSON.stringify({ csvFormat: "interchange" }));
    expect(loadAppPreferences()).toEqual({ language: "system", csvFormat: "interchange" });
  });

  it("merges patches and persists them", () => {
    const saved = saveAppPreferences({ language: "en" });
    expect(saved).toEqual({ language: "en", csvFormat: "locale" });
    expect(loadAppPreferences()).toEqual(saved);

    const next = saveAppPreferences({ csvFormat: "interchange" });
    expect(next).toEqual({ language: "en", csvFormat: "interchange" });
    expect(loadAppPreferences()).toEqual(next);
  });

  it("resets to the defaults", () => {
    saveAppPreferences({ language: "sv", csvFormat: "interchange" });
    expect(resetAppPreferences()).toEqual(DEFAULT_APP_PREFERENCES);
    expect(loadAppPreferences()).toEqual(DEFAULT_APP_PREFERENCES);
  });
});
