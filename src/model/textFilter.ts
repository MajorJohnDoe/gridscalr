/**
 * Shared, dependency-free text filtering used by every list panel. Keeping it
 * in `src/model` lets a pure row model import the rule without pulling a UI
 * feature barrel into the module graph.
 */

/** Trim and lower-case one filter query once, before matching many rows. */
export function normalizeFilterQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}

/** True when the searchable text contains the already-normalized query. */
export function matchesFilterText(haystack: string, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return haystack.toLocaleLowerCase().includes(normalizedQuery);
}
