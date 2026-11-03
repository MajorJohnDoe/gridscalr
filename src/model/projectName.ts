/** Longest project name accepted by the rename field and the title-row editor. */
export const PROJECT_NAME_MAX_LENGTH = 120;

/**
 * Project names reach reports, exports, package names and suggested file names,
 * so every rename path cleans the value the same way. An empty result keeps the
 * previous name instead of leaving the project unnamed.
 */
export function normalizeProjectName(value: string, fallback: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, PROJECT_NAME_MAX_LENGTH).trim();
  return cleaned || fallback;
}
