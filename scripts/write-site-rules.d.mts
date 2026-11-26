export interface WriteSite {
  line: number;
  column: number;
  kind: "assign" | "delete";
  root: string;
  target: string;
}

export interface WriteSiteEntry {
  file: string;
  count: number;
}

export interface WriteSiteException {
  max: number;
  reason: string;
}

export interface WriteSiteBudget {
  total: number;
  files?: Record<string, number | WriteSiteException>;
}

export interface WriteSiteResult {
  file: string;
  count: number;
  budget: number;
  reviewed: boolean;
}

export interface WriteSiteEvaluation {
  ok: boolean;
  results: WriteSiteResult[];
  violations: WriteSiteResult[];
  stale: { file: string; message: string }[];
  errors: string[];
  actualTotal: number;
  totalBudget: number;
  totalViolation: boolean;
}

export interface WriteSiteUpdate {
  ok: boolean;
  errors: string[];
  growth: WriteSiteResult[];
  next?: WriteSiteBudget;
  updated: number;
  pruned: number;
}

export const PROJECT_DERIVED_NAMES: readonly string[];

export function findWriteSites(text: string, fileName?: string): WriteSite[];

export function countWriteSites(text: string, fileName?: string): number;

export function normalizeBudget(entry: unknown): WriteSiteException | null;

export function validateBudget(config: WriteSiteBudget): string[];

export function budgetFor(file: string, config: WriteSiteBudget): number;

export function evaluateWriteSites(input: {
  config: WriteSiteBudget;
  entries: WriteSiteEntry[];
}): WriteSiteEvaluation;

export function planUpdate(input: {
  config: WriteSiteBudget;
  entries: WriteSiteEntry[];
}): WriteSiteUpdate;

export function formatProblems(
  evaluation: Pick<
    WriteSiteEvaluation,
    "violations" | "stale" | "errors" | "actualTotal" | "totalBudget" | "totalViolation"
  >,
): string[];
