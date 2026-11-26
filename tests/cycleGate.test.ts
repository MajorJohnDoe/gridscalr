import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findRuntimeCycles, runtimeDependencies } from "../scripts/check-cycles.mjs";

const root = resolve(__dirname, "..");

function module(path: string, text: string) {
  return { path: `/repo/${path}`, text };
}

describe("runtime dependency parsing", () => {
  it("keeps value imports and drops type-only imports", () => {
    const text = [
      'import { a } from "./value";',
      'import type { B } from "./type";',
      'import { type C } from "./inline-type";',
      'import { type D, e } from "./mixed";',
      'export { f } from "./re-export";',
      'export type { G } from "./type-export";',
      'export * from "./star";',
      'const lazy = import("./lazy");',
    ].join("\n");

    expect(runtimeDependencies(text)).toEqual(["./value", "./mixed", "./re-export", "./star"]);
  });

  it("keeps side-effect imports", () => {
    expect(runtimeDependencies('import "./styles.css";')).toEqual(["./styles.css"]);
  });
});

describe("runtime cycle detection", () => {
  it("reports a two-module cycle", () => {
    const cycles = findRuntimeCycles(
      [
        module("src/a.ts", 'import { b } from "./b";\nexport const a = b;'),
        module("src/b.ts", 'import { a } from "./a";\nexport const b = a;'),
      ],
      "/repo",
    );

    expect(cycles).toEqual([["src/a.ts", "src/b.ts"]]);
  });

  it("reports a longer cycle", () => {
    const cycles = findRuntimeCycles(
      [
        module("src/a.ts", 'import { b } from "./b";'),
        module("src/b.ts", 'import { c } from "./c";'),
        module("src/c.ts", 'import { a } from "./a";'),
      ],
      "/repo",
    );

    expect(cycles).toEqual([["src/a.ts", "src/b.ts", "src/c.ts"]]);
  });

  it("ignores a cycle made only of type imports", () => {
    const cycles = findRuntimeCycles(
      [
        module("src/a.ts", 'import type { B } from "./b";'),
        module("src/b.ts", 'import type { A } from "./a";'),
      ],
      "/repo",
    );

    expect(cycles).toEqual([]);
  });

  it("resolves directory index modules", () => {
    const cycles = findRuntimeCycles(
      [
        module("src/a.ts", 'import { b } from "./b";'),
        module("src/b/index.ts", 'import { a } from "../a";'),
      ],
      "/repo",
    );

    expect(cycles).toEqual([["src/a.ts", "src/b/index.ts"]]);
  });

  it("reports the live repository as cycle-free", () => {
    const files: { path: string; text: string }[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const absolute = join(directory, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (entry.name.endsWith(".ts")) {
          files.push({ path: absolute, text: readFileSync(absolute, "utf8") });
        }
      }
    };
    walk(resolve(root, "src"));

    expect(findRuntimeCycles(files, root)).toEqual([]);
  });
});
