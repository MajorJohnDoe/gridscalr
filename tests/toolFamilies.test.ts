import { beforeEach, describe, expect, it } from "vitest";
import {
  TOOLS,
  TOOL_FAMILIES,
  familyForTool,
  familyToolForDisplay,
  isFamilyLeader,
  rememberFamilyTool,
  resetFamilyToolMemory,
} from "../src/ui/toolDefs";

beforeEach(() => resetFamilyToolMemory());

describe("tool families", () => {
  it("keeps every family member in the full tool list", () => {
    const ids = new Set(TOOLS.map((tool) => tool.id));
    for (const family of TOOL_FAMILIES) {
      expect(family.tools.length).toBeGreaterThan(1);
      for (const tool of family.tools) expect(ids.has(tool)).toBe(true);
    }
  });

  it("marks the first member as the rail leader", () => {
    expect(isFamilyLeader("radius")).toBe(true);
    expect(isFamilyLeader("diameter")).toBe(false);
    expect(isFamilyLeader("arc")).toBe(false);
    expect(isFamilyLeader("angle")).toBe(true);
    expect(isFamilyLeader("slope")).toBe(false);
    expect(isFamilyLeader("length")).toBe(false);
  });

  it("defaults to the leader until a member is used", () => {
    const circle = familyForTool("radius")!;
    const angles = familyForTool("angle")!;
    expect(familyToolForDisplay(circle, "select")).toBe("radius");
    expect(familyToolForDisplay(angles, "select")).toBe("angle");
  });

  it("remembers the last used member per family", () => {
    rememberFamilyTool("arc");
    rememberFamilyTool("slope");
    const circle = familyForTool("radius")!;
    const angles = familyForTool("angle")!;
    expect(familyToolForDisplay(circle, "select")).toBe("arc");
    expect(familyToolForDisplay(angles, "select")).toBe("slope");
  });

  it("shows the active member even when another member was used before", () => {
    rememberFamilyTool("arc");
    const circle = familyForTool("radius")!;
    expect(familyToolForDisplay(circle, "diameter")).toBe("diameter");
    expect(familyToolForDisplay(circle, "length")).toBe("arc");
  });

  it("ignores tools outside a family", () => {
    rememberFamilyTool("length");
    const circle = familyForTool("radius")!;
    expect(familyToolForDisplay(circle, "select")).toBe("radius");
  });
});
