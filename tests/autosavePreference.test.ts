// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  autosaveState,
  setAutosaveEnabled,
  setAutosaveIntervalSeconds,
  setAutosavePausedForSession,
  subscribeAutosaveState,
} from "../src/features/sessionRecovery";
import { resetAppPreferences } from "../src/io/appPreferences";

beforeEach(() => {
  localStorage.clear();
  resetAppPreferences();
  setAutosaveEnabled(true);
  setAutosaveIntervalSeconds(15);
  setAutosavePausedForSession(false);
});

describe("autosave preference", () => {
  it("is enabled at the 15 second default", () => {
    expect(autosaveState()).toEqual({
      enabled: true,
      intervalSeconds: 15,
      pausedForSession: false,
      status: "enabled",
      active: true,
    });
  });

  it("stops periodic writes when autosave is turned off and keeps the interval", () => {
    expect(setAutosaveEnabled(false)).toMatchObject({ status: "disabled", active: false });
    expect(autosaveState().intervalSeconds).toBe(15);

    expect(setAutosaveIntervalSeconds(30)).toMatchObject({
      enabled: false,
      intervalSeconds: 30,
      active: false,
    });
    expect(autosaveState().enabled).toBe(false);
  });

  it("pauses and resumes only for the current session", () => {
    expect(setAutosavePausedForSession(true)).toMatchObject({
      status: "paused",
      pausedForSession: true,
      active: false,
    });
    expect(autosaveState().enabled).toBe(true);
    expect(setAutosavePausedForSession(false)).toMatchObject({
      status: "enabled",
      pausedForSession: false,
      active: true,
    });
  });

  it("ignores an interval outside the supported choices", () => {
    expect(setAutosaveIntervalSeconds(45 as 15)).toMatchObject({
      intervalSeconds: 15,
      active: true,
    });
  });

  it("notifies subscribers on every effective change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAutosaveState(listener);
    setAutosaveEnabled(false);
    setAutosaveIntervalSeconds(60);
    setAutosavePausedForSession(true);
    unsubscribe();
    setAutosaveEnabled(true);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("resets the session pause on a new app start", async () => {
    setAutosavePausedForSession(true);
    expect(autosaveState().pausedForSession).toBe(true);

    vi.resetModules();
    const fresh = await import("../src/features/sessionRecovery/autosavePreference");
    expect(fresh.autosaveState()).toMatchObject({
      pausedForSession: false,
      status: "enabled",
      active: true,
    });
  });
});
