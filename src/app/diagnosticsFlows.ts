import { buildDiagnostics, projectStats } from "../features/diagnostics/model";
import { readDiagnosticsLog } from "../features/diagnostics/log";
import { isTauri } from "../io/platform";
import { SCHEMA_VERSION } from "../model/types";
import { store } from "../state/store";
import { copyDiagnostics, reportProblemDialog } from "../ui/diagnosticsDialog";
import { detectPlatform } from "../ui/windowChrome";

function diagnosticsText(): string {
  return buildDiagnostics({
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
    log: readDiagnosticsLog().slice(-25),
  });
}

export async function copyDiagnosticsFlow(): Promise<void> {
  await copyDiagnostics(diagnosticsText);
}

export function reportProblemFlow(): void {
  reportProblemDialog(diagnosticsText);
}
