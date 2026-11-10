import type { ProjectIssue } from "../../model/integrity";

/**
 * Counts of data that normalization dropped or repaired. Codes are stable and
 * localized by the project-integrity feature; the parser never hides a drop.
 */
export interface LoadReportCount {
  code: string;
  count: number;
}

export interface ProjectLoadReport {
  /** Translation keys for invalid references found while migrating. */
  warnings: string[];
  migratedFrom: number;
  /** Entries that were dropped because they were invalid. */
  dropped: LoadReportCount[];
  /** Entries that were changed deterministically, for example duplicate IDs. */
  repaired: LoadReportCount[];
  /** Issues that remain after normalization. */
  issues: ProjectIssue[];
}

/** Mutable collector used while parsing one project file. */
export class LoadReportBuilder {
  private readonly dropped = new Map<string, number>();
  private readonly repaired = new Map<string, number>();

  drop(code: string, count = 1): void {
    if (count <= 0) return;
    this.dropped.set(code, (this.dropped.get(code) ?? 0) + count);
  }

  repair(code: string, count = 1): void {
    if (count <= 0) return;
    this.repaired.set(code, (this.repaired.get(code) ?? 0) + count);
  }

  counts(): { dropped: LoadReportCount[]; repaired: LoadReportCount[] } {
    const sort = (entries: Map<string, number>): LoadReportCount[] =>
      [...entries.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((left, right) => left.code.localeCompare(right.code));
    return { dropped: sort(this.dropped), repaired: sort(this.repaired) };
  }
}

/** Counts raw input entries so normalization drops can be reported. */
export function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function objectKeyCount(value: unknown): number {
  return typeof value === "object" && value !== null ? Object.keys(value).length : 0;
}

export function droppedCount(raw: number, parsed: number): number {
  return Math.max(0, raw - parsed);
}

/** Counts repeated `id` values in a raw array. */
export function duplicateIdCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  const seen = new Set<string>();
  let duplicates = 0;
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== "string" || !id) continue;
    if (seen.has(id)) duplicates += 1;
    else seen.add(id);
  }
  return duplicates;
}

export function rawItemCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  let count = 0;
  for (const layer of value) {
    if (typeof layer !== "object" || layer === null) continue;
    const items = (layer as { items?: unknown }).items;
    if (Array.isArray(items)) count += items.length;
  }
  return count;
}

export function parsedItemCount(layers: readonly { items: readonly unknown[] }[]): number {
  return layers.reduce((total, layer) => total + layer.items.length, 0);
}
