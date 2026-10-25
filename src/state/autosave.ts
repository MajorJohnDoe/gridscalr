import type { Project } from "../model/types";

export interface AutosavePayload {
  project: Project;
  projectPath: string | null;
  savedAt: string;
}

export interface AutosavePreview {
  savedAt: string;
  projectName: string;
}

const DB_NAME = "gridscalr";
const DB_VERSION = 1;
const STORE_NAME = "autosave";
const RECORD_KEY = "current";
const META_KEY = "gridscalr.autosave.meta.v1";
const LEGACY_KEY = "gridscalr.autosave.v1";

function hasProject(value: unknown): value is AutosavePayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as AutosavePayload;
  return Array.isArray(payload.project?.documents) && payload.project.documents.length > 0;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
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
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open the recovery database."));
    request.onblocked = () =>
      reject(new Error("The recovery database is blocked by another window."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Recovery storage failed."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Recovery storage failed."));
    };
  });
}

function readLegacy(): AutosavePayload | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AutosavePayload;
    return hasProject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeMeta(preview: AutosavePreview): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(preview));
  } catch {
    // The IndexedDB record still exists; only the welcome-screen shortcut is lost.
  }
}

export function readAutosavePreview(): AutosavePreview | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AutosavePreview;
      if (parsed?.savedAt && parsed?.projectName) return parsed;
    }
  } catch {
    // Fall through to the legacy record.
  }
  const legacy = readLegacy();
  if (!legacy) return null;
  const preview = { savedAt: legacy.savedAt, projectName: legacy.project.name };
  writeMeta(preview);
  return preview;
}

let pendingWrite: Promise<void> = Promise.resolve();

export async function writeAutosave(payload: AutosavePayload): Promise<void> {
  const run = pendingWrite.then(() => writeAutosaveNow(payload));
  pendingWrite = run.catch(() => undefined);
  return run;
}

async function writeAutosaveNow(payload: AutosavePayload): Promise<void> {
  const preview = { savedAt: payload.savedAt, projectName: payload.project.name };
  try {
    await withStore("readwrite", (store) => store.put(payload, RECORD_KEY));
    writeMeta(preview);
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // Ignore unavailable storage.
    }
    return;
  } catch (error) {
    // Browsers can disable IndexedDB in private or locked-down contexts. Keep
    // the legacy localStorage path as a last resort, but report quota failures.
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(payload));
      writeMeta(preview);
      return;
    } catch {
      throw new Error(
        error instanceof Error
          ? `The recovery snapshot could not be saved: ${error.message}`
          : "The recovery snapshot could not be saved.",
      );
    }
  }
}

export async function readAutosave(): Promise<AutosavePayload | null> {
  try {
    const stored = await withStore<AutosavePayload | undefined>(
      "readonly",
      (store) => store.get(RECORD_KEY) as IDBRequest<AutosavePayload | undefined>,
    );
    if (hasProject(stored)) return stored;
  } catch {
    // Fall back to the legacy snapshot below.
  }
  const legacy = readLegacy();
  if (!legacy) return null;
  // Migrate an older snapshot on the next read without delaying the restore.
  void writeAutosave(legacy).catch(() => undefined);
  return legacy;
}

export function clearAutosave(): Promise<void> {
  const run = pendingWrite.then(() => clearAutosaveNow());
  pendingWrite = run.catch(() => undefined);
  return run;
}

async function clearAutosaveNow(): Promise<void> {
  try {
    localStorage.removeItem(META_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Ignore unavailable storage.
  }
  try {
    await withStore("readwrite", (store) => store.delete(RECORD_KEY));
  } catch {
    // The metadata is gone, so the snapshot will not be offered for restore.
  }
}
