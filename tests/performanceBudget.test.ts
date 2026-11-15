import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PERFORMANCE_BUDGETS,
  PERFORMANCE_MEMORY_BUDGET_MB,
  PERFORMANCE_PROFILES,
  evaluatePerformanceBudgets,
  formatBudgetRow,
  formatMeasure,
  measureValue,
  performanceProfile,
} from "../scripts/performance-budget-rules.mjs";

const root = resolve(__dirname, "..");

/** A benchmark result that meets every budget. */
function passingResult() {
  const result: {
    mutation: { p95Ms: number };
    openMs: number;
    autosaveMs: number | null;
    pageSwitch: { p95Ms: number };
    markups: { openMs: number };
  } = {
    mutation: { p95Ms: 12 },
    openMs: 900,
    autosaveMs: 1100,
    pageSwitch: { p95Ms: 4 },
    markups: { openMs: 250 },
  };
  return result;
}

function documentedRows() {
  const text = readFileSync(resolve(root, "docs", "limitations.md"), "utf8");
  const rows = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (match) rows.set(match[1], match[2]);
  }
  return rows;
}

function documentedMs(value: string): number {
  const match = /(\d+(?:\.\d+)?)\s*(ms|s)\b/.exec(value);
  if (!match) return Number.NaN;
  return match[2] === "s" ? Number(match[1]) * 1000 : Number(match[1]);
}

function documentedMb(value: string): number {
  const match = /(\d+(?:\.\d+)?)\s*(GB|MB)\b/.exec(value);
  if (!match) return Number.NaN;
  return match[2] === "GB" ? Number(match[1]) * 1024 : Number(match[1]);
}

describe("performance budget rules", () => {
  it("passes a result inside every documented budget", () => {
    const evaluation = evaluatePerformanceBudgets(passingResult());
    expect(evaluation.passed).toBe(true);
    expect(evaluation.rows.map((row) => row.key)).toEqual([
      "editLatency",
      "projectOpen",
      "autosave",
      "pageSwitch",
      "uiFreeze",
    ]);
  });

  it("fails the exact measure that is over budget and keeps the others", () => {
    const result = passingResult();
    result.mutation.p95Ms = 140;
    const evaluation = evaluatePerformanceBudgets(result);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.rows.filter((row) => !row.pass).map((row) => row.key)).toEqual([
      "editLatency",
    ]);
  });

  it("treats an unmeasured budget as a failure, not a pass", () => {
    const result = passingResult();
    result.autosaveMs = null;
    const evaluation = evaluatePerformanceBudgets(result);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.rows.find((row) => row.key === "autosave")?.valueMs).toBeNull();
  });

  it("reads every measure from the benchmark result shape", () => {
    const result = passingResult();
    expect(measureValue(result, "editLatency")).toBe(12);
    expect(measureValue(result, "projectOpen")).toBe(900);
    expect(measureValue(result, "autosave")).toBe(1100);
    expect(measureValue(result, "pageSwitch")).toBe(4);
    expect(measureValue(result, "uiFreeze")).toBe(250);
    expect(measureValue(undefined, "editLatency")).toBeNull();
    expect(measureValue({}, "unknown")).toBeNull();
  });

  it("formats milliseconds, seconds and missing values", () => {
    expect(formatMeasure(12.34)).toBe("12.3 ms");
    expect(formatMeasure(1200)).toBe("1.20 s");
    expect(formatMeasure(null)).toBe("not measured");
    const row = evaluatePerformanceBudgets(passingResult()).rows[0];
    expect(formatBudgetRow(row)).toBe("p95 edit latency: 12.0 ms (budget 100.0 ms) PASS");
  });
});

describe("performance profiles", () => {
  it("resolves the documented reference project and the CI budget run", () => {
    expect(PERFORMANCE_PROFILES.reference).toEqual({ pages: 150, items: 15000, images: 60 });
    expect(PERFORMANCE_PROFILES.ci).toEqual({ pages: 40, items: 4000, images: 16 });
    expect(performanceProfile()).toEqual({ name: "reference", ...PERFORMANCE_PROFILES.reference });
    expect(performanceProfile("ci")).toEqual({ name: "ci", ...PERFORMANCE_PROFILES.ci });
  });

  it("applies explicit numeric overrides and rejects an unknown profile", () => {
    expect(performanceProfile("ci", { items: 8000 })).toEqual({
      name: "ci",
      pages: 40,
      items: 8000,
      images: 16,
    });
    expect(performanceProfile("ci", { items: Number.NaN, pages: -4 })).toEqual({
      name: "ci",
      ...PERFORMANCE_PROFILES.ci,
    });
    expect(() => performanceProfile("turbo")).toThrow(/Unknown performance profile/);
  });
});

describe("documented budgets", () => {
  const rows = documentedRows();

  it("pins every gated measure to the table in docs/limitations.md", () => {
    for (const budget of PERFORMANCE_BUDGETS) {
      const documented = rows.get(budget.label);
      expect(documented, `missing documented row "${budget.label}"`).toBeDefined();
      expect(documentedMs(documented as string), budget.label).toBe(budget.budgetMs);
    }
  });

  it("pins the desktop memory budget that stays a manual release check", () => {
    expect(documentedMb(rows.get("Memory") as string)).toBe(PERFORMANCE_MEMORY_BUDGET_MB);
  });

  it("states that the gate runs in CI and names the measured command", () => {
    const text = readFileSync(resolve(root, "docs", "limitations.md"), "utf8");
    expect(text).toContain("npm run check:performance");
    expect(text).toContain("reference project");
  });
});
