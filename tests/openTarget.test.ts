import { describe, expect, it } from "vitest";
import { classifyOpenTarget } from "../src/app/openTarget";

describe("open target classification", () => {
  it("treats PDF and TIF files as drawings", () => {
    expect(classifyOpenTarget("plan.pdf")).toBe("drawing");
    expect(classifyOpenTarget("PLAN.PDF")).toBe("drawing");
    expect(classifyOpenTarget("scan.tif")).toBe("drawing");
    expect(classifyOpenTarget("scan.TIFF")).toBe("drawing");
    expect(classifyOpenTarget("C:\\projects\\plan.pdf")).toBe("drawing");
    expect(classifyOpenTarget("/home/user/plan.pdf")).toBe("drawing");
  });

  it("treats project files as projects", () => {
    expect(classifyOpenTarget("site.gridscalr")).toBe("project");
    expect(classifyOpenTarget("SITE.GRIDSCALR")).toBe("project");
    expect(classifyOpenTarget("backup.json")).toBe("project");
    expect(classifyOpenTarget("/home/user/backup.JSON")).toBe("project");
  });

  it("rejects everything else", () => {
    expect(classifyOpenTarget("notes.txt")).toBe("unsupported");
    expect(classifyOpenTarget("archive.gridscalr.zip")).toBe("unsupported");
    expect(classifyOpenTarget("")).toBe("unsupported");
    expect(classifyOpenTarget("plan.pdf.bak")).toBe("unsupported");
  });
});
