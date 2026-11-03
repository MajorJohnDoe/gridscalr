import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, relativePath), "utf8")) as Record<string, unknown>;
}

describe("desktop file association", () => {
  it("registers .gridscalr as a project file", () => {
    const config = readJson("src-tauri/tauri.conf.json");
    const bundle = config.bundle as { fileAssociations?: Array<Record<string, unknown>> };
    expect(bundle.fileAssociations).toEqual([
      {
        ext: ["gridscalr"],
        name: "GridScalr project",
        description: "GridScalr measurement project",
        role: "Editor",
        mimeType: "application/x-gridscalr",
      },
    ]);
  });

  it("passes the opened file to the Linux desktop entry", () => {
    const template = readFileSync(resolve(root, "src-tauri/linux/gridscalr.desktop"), "utf8");
    // Without %f the desktop entry launches the app but drops the file path.
    expect(template).toContain("Exec={{exec}} %f");
    expect(template).toContain("MimeType={{mime_type}}");

    const config = readJson("src-tauri/tauri.conf.json");
    const bundle = config.bundle as {
      linux?: { deb?: { desktopTemplate?: string }; rpm?: { desktopTemplate?: string } };
    };
    expect(bundle.linux?.deb?.desktopTemplate).toBe("linux/gridscalr.desktop");
    expect(bundle.linux?.rpm?.desktopTemplate).toBe("linux/gridscalr.desktop");
  });
});
