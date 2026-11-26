import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countCommands,
  declaredModules,
  evaluateRustModules,
  formatRustProblems,
  validateCommandConfig,
} from "../scripts/rust-module-rules.mjs";

const root = resolve(__dirname, "..");
const REASON = "Reviewed reason that is long enough to count as a stated decision.";

function evaluate(files: Record<string, string>, config: { defaultMax: number; files?: object }) {
  const names = Object.keys(files);
  return evaluateRustModules({
    config: config as never,
    entries: names.map((file) => ({
      file: `src-tauri/src/${file}`,
      commands: countCommands(files[file]),
    })),
    declared: declaredModules(Object.values(files)),
  });
}

describe("command counting", () => {
  it("counts the attribute once per command and ignores comments", () => {
    const text = [
      "// #[tauri::command]",
      "/// #[tauri::command]",
      "#[tauri::command]",
      "pub fn one() {}",
      "#[tauri::command]",
      "pub fn two() {}",
    ].join("\n");
    expect(countCommands(text)).toBe(2);
  });

  it("accepts an attribute with an argument list", () => {
    expect(countCommands('#[tauri::command(rename_all = "snake_case")]')).toBe(1);
  });
});

describe("module declarations", () => {
  it("reads mod declarations and path attributes", () => {
    const declared = declaredModules([
      "mod commands;\npub(crate) mod package;\n",
      '#[path = "source_cleanup_tests.rs"]\nmod tests;',
    ]);
    expect([...declared].sort()).toEqual(["commands", "package", "source_cleanup_tests", "tests"]);
  });
});

describe("Rust command caps", () => {
  it("passes a new module at the default cap", () => {
    const result = evaluate(
      { "source_cleanup.rs": "mod x;\n#[tauri::command]\nfn a() {}\n#[tauri::command]\nfn b() {}" },
      { defaultMax: 2 },
    );
    expect(result.violations).toEqual([]);
    expect(result.total).toBe(2);
  });

  it("fails a third command in a module that merely happens to be small", () => {
    const result = evaluate(
      {
        "new_module.rs":
          "mod x;\n#[tauri::command]\nfn a() {}\n#[tauri::command]\nfn b() {}\n#[tauri::command]\nfn c() {}",
      },
      { defaultMax: 2 },
    );
    expect(result.ok).toBe(false);
    expect(result.violations[0]).toMatchObject({
      file: "src-tauri/src/new_module.rs",
      commands: 3,
    });
    expect(formatRustProblems(result).join("\n")).toContain("Move a command into its own module");
  });

  it("allows a reviewed exception and requires a stated reason", () => {
    const files = {
      "commands.rs": Array.from({ length: 4 }, () => "#[tauri::command]\nfn f() {}").join("\n"),
    };
    const reviewed = evaluate(files, {
      defaultMax: 2,
      files: { "src-tauri/src/commands.rs": { max: 4, reason: REASON } },
    });
    expect(reviewed.violations).toEqual([]);

    const unreviewed = evaluate(files, { defaultMax: 2 });
    expect(unreviewed.violations).toHaveLength(1);

    const shortReason = validateCommandConfig({
      defaultMax: 2,
      files: { "src-tauri/src/commands.rs": { max: 4, reason: "legacy" } },
    });
    expect(shortReason[0]).toContain("reviewed reason");
  });

  it("reports a stale exception after a rename", () => {
    const result = evaluate(
      { "renamed.rs": "mod x;" },
      {
        defaultMax: 2,
        files: { "src-tauri/src/removed.rs": { max: 4, reason: REASON } },
      },
    );
    expect(result.ok).toBe(false);
    expect(result.stale).toEqual(["src-tauri/src/removed.rs"]);
  });
});

describe("Rust module wiring", () => {
  it("fails a file that no other module declares", () => {
    const result = evaluate({ "orphan.rs": "#[tauri::command]\nfn a() {}" }, { defaultMax: 2 });
    expect(result.orphans).toEqual(["src-tauri/src/orphan.rs"]);
  });

  it("exempts the crate roots", () => {
    const result = evaluate(
      { "lib.rs": "mod commands;", "main.rs": "fn main() {}" },
      {
        defaultMax: 2,
      },
    );
    expect(result.orphans).toEqual([]);
  });

  it("treats a nested mod.rs as its directory module", () => {
    const result = evaluate(
      {
        "lib.rs": "mod package;",
        "package/mod.rs": "mod create;",
        "package/create.rs": "mod tests;",
        "package/untracked.rs": "fn helper() {}",
      },
      { defaultMax: 2 },
    );
    expect(result.orphans).toEqual(["src-tauri/src/package/untracked.rs"]);
  });

  it("counts commands in nested modules under the same cap", () => {
    const result = evaluate(
      {
        "lib.rs": "mod package;",
        "package/mod.rs": "mod create;",
        "package/create.rs": [
          "#[tauri::command]",
          "fn a() {}",
          "#[tauri::command]",
          "fn b() {}",
          "#[tauri::command]",
          "fn c() {}",
        ].join("\n"),
      },
      { defaultMax: 2 },
    );
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: "src-tauri/src/package/create.rs",
        commands: 3,
      }),
    ]);
  });
});

describe("the shipped Rust tree", () => {
  it("stays inside the recorded command caps and declares every module", () => {
    const directory = join(root, "src-tauri", "src");
    const files: string[] = [];
    const walk = (current: string) => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const absolute = join(current, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (entry.name.endsWith(".rs")) files.push(absolute);
      }
    };
    walk(directory);
    const texts = files.map((file) => readFileSync(file, "utf8"));
    const config = JSON.parse(readFileSync(join(root, "rust-commands.json"), "utf8"));
    const result = evaluateRustModules({
      config,
      entries: files.map((file, index) => ({
        file: `src-tauri/src/${file.slice(directory.length + 1).replaceAll("\\", "/")}`,
        commands: countCommands(texts[index]),
      })),
      declared: declaredModules(texts),
    });
    expect(formatRustProblems(result)).toEqual([]);
    expect(result.total).toBeGreaterThan(20);
  });
});
