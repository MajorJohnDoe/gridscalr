/**
 * Pure rules for the reference-project performance budget gate.
 *
 * The budgets below are the table in `docs/limitations.md`, "Large-project
 * performance". `tests/performanceBudget.test.ts` reads that table and fails
 * when the two disagree, so the gate cannot drift from the documented budget.
 */

/** Gated measures. `label` is the exact row label in `docs/limitations.md`. */
export const PERFORMANCE_BUDGETS = [
  { key: "editLatency", label: "p95 edit latency", budgetMs: 100 },
  { key: "projectOpen", label: "Project open", budgetMs: 10000 },
  { key: "autosave", label: "Autosave", budgetMs: 2000 },
  { key: "pageSwitch", label: "Page switch", budgetMs: 100 },
  { key: "uiFreeze", label: "UI freeze", budgetMs: 2000 },
];

/**
 * The desktop working set is not measurable from the browser fallback. It stays
 * a documented release check on the packaged app, pinned here so the gate and
 * the table keep the same number.
 */
export const PERFORMANCE_MEMORY_BUDGET_MB = 2048;

/**
 * `reference` is the documented 150-page project. `ci` is the deterministic
 * budget run used in continuous integration: a quarter of the items, so the
 * step stays under a minute while still exercising the same store, history and
 * rendering paths against the same absolute budgets.
 */
export const PERFORMANCE_PROFILES = {
  reference: { pages: 150, items: 15000, images: 60 },
  ci: { pages: 40, items: 4000, images: 16 },
};

/** Deterministic seeds make a failing run reproducible from the profile alone. */
export const PERFORMANCE_SEED = 0x55;

/**
 * Resolves a profile by name with explicit numeric overrides from the caller
 * (the existing `GRIDSCALR_BENCH_*` environment variables). Unknown names are
 * rejected instead of silently falling back to the reference shape.
 */
export function performanceProfile(name = "reference", overrides = {}) {
  const profile = PERFORMANCE_PROFILES[name];
  if (!profile) {
    throw new Error(
      `Unknown performance profile "${name}". Use one of: ${Object.keys(PERFORMANCE_PROFILES).join(", ")}.`,
    );
  }
  const pick = (key) => {
    const value = overrides[key];
    return Number.isFinite(value) && value > 0 ? Math.round(value) : profile[key];
  };
  return { name, pages: pick("pages"), items: pick("items"), images: pick("images") };
}

/** Reads a measure out of the benchmark result; `null` when it was not measured. */
export function measureValue(result, key) {
  switch (key) {
    case "editLatency":
      return numberOrNull(result?.mutation?.p95Ms);
    case "projectOpen":
      return numberOrNull(result?.openMs);
    case "autosave":
      return numberOrNull(result?.autosaveMs);
    case "pageSwitch":
      return numberOrNull(result?.pageSwitch?.p95Ms);
    case "uiFreeze":
      return numberOrNull(result?.markups?.openMs);
    default:
      return null;
  }
}

/**
 * Compares a benchmark result with the budgets. A missing measurement fails:
 * an unmeasured budget is not a passed budget.
 */
export function evaluatePerformanceBudgets(result, budgets = PERFORMANCE_BUDGETS) {
  const rows = budgets.map((budget) => {
    const valueMs = measureValue(result, budget.key);
    return {
      key: budget.key,
      label: budget.label,
      valueMs,
      budgetMs: budget.budgetMs,
      pass: valueMs !== null && valueMs <= budget.budgetMs,
    };
  });
  return { passed: rows.every((row) => row.pass), rows };
}

/** Human-readable value: milliseconds under a second, seconds above it. */
export function formatMeasure(valueMs) {
  if (valueMs === null) return "not measured";
  if (Math.abs(valueMs) >= 1000) return `${(valueMs / 1000).toFixed(2)} s`;
  return `${valueMs.toFixed(1)} ms`;
}

export function formatBudgetRow(row) {
  return `${row.label}: ${formatMeasure(row.valueMs)} (budget ${formatMeasure(row.budgetMs)}) ${row.pass ? "PASS" : "FAIL"}`;
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}
