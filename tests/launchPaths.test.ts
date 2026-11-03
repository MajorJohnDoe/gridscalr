import { describe, expect, it } from "vitest";
import { classifyLaunchPath, firstLaunchPath } from "../src/features/launch/model";

describe("classifyLaunchPath", () => {
  it("recognises projects and drawings on every path style", () => {
    expect(classifyLaunchPath("/tmp/Northgate.gridscalr")).toBe("project");
    expect(classifyLaunchPath("C:\\Plans\\Bottenplan.GRIDSCALR")).toBe("project");
    expect(classifyLaunchPath("/tmp/industrial-plan.pdf")).toBe("drawing");
    expect(classifyLaunchPath("/tmp/scan.tif")).toBe("drawing");
    expect(classifyLaunchPath("/tmp/scan.tiff")).toBe("drawing");
  });

  it("rejects unrelated or extensionless files", () => {
    expect(classifyLaunchPath("/tmp/notes.txt")).toBe("unknown");
    expect(classifyLaunchPath("/tmp/README")).toBe("unknown");
    expect(classifyLaunchPath("")).toBe("unknown");
    expect(classifyLaunchPath("/tmp/.gridscalr")).toBe("unknown");
  });
});

describe("firstLaunchPath", () => {
  it("skips flags, blanks and unsupported files", () => {
    expect(firstLaunchPath(["--flag", " ", "/tmp/notes.txt", "/tmp/plan.gridscalr"])).toBe(
      "/tmp/plan.gridscalr",
    );
  });

  it("returns null when nothing can be opened", () => {
    expect(firstLaunchPath([])).toBeNull();
    expect(firstLaunchPath(["--flag"])).toBeNull();
  });
});
