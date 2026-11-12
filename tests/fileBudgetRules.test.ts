import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  budgetFor,
  evaluateScope,
  lineCount,
  normalizeException,
  planUpdate,
  validateScope,
} from "../scripts/file-budget-rules.mjs";

const root = resolve(__dirname, "..");
const RUST_REASON = "Legacy module kept whole until its extraction issue lands.";

function scope(files: Record<string, number | { max: number; reason: string }> = {}) {
  return { defaultMax: 400, files };
}

function entry(file: string, lines: number) {
  return { file, lines };
}

function evaluate(files: Record<string, number | { max: number; reason: string }>, lines: number) {
  return evaluateScope({
    scope: scope(files),
    entries: [entry("src-tauri/src/module.rs", lines)],
    label: "Rust",
    reviewed: true,
  });
}

describe("file budget rules", () => {
  it("counts maintained lines without counting a trailing newline", () => {
    expect(lineCount("a\nb\nc\n")).toBe(3);
    expect(lineCount("a\nb\nc")).toBe(3);
    expect(lineCount("")).toBe(0);
  });

  it("passes a file within the default budget", () => {
    const result = evaluate({}, 400);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.stale).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("fails a new file over the default budget", () => {
    const result = evaluate({}, 401);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({ file: "src-tauri/src/module.rs", budget: 400 });
    expect(result.violations[0].reviewed).toBe(false);
  });

  it("allows --update to raise an existing reviewed exception", () => {
    const files = {
      "src-tauri/src/module.rs": { max: 420, reason: RUST_REASON },
      "src-tauri/src/other.rs": { max: 450, reason: RUST_REASON },
    };
    const result = evaluateScope({
      scope: scope(files),
      entries: [entry("src-tauri/src/module.rs", 430), entry("src-tauri/src/other.rs", 450)],
      label: "Rust",
      reviewed: true,
    });
    expect(result.ok).toBe(false);
    const update = planUpdate({
      scope: scope(files),
      violations: result.violations,
      stale: result.stale,
      label: "Rust",
      reviewed: true,
    });
    expect(update.ok).toBe(true);
    expect(update.next?.["src-tauri/src/module.rs"]).toEqual({ max: 430, reason: RUST_REASON });
    expect(update.next?.["src-tauri/src/other.rs"]).toEqual({ max: 450, reason: RUST_REASON });
    expect(update.updated).toBe(1);
  });

  it("refuses --update for a new oversized file", () => {
    const result = evaluate({}, 430);
    const update = planUpdate({
      scope: scope(),
      violations: result.violations,
      stale: result.stale,
      label: "Rust",
      reviewed: true,
    });
    expect(update.ok).toBe(false);
    expect(update.next).toBeUndefined();
    expect(update.unknown).toHaveLength(1);
    expect(update.errors[0]).toContain("src-tauri/src/module.rs: 430 lines, budget 400 (+30)");
  });

  it("flags an exception whose file no longer exists as stale", () => {
    const result = evaluate({ "src-tauri/src/removed.rs": { max: 500, reason: RUST_REASON } }, 100);
    expect(result.ok).toBe(false);
    expect(result.stale.map((item) => item.file)).toEqual(["src-tauri/src/removed.rs"]);
    expect(result.stale[0].message).toContain("no longer matches a source file");
  });

  it("prunes a stale exception during --update", () => {
    const files = { "src-tauri/src/removed.rs": { max: 500, reason: RUST_REASON } };
    const result = evaluate(files, 100);
    const update = planUpdate({
      scope: scope(files),
      violations: result.violations,
      stale: result.stale,
      label: "Rust",
      reviewed: true,
    });
    expect(update.ok).toBe(true);
    expect(update.next).toEqual({});
    expect(update.pruned).toBe(1);
  });

  it("requires every Rust exception to state a reviewed reason", () => {
    expect(validateScope(scope({ "src-tauri/src/a.rs": 450 }), "Rust", { reviewed: true })).toEqual(
      ['Rust exception src-tauri/src/a.rs must be written as { "max", "reason" }.'],
    );
    expect(
      validateScope(scope({ "src-tauri/src/a.rs": { max: 450, reason: "too short" } }), "Rust", {
        reviewed: true,
      }),
    ).toHaveLength(1);
    expect(
      validateScope(scope({ "src-tauri/src/a.rs": { max: 450, reason: RUST_REASON } }), "Rust", {
        reviewed: true,
      }),
    ).toEqual([]);
  });

  it("prefers an exact exception over a directory limit", () => {
    const budget = budgetFor("src-tauri/src/a.rs", {
      defaultMax: 400,
      directoryMax: { "src-tauri/src": 300 },
      files: { "src-tauri/src/a.rs": 500 },
    });
    expect(budget).toBe(500);
    expect(normalizeException({ max: 500, reason: RUST_REASON })).toEqual({
      max: 500,
      reason: RUST_REASON,
    });
    expect(normalizeException("500")).toBeNull();
  });

  it("keeps the committed Rust exceptions reviewed", () => {
    const config = JSON.parse(readFileSync(resolve(root, "file-budgets.json"), "utf8"));
    expect(config.rust.defaultMax).toBe(400);
    expect(validateScope(config.rust, "Rust", { reviewed: true })).toEqual([]);
  });
});
