import { currentLocale } from "../../../i18n";
import type { Project, ScheduleDefinition } from "../../../model/types";
import { computeSchedule, type ComputeScheduleOptions } from "./compute";
import { filterSignature } from "./filters";
import type { ScheduleResult } from "./types";

/**
 * Revision-scoped caches. Every store change bumps `Store.revision`, so a cache
 * entry can only answer for the exact project state that produced it. The
 * active locale is part of the key because cell text, dates and number
 * formatting are localized.
 */

export interface KeyCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): T;
  clear(): void;
}

export function createKeyCache<T>(max = 24): KeyCache<T> {
  const entries = new Map<string, T>();
  return {
    get(key) {
      return entries.get(key);
    },
    set(key, value) {
      entries.set(key, value);
      while (entries.size > max) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      return value;
    },
    clear() {
      entries.clear();
    },
  };
}

const scheduleCache = createKeyCache<ScheduleResult>(24);

export function scheduleCacheKey(
  revision: number,
  scheduleId: string,
  options: ComputeScheduleOptions = {},
): string {
  return [
    revision,
    scheduleId,
    currentLocale(),
    options.limit ?? "",
    filterSignature(options.extra),
  ].join(":");
}

/** Cached schedule computation; a new revision or locale computes afresh. */
export function cachedSchedule(
  revision: number,
  project: Project,
  definition: ScheduleDefinition,
  options: ComputeScheduleOptions = {},
): ScheduleResult {
  const key = scheduleCacheKey(revision, definition.id, options);
  const hit = scheduleCache.get(key);
  if (hit) return hit;
  return scheduleCache.set(key, computeSchedule(project, definition, options));
}

/** Clears every schedule result. Tests use it; the app relies on revision keys. */
export function clearScheduleCache(): void {
  scheduleCache.clear();
}
