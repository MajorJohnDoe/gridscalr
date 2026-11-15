export interface PerformanceBudget {
  key: string;
  label: string;
  budgetMs: number;
}

export interface PerformanceProfile {
  pages: number;
  items: number;
  images: number;
}

export interface ResolvedPerformanceProfile extends PerformanceProfile {
  name: string;
}

export interface PerformanceRow {
  key: string;
  label: string;
  valueMs: number | null;
  budgetMs: number;
  pass: boolean;
}

export interface PerformanceEvaluation {
  passed: boolean;
  rows: PerformanceRow[];
}

export declare const PERFORMANCE_BUDGETS: readonly PerformanceBudget[];
export declare const PERFORMANCE_MEMORY_BUDGET_MB: number;
export declare const PERFORMANCE_PROFILES: Record<string, PerformanceProfile>;
export declare const PERFORMANCE_SEED: number;

export declare function performanceProfile(
  name?: string,
  overrides?: Partial<PerformanceProfile>,
): ResolvedPerformanceProfile;
export declare function measureValue(
  result: Record<string, unknown> | undefined,
  key: string,
): number | null;
export declare function evaluatePerformanceBudgets(
  result: Record<string, unknown> | undefined,
  budgets?: readonly PerformanceBudget[],
): PerformanceEvaluation;
export declare function formatMeasure(valueMs: number | null): string;
export declare function formatBudgetRow(row: PerformanceRow): string;
