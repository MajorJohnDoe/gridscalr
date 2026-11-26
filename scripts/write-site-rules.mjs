/**
 * Pure analyzer and budget rules for the write-site ratchet.
 *
 * A write site is a direct assignment or `delete` inside a `store.mutate(...)`
 * callback whose target is a property access on a project-derived identifier.
 * Those are the writes that bypass a command module: every one is counted, the
 * reviewed baseline lives in `write-sites.json`, and the gate fails when a file
 * grows past it or the total grows.
 *
 * This module owns the rules and uses the TypeScript parser, so comments and
 * strings cannot fake a site. `check-write-sites.mjs` walks the tree; the tests
 * in `tests/writeSiteGate.test.ts` prove the analyzer on synthetic source.
 */
import ts from "typescript";

/**
 * Identifiers the rule treats as project-derived even when they are not the
 * mutate callback parameter. The first parameter of every `store.mutate`
 * callback is added automatically, so `(current) =>` and `(next) =>` count the
 * same as `(project) =>`.
 */
export const PROJECT_DERIVED_NAMES = Object.freeze([
  "project",
  "item",
  "target",
  "layer",
  "category",
  "space",
  "schedule",
  "page",
  "document",
  "asset",
  "settings",
  "field",
  "view",
  "entry",
  "row",
]);

/** Every assignment operator that writes the left-hand side. */
const ASSIGNMENT_OPERATORS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

/**
 * @typedef {{ line: number, column: number, kind: "assign" | "delete", root: string, target: string }} WriteSite
 * @typedef {{ file: string, count: number }} WriteSiteEntry
 * @typedef {{ max: number, reason: string }} WriteSiteException
 * @typedef {{ total: number, files?: Record<string, number | WriteSiteException> }} WriteSiteBudget
 * @typedef {{ file: string, count: number, budget: number, reviewed: boolean }} WriteSiteResult
 */

function isAssignmentOperator(kind) {
  return ASSIGNMENT_OPERATORS.has(kind);
}

/** True for `store.mutate(...)` and the store's own `this.mutate(...)` calls. */
function isStoreMutateCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "mutate") return false;
  const receiver = callee.expression;
  return ts.isIdentifier(receiver)
    ? receiver.text === "store"
    : receiver.kind === ts.SyntaxKind.ThisKeyword;
}

/** The callback passed as the first argument, when it is a function literal. */
function mutateCallback(node) {
  const argument = node.arguments[0];
  if (!argument) return undefined;
  return ts.isArrowFunction(argument) || ts.isFunctionExpression(argument) ? argument : undefined;
}

/** Walks a property or element access chain back to its root identifier. */
function rootIdentifier(expression) {
  let node = expression;
  while (true) {
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node)
    ) {
      node = node.expression;
      continue;
    }
    if (ts.isPropertyAccessExpression(node)) {
      node = node.expression;
      continue;
    }
    if (ts.isElementAccessExpression(node)) {
      node = node.expression;
      continue;
    }
    break;
  }
  return ts.isIdentifier(node) ? node.text : undefined;
}

function isPropertyTarget(expression) {
  return ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression);
}

function position(sourceFile, node) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: start.line + 1, column: start.character + 1 };
}

function scanCallback(callback, names, sourceFile, sites) {
  const first = callback.parameters[0];
  if (first && ts.isIdentifier(first.name)) names.add(first.name.text);
  const body = callback.body;

  const visit = (node) => {
    // A nested mutate call has its own callback and is counted separately.
    if (isStoreMutateCall(node)) return;

    if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
      if (isPropertyTarget(node.left)) {
        const root = rootIdentifier(node.left);
        if (root && names.has(root)) {
          sites.push({
            ...position(sourceFile, node),
            kind: "assign",
            root,
            target: node.left.getText(sourceFile),
          });
        }
      }
    } else if (ts.isDeleteExpression(node)) {
      const expression = node.expression;
      if (isPropertyTarget(expression)) {
        const root = rootIdentifier(expression);
        if (root && names.has(root)) {
          sites.push({
            ...position(sourceFile, node),
            kind: "delete",
            root,
            target: expression.getText(sourceFile),
          });
        }
      }
    } else if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.DeleteKeyword) {
      const expression = node.operand;
      if (isPropertyTarget(expression)) {
        const root = rootIdentifier(expression);
        if (root && names.has(root)) {
          sites.push({
            ...position(sourceFile, node),
            kind: "delete",
            root,
            target: expression.getText(sourceFile),
          });
        }
      }
    }

    node.forEachChild(visit);
  };

  visit(body);
}

/**
 * Finds every inline project write inside a mutate callback.
 *
 * @param {string} text
 * @param {string} [fileName]
 * @returns {WriteSite[]}
 */
export function findWriteSites(text, fileName = "source.ts") {
  const sourceFile = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const sites = [];
  const collect = (node) => {
    if (isStoreMutateCall(node)) {
      const callback = mutateCallback(node);
      if (callback) {
        scanCallback(callback, new Set(PROJECT_DERIVED_NAMES), sourceFile, sites);
      }
    }
    node.forEachChild(collect);
  };
  collect(sourceFile);
  return sites.sort((a, b) => a.line - b.line || a.column - b.column);
}

/** Convenience for the gate: one number per source file. */
export function countWriteSites(text, fileName) {
  return findWriteSites(text, fileName).length;
}

/** Normalizes a number or reviewed object budget; null when malformed. */
export function normalizeBudget(entry) {
  if (typeof entry === "number") return { max: entry, reason: "" };
  if (entry && typeof entry === "object" && typeof entry.max === "number") {
    return { max: entry.max, reason: typeof entry.reason === "string" ? entry.reason : "" };
  }
  return null;
}

