/**
 * Undo history is bounded by both a fixed entry count and an approximate
 * serialised-size budget. Large projects keep fewer full snapshots, which
 * keeps memory stable without changing the undo/redo contract.
 */
export const HISTORY_LIMIT = 80;
export const HISTORY_MIN_ENTRIES = 4;
export const HISTORY_BUDGET_CHARS = 48 * 1024 * 1024;

export function historyLimitForSnapshot(snapshot: string): number {
  if (snapshot.length <= 0) return HISTORY_LIMIT;
  const byBudget = Math.floor(HISTORY_BUDGET_CHARS / snapshot.length);
  return Math.max(HISTORY_MIN_ENTRIES, Math.min(HISTORY_LIMIT, byBudget));
}

/**
 * Pushes a snapshot and drops the oldest entries until the stack fits the
 * adaptive limit. The newest snapshot is always kept.
 */
export function pushHistory(stack: string[], snapshot: string): void {
  stack.push(snapshot);
  const limit = historyLimitForSnapshot(snapshot);
  while (stack.length > limit) stack.shift();
}
