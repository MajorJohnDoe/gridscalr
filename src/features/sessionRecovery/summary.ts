import { listRecoveryRecords } from "./autosave";
import { EMPTY_RECOVERY_SUMMARY, type RecoverySummary } from "./record";
import { recoverySummary } from "./recovery";

let current: RecoverySummary = EMPTY_RECOVERY_SUMMARY;
const listeners = new Set<(summary: RecoverySummary) => void>();

/** Synchronous snapshot for the welcome screen and Preferences. */
export function getRecoverySummary(): RecoverySummary {
  return current;
}

export function subscribeRecoverySummary(listener: (summary: RecoverySummary) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(summary: RecoverySummary): void {
  current = summary;
  for (const listener of listeners) listener(summary);
}

/** Re-reads the local store and publishes the result. */
export async function refreshRecoverySummary(): Promise<RecoverySummary> {
  try {
    const records = await listRecoveryRecords();
    publish(recoverySummary(records));
  } catch {
    // Keep the last known summary; the welcome screen must not fail to render.
  }
  return current;
}
