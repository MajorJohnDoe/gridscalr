import { t, type MessageKey } from "../i18n";

/**
 * Rust commands reject with `{ code, detail }`. The code picks a catalog
 * message and the detail is kept as a separate technical line.
 */
const COMMAND_ERROR_KEYS: Record<string, MessageKey> = {
  sourceOverwrite: "error.sourceOverwrite",
  sourceCopyConflict: "error.sourceCopyConflict",
  notAFile: "error.notAFile",
  createFolderFailed: "error.createFolderFailed",
  writeFailed: "error.writeFailed",
  replaceFailed: "error.replaceFailed",
  readFailed: "error.readFailed",
  invalidPayload: "error.invalidPayload",
  projectConflict: "error.projectConflict",
  readBackMismatch: "error.readBackMismatch",
  backupFolderFailed: "error.backupFolderFailed",
  backupRotateFailed: "error.backupRotateFailed",
  backupReadFailed: "error.backupReadFailed",
  appDataFolderFailed: "error.appDataFolderFailed",
  demoResourceFailed: "error.demoResourceFailed",
  demoFolderFailed: "error.demoFolderFailed",
  demoCopyFailed: "error.demoCopyFailed",
};

function commandErrorDetail(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const detail = (error as { detail?: unknown }).detail;
  return typeof detail === "string" ? detail.trim() : "";
}

/** Returns a localized message for a structured command error, or null. */
export function describeCommandError(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string") return null;
  const key = COMMAND_ERROR_KEYS[code];
  if (!key) return null;
  const headline = t(key);
  const detail = commandErrorDetail(error);
  return detail ? `${headline}\n\n${detail}` : headline;
}

/** A technical fallback for unexpected structured errors without a known code. */
export function commandErrorFallback(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    const detail = commandErrorDetail(error);
    if (typeof code === "string") return detail ? `${code}: ${detail}` : code;
    if (detail) return detail;
  }
  if (typeof error === "string") return error;
  return "";
}

/** One user-facing error string for command, package and ordinary failures. */
export function describeError(error: unknown): string {
  const described = describeCommandError(error);
  if (described) return described;
  const fallback = commandErrorFallback(error);
  if (fallback) return fallback;
  if (error instanceof Error) return error.message;
  return String(error);
}
