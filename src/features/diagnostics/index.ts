/**
 * Public surface for diagnostics. Other modules import only this index; the
 * rolling log and the path-free report builder stay internal.
 */
export {
  LOG_LIMIT,
  clearDiagnosticsLog,
  installDiagnosticsLogging,
  logEvent,
  readDiagnosticsLog,
} from "./log";
export { buildDiagnostics, projectStats, sanitizeDiagnosticText } from "./model";
export type {
  DiagnosticsInput,
  LogEntry,
  LogLevel,
  ProjectStats,
  RecoveryStorageStats,
} from "./model";
