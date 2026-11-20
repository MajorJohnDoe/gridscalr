import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { serializeManifest } from "../scripts/capture-manifest.mjs";

const root = resolve(__dirname, "..");

describe("serializeManifest", () => {
  it("escapes a non-ASCII character as a lowercase 4-digit sequence", () => {
    const text = serializeManifest({ title: "Area \u2014 total" });
    expect(text).toContain("Area \\u2014 total");
    expect(text).not.toContain("\u2014");
  });

  it("leaves ASCII text unchanged", () => {
    const text = serializeManifest({ title: "Area total", count: 3 });
    expect(text).toBe('{\n  "title": "Area total",\n  "count": 3\n}\n');
  });

  it("keeps two-space indentation and a trailing newline", () => {
    const text = serializeManifest({ nested: { value: 1 } });
    expect(text).toBe('{\n  "nested": {\n    "value": 1\n  }\n}\n');
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("round-trips through JSON.parse", () => {
    const manifest = {
      generatedAt: "2026-11-20T00:00:00.000Z",
      screenshots: [
        { file: "hero.png", title: "M\u00e4tning \u2014 takeoff", alt: "Ritning med m\u00e5tt" },
        { file: "layers.png", title: "Lager \u2014 panel", alt: "Lagerpanel" },
      ],
    };
    expect(JSON.parse(serializeManifest(manifest))).toEqual(manifest);
  });

  it("reproduces the committed manifest byte for byte", () => {
    const committed = readFileSync(resolve(root, "docs", "screenshots", "manifest.json"), "utf8");
    expect(serializeManifest(JSON.parse(committed))).toBe(committed);
  });
});
