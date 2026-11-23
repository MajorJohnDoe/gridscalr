import { buildDiagnostics, projectStats } from "../features/diagnostics/model";
import { readDiagnosticsLog } from "../features/diagnostics/log";
import { perfSnapshot, summaryText } from "../features/perfMonitor";
import { getRecoveryUsage, RECOVERY_BUDGET } from "../features/sessionRecovery";
import { isTauri } from "../io/platform";
import { SCHEMA_VERSION } from "../model/types";
import { store } from "../state/store";
import { copyDiagnostics, reportProblemDialog } from "../ui/diagnosticsDialog";
import { detectPlatform } from "../ui/windowChrome";

function performanceBlock(): string {
  return summaryText(perfSnapshot(store.project ? projectStats(store.project) : null), {
    version: __APP_VERSION__,
    schemaVersion: SCHEMA_VERSION,
    platform: detectPlatform(),
    locale: navigator.language,
    desktop: isTauri,
  });
}

function diagnosticsText(): string {
  const usage = getRecoveryUsage();
  const report = buildDiagnostics({
    version: __APP_VERSION__,
    schemaVersion: SCHEMA_VERSION,
    platform: detectPlatform(),
    desktop: isTauri,
    userAgent: navigator.userAgent,
    mode: import.meta.env.PROD ? "production" : "development",
    locale: navigator.language,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio,
    },
    project: store.project ? projectStats(store.project) : null,
    autosaveFailure: store.autosaveError?.message ?? null,
    recovery: {
      records: usage.records,
      totalBytes: usage.totalBytes,
      budgetBytes: RECOVERY_BUDGET.totalBytes,
      projectBytes: usage.projects.map((project) => project.bytes),
    },
    log: readDiagnosticsLog().slice(-25),
  });
  // The performance block is separate so it keeps the same shape as the panel's
  // Copy summary, and so it stays absent of names and paths by construction.
  return `${report}\n\n${performanceBlock()}`;
}

export async function copyDiagnosticsFlow(): Promise<void> {
  await copyDiagnostics(diagnosticsText);
}

export function reportProblemFlow(): void {
  reportProblemDialog(diagnosticsText);
}
