import { t } from "../../i18n";
import type { Project } from "../../model/types";
import { planRecoveryPrune, type RecoveryPruneOptions } from "./budget";
import { describeAutosaveFailure } from "./failure";
import { isRecoveryRecord, sortRecoveryRecords, type RecoveryRecord } from "./record";

const DB_NAME = "gridscalr";
const DB_VERSION = 2;
const STORE_NAME = "recovery";
const LEGACY_STORE = "autosave";
const LEGACY_RECORD_KEY = "current";
const LEGACY_LOCAL_KEY = "gridscalr.autosave.v1";
const LEGACY_META_KEY = "gridscalr.autosave.meta.v1";
const FALLBACK_KEY = "gridscalr.autosave.v2";

export interface LegacySnapshot {
  project: Project;
  projectPath: string | null;
  savedAt: string;
}

export function openRecoveryDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error(t("autosave.noIndexedDb")));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(t("autosave.openFailed")));
    request.onblocked = () => reject(new Error(t("autosave.blocked")));
  });
}

function readLocalFallback(): RecoveryRecord[] {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecoveryRecord) : [];
  } catch {
    return [];
  }
}

function writeLocalFallback(records: RecoveryRecord[]): void {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(records));
}

function prune(
  records: RecoveryRecord[],
  keepId: string,
  options: RecoveryPruneOptions,
): Set<string> {
  return new Set(planRecoveryPrune(records, { ...options, keepId }));
}

function writeFallback(record: RecoveryRecord, options: RecoveryPruneOptions): void {
  const records = sortRecoveryRecords(readLocalFallback());
  const merged = [...records.filter((entry) => entry.id !== record.id), record];
  const remove = prune(merged, record.id, options);
  writeLocalFallback(merged.filter((entry) => !remove.has(entry.id)));
}

/**
 * Writes one record. The merged set is pruned before the new record is stored,
 * so a write that would exceed the byte budget deletes its oldest records
 * first instead of needing peak space for both. The newest autosave and newest
 * checkpoint of every project, plus the record being written, are never pruned.
 */
export async function writeRecord(
  record: RecoveryRecord,
  options: RecoveryPruneOptions = {},
): Promise<void> {
  try {
    const database = await openRecoveryDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          const existing = Array.isArray(request.result)
            ? request.result.filter(isRecoveryRecord)
            : [];
          const merged = [...existing.filter((entry) => entry.id !== record.id), record];
          for (const id of prune(merged, record.id, options)) store.delete(id);
          store.put(record, record.id);
        } catch (error) {
          try {
            transaction.abort();
          } catch {
            // An already finished transaction needs no abort.
          }
          reject(error);
        }
      };
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error(t("autosave.storageFailed")));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error(t("autosave.storageFailed")));
      };
    });
    return;
  } catch (error) {
    // Keep a small fallback when IndexedDB is unavailable. It is keyed by
    // project and instance as well, so it can never mix two projects.
    try {
      writeFallback(record, options);
    } catch (fallbackError) {
      throw describeAutosaveFailure(error, fallbackError);
    }
  }
}

export async function readAllRecords(): Promise<RecoveryRecord[]> {
  try {
    const database = await openRecoveryDatabase();
    const records = await new Promise<RecoveryRecord[]>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        resolve(Array.isArray(request.result) ? request.result.filter(isRecoveryRecord) : []);
      };
      request.onerror = () => reject(request.error ?? new Error(t("autosave.storageFailed")));
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error(t("autosave.storageFailed")));
      };
    });
    const merged = new Map<string, RecoveryRecord>();
    for (const record of readLocalFallback()) merged.set(record.id, record);
    for (const record of records) merged.set(record.id, record);
    return sortRecoveryRecords([...merged.values()]);
  } catch (error) {
    const fallback = sortRecoveryRecords(readLocalFallback());
    if (fallback.length) return fallback;
    throw error;
  }
}

export async function deleteRecord(id: string): Promise<void> {
  try {
    const database = await openRecoveryDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error(t("autosave.storageFailed")));
      };
    });
  } catch {
    // The local fallback is still cleaned below; the caller reports the failure.
  }
  try {
    writeLocalFallback(readLocalFallback().filter((record) => record.id !== id));
  } catch {
    // Ignore unavailable storage.
  }
}

export async function clearRecords(): Promise<void> {
  try {
    const database = await openRecoveryDatabase();
    await new Promise<void>((resolve) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        resolve();
      };
    });
  } catch {
    // Fall through to the local fallback and legacy keys.
  }
  try {
    writeLocalFallback([]);
  } catch {
    // Ignore unavailable storage.
  }
  await clearLegacy();
}

function legacyPayload(value: unknown): LegacySnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.serialized === "string") {
    try {
      const project = JSON.parse(record.serialized) as Project;
      if (!Array.isArray(project?.documents)) return null;
      return {
        project,
        projectPath: typeof record.projectPath === "string" ? record.projectPath : null,
        savedAt: typeof record.savedAt === "string" ? record.savedAt : new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
  const project = record.project as Project | undefined;
  if (!project || !Array.isArray(project.documents)) return null;
  return {
    project,
    projectPath: typeof record.projectPath === "string" ? record.projectPath : null,
    savedAt: typeof record.savedAt === "string" ? record.savedAt : new Date().toISOString(),
  };
}

function readLegacyLocal(): LegacySnapshot | null {
  try {
    const raw = localStorage.getItem(LEGACY_LOCAL_KEY);
    return raw ? legacyPayload(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

async function readLegacyIndexedDb(): Promise<LegacySnapshot | null> {
  try {
    const database = await openRecoveryDatabase();
    if (!database.objectStoreNames.contains(LEGACY_STORE)) {
      database.close();
      return null;
    }
    return await new Promise<LegacySnapshot | null>((resolve) => {
      const transaction = database.transaction(LEGACY_STORE, "readonly");
      const request = transaction.objectStore(LEGACY_STORE).get(LEGACY_RECORD_KEY);
      request.onsuccess = () => resolve(legacyPayload(request.result));
      request.onerror = () => resolve(null);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => {
        database.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/** One legacy `current` snapshot, from localStorage first and IndexedDB second. */
export async function readLegacySnapshot(): Promise<LegacySnapshot | null> {
  return readLegacyLocal() ?? (await readLegacyIndexedDb());
}

export async function clearLegacy(): Promise<void> {
  try {
    localStorage.removeItem(LEGACY_LOCAL_KEY);
    localStorage.removeItem(LEGACY_META_KEY);
  } catch {
    // Ignore unavailable storage.
  }
  try {
    const database = await openRecoveryDatabase();
    if (!database.objectStoreNames.contains(LEGACY_STORE)) {
      database.close();
      return;
    }
    await new Promise<void>((resolve) => {
      const transaction = database.transaction(LEGACY_STORE, "readwrite");
      transaction.objectStore(LEGACY_STORE).delete(LEGACY_RECORD_KEY);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        resolve();
      };
    });
  } catch {
    // The migrated v2 record is already in place; a stale legacy key is harmless.
  }
}
