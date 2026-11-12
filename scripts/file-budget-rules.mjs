/**
 * Pure model for the file line-budget check.
 *
 * `check-file-budgets.mjs` collects the files and reads `file-budgets.json`;
 * this module owns the rules so the tests can prove them with synthetic file
 * lists. The same rules cover the frontend `src` tree and the Rust
 * `src-tauri/src` tree; only the scope and its reviewed exceptions differ.
 *
 * A scope is `{ defaultMax, directoryMax?, files? }`. An exception is either a
 * plain number (a legacy cap, still supported for the frontend) or a
 * `{ max, reason }` object. Rust exceptions must use the object form so every
 * legacy file records why it is still oversized.
 */

/** A reviewed exception needs enough text to be a reason, not a label. */
export const MIN_REASON_LENGTH = 20;

/**
 * @typedef {{ max: number, reason: string }} BudgetException
 * @typedef {{ defaultMax: number, directoryMax?: Record<string, number>, files?: Record<string, number | BudgetException> }} BudgetScope
 * @typedef {{ file: string, lines: number }} SourceEntry
 * @typedef {{ file: string, lines: number, budget: number, reviewed: boolean }} BudgetResult
 * @typedef {{ file: string, message: string }} StaleException
 * @typedef {{ ok: boolean, results: BudgetResult[], violations: BudgetResult[], stale: StaleException[], errors: string[] }} BudgetEvaluation
 */

/** Counts maintained lines; a trailing newline does not start another line. */
export function lineCount(text) {
  if (!text) return 0;
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

/** Normalizes a number or reviewed object exception; null when malformed. */
export function normalizeException(entry) {
  if (typeof entry === "number") return { max: entry, reason: "" };
  if (entry && typeof entry === "object" && typeof entry.max === "number") {
    return { max: entry.max, reason: typeof entry.reason === "string" ? entry.reason : "" };
  }
  return null;
}

/**
 * Validates a scope before it is applied.
 *
 * @param {BudgetScope} scope
 * @param {string} label
 * @param {{ reviewed?: boolean }} [options] reviewed scopes require the object
 *   form and a stated reason for every exception.
 * @returns {string[]}
 */
export function validateScope(scope, label, { reviewed = false } = {}) {
  if (!scope || typeof scope !== "object") return [`${label} budget scope must be an object.`];
  const errors = [];
  if (!Number.isInteger(scope.defaultMax) || scope.defaultMax <= 0) {
    errors.push(`${label} budget needs a positive integer defaultMax.`);
  }
  for (const [file, raw] of Object.entries(scope.files ?? {})) {
    const exception = normalizeException(raw);
    if (!exception || !Number.isInteger(exception.max) || exception.max <= 0) {
      errors.push(`${label} exception ${file} needs a positive integer max.`);
      continue;
    }
    if (reviewed && typeof raw === "number") {
      errors.push(`${label} exception ${file} must be written as { "max", "reason" }.`);
      continue;
    }
    if (reviewed && exception.reason.trim().length < MIN_REASON_LENGTH) {
      errors.push(
        `${label} exception ${file} needs a reviewed reason of at least ${MIN_REASON_LENGTH} characters.`,
      );
    }
  }
  return errors;
}

/** Exact file exception first, then the longest matching directory limit. */
export function budgetFor(file, scope) {
  const exact = scope.files?.[file];
  if (exact !== undefined) return normalizeException(exact).max;
  let bestPrefix = "";
  for (const prefix of Object.keys(scope.directoryMax ?? {})) {
    if (file === prefix || file.startsWith(`${prefix}/`)) {
      if (prefix.length > bestPrefix.length) bestPrefix = prefix;
    }
  }
  if (bestPrefix) return scope.directoryMax[bestPrefix];
  return scope.defaultMax;
}

/**
 * Checks one scope. `stale` names exceptions whose file no longer exists, so a
 * rename or deletion cannot leave a permanent silent cap behind.
 *
 * @param {{ scope: BudgetScope, entries: SourceEntry[], label: string, reviewed?: boolean }} input
 * @returns {BudgetEvaluation}
 */
export function evaluateScope({ scope, entries, label, reviewed = false }) {
  const errors = validateScope(scope, label, { reviewed });
  const exceptions = scope.files ?? {};
  const results = entries.map((entry) => ({
    file: entry.file,
    lines: entry.lines,
    budget: budgetFor(entry.file, scope),
    reviewed: exceptions[entry.file] !== undefined,
  }));
  const violations = results.filter((entry) => entry.lines > entry.budget);
  const present = new Set(entries.map((entry) => entry.file));
  const stale = Object.keys(exceptions)
    .filter((file) => !present.has(file))
    .sort()
    .map((file) => ({
      file,
      message: `${label} exception ${file} no longer matches a source file; remove it.`,
    }));
  return {
    ok: errors.length === 0 && violations.length === 0 && stale.length === 0,
    results,
    violations,
    stale,
    errors,
  };
}

/**
 * Plans an `--update` write. A violation with no existing exception is a new
 * oversized file and is refused; an existing exception may only be raised to
 * the current line count. Stale exceptions are pruned.
 *
 * @param {{ scope: BudgetScope, violations: BudgetResult[], stale: StaleException[], label: string, reviewed?: boolean }} input
 * @returns {{ ok: boolean, errors: string[], unknown: BudgetResult[], next?: Record<string, number | BudgetException>, updated: number, pruned: number }}
 */
export function planUpdate({ scope, violations, stale, label, reviewed = false }) {
  const errors = validateScope(scope, label, { reviewed });
  if (errors.length) return { ok: false, errors, unknown: [], updated: 0, pruned: 0 };
  const unknown = violations.filter((entry) => !entry.reviewed);
  if (unknown.length) {
    return {
      ok: false,
      unknown,
      updated: 0,
      pruned: 0,
      errors: unknown.map(
        (entry) =>
          `${entry.file}: ${entry.lines} lines, budget ${entry.budget} (+${entry.lines - entry.budget})`,
      ),
    };
  }
  const staleFiles = new Set(stale.map((entry) => entry.file));
  const next = {};
  for (const [file, raw] of Object.entries(scope.files ?? {})) {
    if (staleFiles.has(file)) continue;
    next[file] = raw;
  }
  for (const entry of violations) {
    next[entry.file] =
      typeof scope.files?.[entry.file] === "number"
        ? entry.lines
        : {
            max: entry.lines,
            reason: normalizeException(scope.files?.[entry.file]).reason,
          };
  }
  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
  return {
    ok: true,
    errors: [],
    unknown: [],
    updated: violations.length,
    pruned: Object.keys(scope.files ?? {}).length - Object.keys(sorted).length,
    next: sorted,
  };
}

/** Human-readable console lines for one failed scope. */
export function formatProblems({ violations, stale, errors }) {
  const lines = [];
  for (const error of errors) lines.push(`- ${error}`);
  for (const entry of violations) {
    lines.push(
      `- ${entry.file}: ${entry.lines} lines, budget ${entry.budget} (+${entry.lines - entry.budget})`,
    );
  }
  for (const entry of stale) lines.push(`- ${entry.message}`);
  return lines;
}
