import { describe, expect, it } from "vitest";
import { normalizeProjectName, PROJECT_NAME_MAX_LENGTH } from "../src/model/projectName";

describe("normalizeProjectName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeProjectName("  Northgate   Hub \n Takeoff ", "Fallback")).toBe(
      "Northgate Hub Takeoff",
    );
  });

  it("keeps the previous name when the value is empty", () => {
    expect(normalizeProjectName("   ", "Current")).toBe("Current");
    expect(normalizeProjectName("", "Current")).toBe("Current");
  });

  it("caps the length after trimming", () => {
    const value = `  ${"a".repeat(PROJECT_NAME_MAX_LENGTH + 20)}  `;
    expect(normalizeProjectName(value, "Fallback")).toHaveLength(PROJECT_NAME_MAX_LENGTH);
  });

  it("leaves an ordinary name untouched", () => {
    expect(normalizeProjectName("Bottenplan", "Fallback")).toBe("Bottenplan");
  });
});
