import { describe, expect, it } from "vitest";
import { saveBinaryFile, saveTextFile, writeTextFile } from "../src/io/platform";
import {
  assertWritablePath,
  findProtectedPath,
  pathComparisonKey,
  sameFilePath,
} from "../src/io/writeGuard";

describe("write guard", () => {
  it("normalises slash direction and trailing separators", () => {
    expect(sameFilePath("/home/ana/plan.pdf", "\\home\\ana\\plan.pdf")).toBe(true);
    expect(sameFilePath("/home/ana/plan.pdf/", "/home/ana/plan.pdf")).toBe(true);
    expect(pathComparisonKey("C:\\\\Drawings\\\\Plan.pdf")).toBe("c:/drawings/plan.pdf");
  });

  it("compares case-insensitively to stay safe on every platform", () => {
    expect(sameFilePath("/home/ana/Plan.pdf", "/home/ana/plan.pdf")).toBe(true);
  });

  it("does not treat empty paths as the same file", () => {
    expect(sameFilePath("", "")).toBe(false);
    expect(sameFilePath("   ", "")).toBe(false);
  });

  it("finds a protected match but allows a different file", () => {
    const protectedPaths = ["/home/ana/Level 01.pdf", "/home/ana/Site plan.tif"];
    expect(findProtectedPath("/home/ana/Level 01.pdf", protectedPaths)).toBe(
      "/home/ana/Level 01.pdf",
    );
    expect(findProtectedPath("/home/ana/level 01.pdf", protectedPaths)).toBe(
      "/home/ana/Level 01.pdf",
    );
    expect(findProtectedPath("/home/ana/Level 01-markups.pdf", protectedPaths)).toBeNull();
  });

  it("throws a clear error instead of allowing a source overwrite", () => {
    expect(() =>
      assertWritablePath("/home/ana/Level 01.pdf", ["/home/ana/Level 01.pdf"]),
    ).toThrow(/will not overwrite a source drawing/i);
    expect(() =>
      assertWritablePath("/home/ana/Level 01.pdf", ["/home/ana/Other.pdf"]),
    ).not.toThrow();
  });

  it("guards text, CSV and binary writes before touching the destination", async () => {
    const protectedPaths = ["/home/ana/Level 01.pdf"];

    await expect(
      writeTextFile("/home/ana/Level 01.pdf", "project", { forbiddenPaths: protectedPaths }),
    ).rejects.toThrow(/will not overwrite a source drawing/i);

    await expect(
      saveTextFile("csv", "/home/ana/Level 01.pdf", [], { forbiddenPaths: protectedPaths }),
    ).rejects.toThrow(/will not overwrite a source drawing/i);

    await expect(
      saveBinaryFile(
        new Uint8Array([1]),
        "/home/ana/Level 01.pdf",
        [],
        "application/pdf",
        { forbiddenPaths: protectedPaths },
      ),
    ).rejects.toThrow(/will not overwrite a source drawing/i);
  });
});
