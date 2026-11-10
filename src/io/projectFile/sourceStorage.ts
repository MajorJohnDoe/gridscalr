import type { DocumentRef } from "../../model/types";

/**
 * Schema 24 → 25 source-storage migration.
 *
 * Every existing document becomes an explicit reference. No file is copied,
 * moved or touched, and a document that already declares a mode keeps it.
 * Provenance fields only exist from schema 25 and only for managed copies.
 */
export function migrateSourceStorage(documents: readonly DocumentRef[], fromSchema: number): void {
  for (const document of documents) {
    // `storage` and the provenance fields did not exist before schema 25, so a
    // marker in older data is ignored rather than trusted.
    if (fromSchema < 25 || document.storage !== "managed") document.storage = "reference";
    if (document.storage !== "managed" || fromSchema < 25) {
      delete document.originalPath;
      delete document.originalSha256;
    }
    if (document.storage === "managed" && document.originalPath === undefined) {
      document.originalPath = null;
    }
  }
}
