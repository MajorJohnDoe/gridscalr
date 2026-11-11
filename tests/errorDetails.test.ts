// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  commandErrorForCopy,
  errorTextForCopy,
  describeCommandError,
} from "../src/io/platformError";
import { containsAbsolutePath, sanitizePaths } from "../src/model/pathText";

describe("absolute path sanitizer", () => {
  it("removes POSIX paths", () => {
    expect(sanitizePaths("/home/anna/Secret Bottenplan/Plan.pdf: Permission denied")).toBe(
      "<path>: Permission denied",
    );
  });

  it("removes Windows paths including spaces", () => {
    expect(sanitizePaths("C:\\Drawings\\Customer A\\Plan.pdf: denied")).toBe("<path>: denied");
  });

  it("keeps URLs intact", () => {
    expect(sanitizePaths("see https://example.com/a/b for details")).toBe(
      "see https://example.com/a/b for details",
    );
  });

  it("reports whether text contains a path", () => {
    expect(containsAbsolutePath("/home/anna/plan.gridscalr")).toBe(true);
    expect(containsAbsolutePath("Everything is fine")).toBe(false);
  });
});

describe("structured command errors", () => {
  const error = {
    code: "readFailed",
    detail: "/home/anna/Secret Bottenplan/Plan.pdf: Permission denied",
  };

  it("keeps the raw detail for the on-screen technical line", () => {
    expect(describeCommandError(error)).toContain("/home/anna");
  });

  it("copies a sanitized summary and keeps the stable code", () => {
    expect(commandErrorForCopy(error)).toBe("readFailed: <path>: Permission denied");
  });

  it("keeps a code even when the detail has no path", () => {
    expect(commandErrorForCopy({ code: "sourceOverwrite", detail: "" })).toBe("sourceOverwrite");
  });

  it("sanitizes any rendered error text", () => {
    expect(errorTextForCopy(new Error("cannot write C:\\Drawings\\Plan.pdf"))).toBe(
      "cannot write <path>",
    );
  });

  it("returns null for values that are not structured errors", () => {
    expect(commandErrorForCopy("plain failure")).toBeNull();
  });
});
