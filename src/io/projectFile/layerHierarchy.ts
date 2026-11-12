/**
 * Schema 25 → 26 layer-hierarchy migration.
 *
 * Schema 26 adds an optional `parentId` on a layer. `parentId` did not exist
 * before schema 26, so a marker in older data is ignored rather than trusted;
 * every schema 1–25 layer becomes a root. Nothing else changes: layer, item,
 * page and document IDs are preserved, no file is touched and no ID is
 * generated, so the migration is deterministic for a given file.
 *
 * Schema 26 and later values are kept verbatim. The normalizer trims them and
 * reports a malformed value; an unresolved parent is reported by the integrity
 * validator instead of being dropped or reparented. See ADR 0014.
 */
export function migrateLayerHierarchy(rawLayers: unknown, fromSchema: number): number {
  if (!Array.isArray(rawLayers) || fromSchema >= 26) return 0;
  let ignored = 0;
  for (const entry of rawLayers) {
    if (typeof entry !== "object" || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    if (!("parentId" in raw)) continue;
    delete raw.parentId;
    ignored += 1;
  }
  return ignored;
}