/**
 * Validates the committed budget before it is applied. A reviewed object entry
 * must state why the file still carries inline writes.
 *
 * @param {WriteSiteBudget} config
 * @returns {string[]}
 */
export function validateBudget(config) {
  if (!config || typeof config !== "object") return ["write-sites budget must be an object."];
  const errors = [];
  if (!Number.isInteger(config.total) || config.total < 0) {
    errors.push("write-sites budget needs a non-negative integer total.");
  }
  for (const [file, raw] of Object.entries(config.files ?? {})) {
    const entry = normalizeBudget(raw);
    if (!entry || !Number.isInteger(entry.max) || entry.max < 0) {
      errors.push(`write-sites budget ${file} needs a non-negative integer max.`);
      continue;
    }
    if (raw && typeof raw === "object" && entry.reason.trim().length === 0) {
      errors.push(`write-sites budget ${file} is a reviewed exception and needs a reason.`);
    }
  }
  return errors;
}

/** Exact file budget, or zero: an unlisted file may not add a site. */
export function budgetFor(file, config) {
  const entry = config.files?.[file];
  return entry === undefined ? 0 : normalizeBudget(entry).max;
}

/**
 * Evaluates actual per-file counts against the reviewed budget.
 *
 * @param {{ config: WriteSiteBudget, entries: WriteSiteEntry[] }} input
 * @returns {{
 *   ok: boolean,
 *   results: WriteSiteResult[],
 *   violations: WriteSiteResult[],
 *   stale: { file: string, message: string }[],
 *   errors: string[],
 *   actualTotal: number,
 *   totalBudget: number,
 *   totalViolation: boolean
 * }}
 */
export function evaluateWriteSites({ config, entries }) {
  const errors = validateBudget(config);
  const configFiles = config.files ?? {};
  const results = entries.map((entry) => ({
    file: entry.file,
    count: entry.count,
    budget: budgetFor(entry.file, config),
    reviewed: configFiles[entry.file] !== undefined,
  }));
  const violations = results.filter((entry) => entry.count > entry.budget);
  const present = new Map(entries.map((entry) => [entry.file, entry.count]));
  const stale = Object.keys(configFiles)
    .filter((file) => !present.has(file) || present.get(file) === 0)
    .sort()
    .map((file) => ({
      file,
      message: `write-sites budget ${file} has no inline writes left; run --update to prune it.`,
    }));
  const actualTotal = entries.reduce((sum, entry) => sum + entry.count, 0);
  const totalViolation = actualTotal > config.total;
  return {
    ok: errors.length === 0 && violations.length === 0 && stale.length === 0 && !totalViolation,
    results,
    violations,
    stale,
    errors,
    actualTotal,
    totalBudget: config.total,
    totalViolation,
  };
}

/**
 * Plans an `--update` write. The ratchet only lowers per-file budgets to the
 * current count and prunes entries that no longer have a site. It never raises
 * a budget and never records a new file, so a growth cannot be accepted by
 * running the update command.
 *
 * @param {{ config: WriteSiteBudget, entries: WriteSiteEntry[] }} input
 * @returns {{
 *   ok: boolean,
 *   errors: string[],
 *   growth: WriteSiteResult[],
 *   next?: WriteSiteBudget,
 *   updated: number,
 *   pruned: number
 * }}
 */
export function planUpdate({ config, entries }) {
  const errors = validateBudget(config);
  if (errors.length) return { ok: false, errors, growth: [], updated: 0, pruned: 0 };
  const evaluation = evaluateWriteSites({ config, entries });
  const growth = evaluation.violations.filter((entry) => entry.count > entry.budget);
  const growthTotal =
    evaluation.actualTotal > config.total
      ? [{ file: "<total>", count: evaluation.actualTotal, budget: config.total, reviewed: true }]
      : [];
  if (growth.length || growthTotal.length) {
    return {
      ok: false,
      errors: [
        "Refusing to raise a write-site budget; move the write into a command module or lower it deliberately.",
      ],
      growth: [...growth, ...growthTotal],
      updated: 0,
      pruned: 0,
    };
  }

  const counts = new Map(entries.map((entry) => [entry.file, entry.count]));
  const nextFiles = {};
  let updated = 0;
  let pruned = 0;
  for (const [file, raw] of Object.entries(config.files ?? {})) {
    const count = counts.get(file) ?? 0;
    if (count === 0) {
      pruned += 1;
      continue;
    }
    const current = normalizeBudget(raw);
    if (count < current.max) updated += 1;
    nextFiles[file] = typeof raw === "number" ? count : { max: count, reason: current.reason };
  }
  const sorted = Object.fromEntries(
    Object.entries(nextFiles).sort(([a], [b]) => a.localeCompare(b)),
  );
  return {
    ok: true,
    errors: [],
    growth: [],
    next: { total: Math.min(config.total, evaluation.actualTotal), files: sorted },
    updated,
    pruned,
  };
}

/** Human-readable console lines for a failed check. */
export function formatProblems({
  violations,
  stale,
  errors,
  actualTotal,
  totalBudget,
  totalViolation,
}) {
  const lines = [];
  for (const error of errors) lines.push(`- ${error}`);
  for (const entry of violations) {
    const noun = entry.count === 1 ? "inline write" : "inline writes";
    lines.push(
      `- ${entry.file}: ${entry.count} ${noun}, budget ${entry.budget} (+${entry.count - entry.budget})`,
    );
  }
  if (totalViolation) {
    lines.push(
      `- total: ${actualTotal} inline writes, budget ${totalBudget} (+${actualTotal - totalBudget})`,
    );
  }
  for (const entry of stale) lines.push(`- ${entry.message}`);
  return lines;
}
