import { describe, expect, it } from "vitest";
import { saveBinaryFile, saveTextFile, writeTextFile } from "../src/io/platform";
import { sourceDocumentPaths } from "../src/io/projectFile";
import { createProject, defaultDocument } from "../src/model/layers";
import {
  assertWritablePath,
  findProtectedPath,
  isDriveRelativePath,
  isPathInside,
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

  it("handles Windows paths with spaces and Swedish characters", () => {
    const protectedPaths = ["C:\\Ritningar\\Översiktsplan 1.pdf"];
    expect(findProtectedPath("c:/ritningar/översiktsplan 1.pdf", protectedPaths)).toBe(
      protectedPaths[0],
    );
  });

  it("throws a clear error instead of allowing a source overwrite", () => {
    expect(() => assertWritablePath("/home/ana/Level 01.pdf", ["/home/ana/Level 01.pdf"])).toThrow(
      /will not overwrite a source drawing/i,
    );
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
      saveBinaryFile(new Uint8Array([1]), "/home/ana/Level 01.pdf", [], "application/pdf", {
        forbiddenPaths: protectedPaths,
      }),
    ).rejects.toThrow(/will not overwrite a source drawing/i);
  });

  it("normalises a Windows verbatim path and UNC spelling", () => {
    expect(sameFilePath(String.raw`\\?\C:\Drawings\Plan.pdf`, "c:/drawings/plan.pdf")).toBe(true);
    expect(sameFilePath(String.raw`\\?\UNC\server\share\Plan.pdf`, "//SERVER/share/plan.pdf")).toBe(
      true,
    );
  });

  it("matches a folder entry as a protected root", () => {
    expect(isPathInside("/proj/Level 01.drawings/export.pdf", "/proj/Level 01.drawings")).toBe(
      true,
    );
    expect(isPathInside("/proj/Level 01.drawings", "/proj/Level 01.drawings")).toBe(true);
    expect(isPathInside("/proj/Level 01/export.pdf", "/proj/Level 01.drawings")).toBe(false);
    expect(findProtectedPath("/proj/Level 01.drawings/new.pdf", ["/proj/Level 01.drawings"])).toBe(
      "/proj/Level 01.drawings",
    );
  });

  it("protects the original drawing behind a managed copy", () => {
    const project = createProject(defaultDocument("Plan.pdf", 1));
    project.documents[0].storage = "managed";
    project.documents[0].path = "/proj/Level 01.drawings/Plan-1234abcd.pdf";
    project.documents[0].relativePath = "Level 01.drawings/Plan-1234abcd.pdf";
    project.documents[0].originalPath = "/archive/Plan.pdf";

    const paths = sourceDocumentPaths(project, "/proj/Level 01.gridscalr");
    expect(paths).toContain("/archive/Plan.pdf");
    expect(paths).toContain("/proj/Level 01.drawings");
    expect(() => assertWritablePath("/archive/Plan.pdf", paths)).toThrow(/source drawing/i);
    expect(() => assertWritablePath("/proj/Level 01.drawings/new-export.pdf", paths)).toThrow(
      /source drawing/i,
    );
    expect(() => assertWritablePath("/proj/Level 01-markups.pdf", paths)).not.toThrow();
  });

  it("rejects a drive-relative target instead of assuming it is free", () => {
    expect(isDriveRelativePath("C:Plan.pdf")).toBe(true);
    expect(isDriveRelativePath("C:/Plan.pdf")).toBe(false);
    expect(() => assertWritablePath("C:Plan.pdf", ["C:\\Drawings\\Plan.pdf"])).toThrow(
      /drive-relative|ambiguous/i,
    );
  });
});
