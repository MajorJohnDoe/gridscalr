import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_APP_PREFERENCES,
  loadAppPreferences,
  normalizeBackupPreference,
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
    expect(DEFAULT_APP_PREFERENCES).toEqual({
      language: "system",
      csvFormat: "locale",
      theme: "medium-grey",
      autosave: { enabled: true, intervalSeconds: 15 },
      backups: { retention: 3 },
    });
  });

  it("ignores malformed JSON and invalid values", () => {
    localStorage.setItem("gridscalr.preferences.v1", "{not json");
    expect(loadAppPreferences()).toEqual(DEFAULT_APP_PREFERENCES);

    localStorage.setItem(
      "gridscalr.preferences.v1",
      JSON.stringify({ language: "klingon", csvFormat: "semicolon", theme: "neon" }),
    );
    expect(loadAppPreferences()).toEqual(DEFAULT_APP_PREFERENCES);

    localStorage.setItem(
      "gridscalr.preferences.v1",
      JSON.stringify({ autosave: { enabled: "yes", intervalSeconds: 7 } }),
    );
    expect(loadAppPreferences().autosave).toEqual({ enabled: true, intervalSeconds: 15 });
    expect(loadAppPreferences()).toEqual({
      ...DEFAULT_APP_PREFERENCES,
      autosave: { enabled: true, intervalSeconds: 15 },
      backups: { retention: 3 },
    });
  });

  it("loads valid partial preferences and keeps defaults for missing fields", () => {
    localStorage.setItem("gridscalr.preferences.v1", JSON.stringify({ language: "sv" }));
    expect(loadAppPreferences()).toEqual({
      language: "sv",
      csvFormat: "locale",
      theme: "medium-grey",
      autosave: { enabled: true, intervalSeconds: 15 },
      backups: { retention: 3 },
    });

    localStorage.setItem("gridscalr.preferences.v1", JSON.stringify({ csvFormat: "interchange" }));
    expect(loadAppPreferences()).toEqual({
      language: "system",
      csvFormat: "interchange",
      theme: "medium-grey",
      autosave: { enabled: true, intervalSeconds: 15 },
      backups: { retention: 3 },
    });
  });

  it("migrates the stored shape without losing the other preferences", () => {
    localStorage.setItem(
      "gridscalr.preferences.v1",
      JSON.stringify({ language: "sv", csvFormat: "interchange", theme: "navy" }),
    );
    expect(loadAppPreferences()).toEqual({
      language: "sv",
      csvFormat: "interchange",
      theme: "navy",
      autosave: { enabled: true, intervalSeconds: 15 },
      backups: { retention: 3 },
    });
  });

  it("normalizes each autosave field independently", () => {
    localStorage.setItem(
      "gridscalr.preferences.v1",
      JSON.stringify({ autosave: { enabled: false, intervalSeconds: 60 } }),
    );
    expect(loadAppPreferences().autosave).toEqual({ enabled: false, intervalSeconds: 60 });

    localStorage.setItem(
      "gridscalr.preferences.v1",
      JSON.stringify({ autosave: { enabled: false, intervalSeconds: 45 } }),
    );
    expect(loadAppPreferences().autosave).toEqual({ enabled: false, intervalSeconds: 15 });

    localStorage.setItem(
      "gridscalr.preferences.v1",
      JSON.stringify({ autosave: { enabled: "later", intervalSeconds: 30 } }),
    );
    expect(loadAppPreferences().autosave).toEqual({ enabled: true, intervalSeconds: 30 });
  });

  it("normalizes backup retention inside the supported range", () => {
    expect(normalizeBackupPreference({ retention: 5 })).toEqual({ retention: 5 });
    expect(normalizeBackupPreference({ retention: 2 })).toEqual({ retention: 2 });
    expect(normalizeBackupPreference({ retention: 10 })).toEqual({ retention: 10 });
    for (const invalid of [1, 11, 0, -3, 3.5, "4", null, undefined]) {
      expect(normalizeBackupPreference({ retention: invalid })).toEqual({ retention: 3 });
    }
    expect(normalizeBackupPreference(null)).toEqual({ retention: 3 });

    localStorage.setItem("gridscalr.preferences.v1", JSON.stringify({ backups: { retention: 7 } }));
    expect(loadAppPreferences().backups).toEqual({ retention: 7 });
    expect(loadAppPreferences().language).toBe("system");
  });

  it("maps legacy theme names to their current palettes", () => {
    localStorage.setItem("gridscalr.preferences.v1", JSON.stringify({ theme: "grey" }));
    expect(loadAppPreferences().theme).toBe("dark-grey");

    localStorage.setItem("gridscalr.preferences.v1", JSON.stringify({ theme: "default" }));
    expect(loadAppPreferences().theme).toBe("jade");
  });

  it("merges patches and persists them", () => {
    const saved = saveAppPreferences({ language: "en" });
    expect(saved).toEqual({
      language: "en",
      csvFormat: "locale",
      theme: "medium-grey",
      autosave: { enabled: true, intervalSeconds: 15 },
      backups: { retention: 3 },
    });
    expect(loadAppPreferences()).toEqual(saved);

    const next = saveAppPreferences({ csvFormat: "interchange" });
    expect(next).toEqual({
      language: "en",
      csvFormat: "interchange",
      theme: "medium-grey",
      autosave: { enabled: true, intervalSeconds: 15 },
      backups: { retention: 3 },
    });
    expect(loadAppPreferences()).toEqual(next);
  });

  it("round-trips the autosave preference with the other fields", () => {
    const saved = saveAppPreferences({
      language: "sv",
      autosave: { enabled: false, intervalSeconds: 60 },
    });
    expect(saved.autosave).toEqual({ enabled: false, intervalSeconds: 60 });
    expect(loadAppPreferences()).toEqual(saved);

    const enabled = saveAppPreferences({ autosave: { enabled: true, intervalSeconds: 30 } });
    expect(enabled).toEqual({
      language: "sv",
      csvFormat: "locale",
      theme: "medium-grey",
      autosave: { enabled: true, intervalSeconds: 30 },
      backups: { retention: 3 },
    });
    expect(loadAppPreferences()).toEqual(enabled);
  });

  it("stores backup retention without disturbing the other fields", () => {
    const saved = saveAppPreferences({ backups: { retention: 6 } });
    expect(saved).toEqual({
      language: "system",
      csvFormat: "locale",
      theme: "medium-grey",
      autosave: { enabled: true, intervalSeconds: 15 },
      backups: { retention: 6 },
    });
    expect(loadAppPreferences()).toEqual(saved);

    saveAppPreferences({ language: "sv", autosave: { enabled: false, intervalSeconds: 60 } });
    expect(loadAppPreferences().backups).toEqual({ retention: 6 });
  });

  it("resets to the defaults", () => {
    saveAppPreferences({ language: "sv", csvFormat: "interchange" });
    expect(resetAppPreferences()).toEqual(DEFAULT_APP_PREFERENCES);
    expect(loadAppPreferences()).toEqual(DEFAULT_APP_PREFERENCES);
  });
});
