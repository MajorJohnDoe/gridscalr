import { includedLocalPages } from "../../model/documents";
import { stablePageId } from "../../model/pages";
import type { DocumentRef, PageId, PageRecord } from "../../model/types";

/**
 * Schema 23 → 24 page migration and schema 24 page normalization.
 *
 * Migration is a pure mapping over the raw file. It is deterministic for a
 * given file: legacy page IDs derive from the project, document, local page and
 * document-order ordinal. Nothing is silently remapped: every invalid legacy
 * reference is reported in `warnings`.
 */

export interface PageMigration {
  records: PageRecord[];
  /** Raw page state values keyed by the new page ID, normalized later. */
  states: Map<PageId, unknown>;
  /** True when the input used the pre-24 numeric page map. */
  legacy: boolean;
  warnings: string[];
  firstPageId: PageId | null;
  /** Resolves a stored pageId or a legacy page number. */
  resolvePage(value: unknown): PageId | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function uniqueId(candidate: string, used: Set<string>): string {
  let id = candidate;
  let suffix = 2;
  while (used.has(id)) {
    id = `${candidate}_${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function legacyRecords(documents: readonly DocumentRef[], projectId: string): PageRecord[] {
  const records: PageRecord[] = [];
  let ordinal = 0;
  for (const document of documents) {
    for (const localPage of includedLocalPages(document)) {
      ordinal += 1;
      records.push({
        id: stablePageId(projectId || "project", document.id, localPage, ordinal),
        documentId: document.id,
        localPage,
        state: {},
      });
    }
  }
  return records;
}

function arrayRecords(
  rawPages: unknown[],
  documents: readonly DocumentRef[],
  projectId: string,
  warnings: string[],
): PageRecord[] {
  const documentIds = new Set(documents.map((document) => document.id));
  const used = new Set<string>();
  const records: PageRecord[] = [];
  rawPages.forEach((value, index) => {
    if (!isObject(value)) {
      warnings.push("projectFile.migrationInvalidPageRecord");
      return;
    }
    const raw = value as Partial<PageRecord> & { id?: unknown; documentId?: unknown };
    const documentId = typeof raw.documentId === "string" ? raw.documentId : "";
    if (!documentIds.has(documentId)) {
      warnings.push("projectFile.migrationMissingPageDocument");
      return;
    }
    const document = documents.find((entry) => entry.id === documentId)!;
    const localPage =
      typeof raw.localPage === "number" && Number.isFinite(raw.localPage)
        ? Math.max(1, Math.min(document.pageCount, Math.round(raw.localPage)))
        : 1;
    if (localPage !== raw.localPage) warnings.push("projectFile.migrationClampedPage");
    const candidate =
      typeof raw.id === "string" && raw.id
        ? raw.id
        : stablePageId(projectId || "project", documentId, localPage, index + 1);
    records.push({
      id: uniqueId(candidate, used),
      documentId,
      localPage,
      state: {},
    });
  });
  return records;
}

export function migratePages(
  rawPages: unknown,
  documents: readonly DocumentRef[],
  projectId: string,
): PageMigration {
  const warnings: string[] = [];
  const records = Array.isArray(rawPages)
    ? arrayRecords(rawPages, documents, projectId, warnings)
    : legacyRecords(documents, projectId);
  const legacy = !Array.isArray(rawPages);
  const byId = new Set(records.map((record) => record.id));
  const byNumber = new Map<number, PageId>();
  records.forEach((record, index) => byNumber.set(index + 1, record.id));
  const first = records[0]?.id ?? null;
  const states = new Map<PageId, unknown>();

  const resolvePage = (value: unknown): PageId | null => {
    if (typeof value === "string" && byId.has(value)) return value;
    if (typeof value === "number" && Number.isFinite(value)) {
      const mapped = byNumber.get(Math.round(value));
      if (mapped) return mapped;
    }
    return null;
  };

  if (Array.isArray(rawPages)) {
    rawPages.forEach((value, index) => {
      const record = records[index];
      if (!record || !isObject(value)) return;
      const state = (value as { state?: unknown }).state;
      if (state !== undefined) states.set(record.id, state);
    });
  } else if (isObject(rawPages)) {
    for (const [key, value] of Object.entries(rawPages)) {
      const page = Number(key);
      const pageId = Number.isInteger(page) ? byNumber.get(page) : undefined;
      if (!pageId) {
        warnings.push("projectFile.migrationInvalidPageState");
        continue;
      }
      states.set(pageId, value);
    }
  }

  return {
    records,
    states,
    legacy,
    warnings,
    firstPageId: first,
    resolvePage,
  };
}

/** Maps one legacy or current item onto a pageId, reporting invalid values. */
export function migrateItemPage(
  rawValue: unknown,
  migration: PageMigration,
): Record<string, unknown> | null {
  if (!isObject(rawValue)) return null;
  const raw = { ...rawValue } as Record<string, unknown>;
  const storedPage = migration.resolvePage(raw.pageId);
  const legacyPage = migration.resolvePage(raw.page);
  const resolved = storedPage ?? legacyPage ?? migration.firstPageId;
  if (raw.pageId !== undefined && storedPage === null) {
    migration.warnings.push("projectFile.migrationInvalidItemPage");
  } else if (raw.pageId === undefined && raw.page !== undefined && legacyPage === null) {
    migration.warnings.push("projectFile.migrationInvalidItemPage");
  }
  if (!resolved) return null;
  raw.pageId = resolved;
  delete raw.page;
  return raw;
}

/** Maps layer home page and per-page state keys onto page IDs. */
export function migrateLayerPages(
  rawValue: unknown,
  migration: PageMigration,
): Record<string, unknown> | null {
  if (!isObject(rawValue)) return null;
  const raw = { ...rawValue } as Record<string, unknown>;
  const home = raw.homePageId ?? raw.homePage;
  if (home !== undefined) {
    const resolved = migration.resolvePage(home);
    if (resolved) raw.homePageId = resolved;
    else migration.warnings.push("projectFile.migrationInvalidLayerHome");
  }
  delete raw.homePage;

  if (isObject(raw.pageState)) {
    const remapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw.pageState)) {
      const resolved = migration.resolvePage(key) ?? migration.resolvePage(Number(key));
      if (!resolved) {
        migration.warnings.push("projectFile.migrationInvalidLayerPageState");
        continue;
      }
      remapped[resolved] = value;
    }
    if (Object.keys(remapped).length) raw.pageState = remapped;
    else delete raw.pageState;
  }

  if (Array.isArray(raw.items)) {
    raw.items = raw.items
      .map((item) => migrateItemPage(item, migration))
      .filter((item): item is Record<string, unknown> => item !== null);
  }
  return raw;
}

/** Migrates the page references inside every raw layer. */
export function migrateLayers(rawLayers: unknown, migration: PageMigration): unknown[] {
  if (!Array.isArray(rawLayers)) return [];
  return rawLayers
    .map((layer) => migrateLayerPages(layer, migration))
    .filter((layer): layer is Record<string, unknown> => layer !== null);
}
