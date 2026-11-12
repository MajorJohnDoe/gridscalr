export interface BudgetException {
  max: number;
  reason: string;
}

export interface BudgetScope {
  defaultMax: number;
  directoryMax?: Record<string, number>;
  files?: Record<string, number | BudgetException>;
}

export interface SourceEntry {
  file: string;
  lines: number;
}

export interface BudgetResult extends SourceEntry {
  budget: number;
  reviewed: boolean;
}

export interface StaleException {
  file: string;
  message: string;
}

export interface BudgetEvaluation {
  ok: boolean;
  results: BudgetResult[];
  violations: BudgetResult[];
  stale: StaleException[];
  errors: string[];
}

export interface BudgetUpdate {
  ok: boolean;
  errors: string[];
  unknown: BudgetResult[];
  next?: Record<string, number | BudgetException>;
  updated: number;
  pruned: number;
}

export const MIN_REASON_LENGTH: number;

export function lineCount(text: string): number;

export function normalizeException(entry: unknown): BudgetException | null;

export function validateScope(
  scope: BudgetScope,
  label: string,
  options?: { reviewed?: boolean },
): string[];

export function budgetFor(file: string, scope: BudgetScope): number;

export function evaluateScope(input: {
  scope: BudgetScope;
  entries: SourceEntry[];
  label: string;
  reviewed?: boolean;
}): BudgetEvaluation;

export function planUpdate(input: {
  scope: BudgetScope;
  violations: BudgetResult[];
  stale: StaleException[];
  label: string;
  reviewed?: boolean;
}): BudgetUpdate;

export function formatProblems(
  evaluation: Pick<BudgetEvaluation, "violations" | "stale" | "errors">,
): string[];
