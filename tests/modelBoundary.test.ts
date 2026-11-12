import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_COUNT_TYPES, defaultCountTypes } from "../src/model/countTypes";
import { symbolFor } from "../src/model/symbols";

/**
 * ADR 0013: the dependency direction is feature → model, never the reverse.
 * A model module that imports a feature makes the lower layer untestable on its
 * own and risks a cycle as soon as that feature imports model types. Count-type
 * defaults and the symbol catalogue now live in `src/model`; this test keeps a
 * future change from reaching back into `src/features`.
 */
const root = resolve(__dirname, "..");
const modelDirectory = resolve(root, "src/model");

function collectTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectTypeScriptFiles(absolute));
    else if (entry.name.endsWith(".ts")) files.push(absolute);
  }
  return files;
}

/** `from "./x"`, `import("./x")` and side-effect `import "./x"` specifiers. */
function importedSpecifiers(text: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
  for (const match of text.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

describe("model to feature boundary", () => {
  it("never imports a feature module from src/model", () => {
    const files = collectTypeScriptFiles(modelDirectory);
    expect(files.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const specifier of importedSpecifiers(text)) {
        if (!specifier.startsWith(".")) continue;
        const resolved = toPosix(relative(root, resolve(dirname(file), specifier)));
        if (resolved === "src/features" || resolved.startsWith("src/features/")) {
          violations.push(
            `${toPosix(relative(root, file))}: import "${specifier}" reaches into ${resolved}. ` +
              "Model code must not import a feature module; keep the shared rule in src/model (ADR 0013).",
          );
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("keeps the count-type rules and the symbol catalogue in the model", () => {
    // A green boundary test is only meaningful while the moved rules still exist
    // in the place model code imports them from.
    expect(defaultCountTypes().map((type) => type.id)).toEqual([
      "door",
      "window",
      "radiator",
      "fixture",
      "other",
    ]);
    expect(defaultCountTypes()).not.toBe(DEFAULT_COUNT_TYPES);
    expect(symbolFor("schematic.valve").set).toBe("schematic");
    expect(symbolFor("fire.extinguisher").id).toBe("fire.extinguisher");
  });
});
