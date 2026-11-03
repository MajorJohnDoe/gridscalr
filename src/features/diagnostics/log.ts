import { sanitizeDiagnosticText, type LogEntry, type LogLevel } from "./model";

const LOG_KEY = "gridscalr.log.v1";

/** Maximum number of entries kept; older entries are dropped first. */
export const LOG_LIMIT = 80;

let memory: LogEntry[] = [];
let installed = false;

function isEntry(value: unknown): value is LogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<LogEntry>;
  return (
    typeof entry.at === "string" &&
    typeof entry.message === "string" &&
    (entry.level === "info" || entry.level === "warn" || entry.level === "error")
  );
}

function parse(raw: string | null): LogEntry[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function readDiagnosticsLog(): LogEntry[] {
  try {
    const stored = parse(localStorage.getItem(LOG_KEY));
    if (stored.length) return stored;
  } catch {
    // Storage can be unavailable in restricted webviews; memory still works.
  }
  return [...memory];
}

export function logEvent(level: LogLevel, message: string): void {
  const entry: LogEntry = {
    at: new Date().toISOString(),
    level,
    message: sanitizeDiagnosticText(message),
  };
  const entries = [...readDiagnosticsLog(), entry].slice(-LOG_LIMIT);
  memory = entries;
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(entries));
  } catch {
    // Keep the in-memory ring buffer.
  }
}

export function clearDiagnosticsLog(): void {
  memory = [];
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    // Ignore.
  }
}

/**
 * Captures runtime failures that happen after startup. Messages are sanitised
 * before they are stored, so no paths or drawing content leak into diagnostics.
 */
export function installDiagnosticsLogging(): void {
  if (installed) return;
  installed = true;
  window.addEventListener("error", (event) => {
    logEvent("error", `uncaught: ${event.message || "unknown error"}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    logEvent("error", `unhandled rejection: ${String(event.reason)}`);
  });
}
