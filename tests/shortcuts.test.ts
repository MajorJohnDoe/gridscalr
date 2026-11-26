import { describe, expect, it } from "vitest";
import { altShortcut } from "../src/app/altShortcuts";
import { APP_SHORTCUTS, TOOL_KEYS, TOOL_SHORTCUTS, formatShortcut } from "../src/ui/shortcuts";
import { TOOLS } from "../src/ui/toolDefs";

describe("shortcut definitions", () => {
  it("covers every visible tool with a unique shortcut", () => {
    const visible = TOOLS.filter((tool) => !tool.libraryOnly);
    expect(Object.keys(TOOL_SHORTCUTS).sort()).toEqual(visible.map((tool) => tool.id).sort());
    const keys = Object.values(TOOL_SHORTCUTS) as string[];
    expect(new Set(keys.map((key) => key.toLowerCase())).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^(?:Shift\+)?[A-Z]$/);
  });

  it("builds the keyboard map from the same data as the tool rail", () => {
    for (const tool of TOOLS) {
      const key = TOOL_SHORTCUTS[tool.id];
      if (key) expect(TOOL_KEYS[key.toLowerCase()]).toBe(tool.id);
      else expect(tool.libraryOnly).toBe(true);
      expect(tool.shortcut).toBe(key);
    }
  });

  it("keeps application shortcuts unique and non-empty", () => {
    const entries = Object.entries(APP_SHORTCUTS);
    expect(entries.every(([, value]) => typeof value === "string" && value.length > 0)).toBe(true);
    expect(new Set(entries.map(([, value]) => value)).size).toBe(entries.length);
  });

  it("formats shortcuts for the current platform", () => {
    expect(formatShortcut("Ctrl+S").length).toBeGreaterThan(0);
  });

  it("routes the Ctrl+Alt windows without claiming an unrelated key", () => {
    const calls: string[] = [];
    const prevented: string[] = [];
    const actions = {
      openQuantities: () => calls.push("quantities"),
      openSpaces: () => calls.push("spaces"),
    };
    const event = (code: string, altKey = true): KeyboardEvent =>
      ({
        altKey,
        code,
        preventDefault: () => prevented.push(code),
      }) as unknown as KeyboardEvent;

    expect(altShortcut(event("KeyR"), actions)).toBe(true);
    expect(altShortcut(event("KeyQ"), actions)).toBe(true);
    expect(altShortcut(event("KeyX"), actions)).toBe(false);
    expect(altShortcut(event("KeyR", false), actions)).toBe(false);
    expect(calls).toEqual(["spaces", "quantities"]);
    expect(prevented).toEqual(["KeyR", "KeyQ"]);
  });
});
