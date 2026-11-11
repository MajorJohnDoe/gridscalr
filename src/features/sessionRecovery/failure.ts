import { t } from "../../i18n";

/** A recovery-snapshot failure the user has to act on. */
export class AutosaveError extends Error {
  readonly quotaExceeded: boolean;

  constructor(message: string, quotaExceeded = false) {
    super(message);
    this.name = "AutosaveError";
    this.quotaExceeded = quotaExceeded;
  }
}

/** Browser-specific "storage is full" spellings across Chromium, WebKit and Gecko. */
export function isQuotaExceeded(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const name = error.name;
  const code = (error as { code?: unknown }).code;
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014 ||
    /quota|storage is full|out of space/i.test(error.message)
  );
}

/**
 * Turns storage failures into a message that names the next action. A full
 * quota names the file save, the recovery center and the storage budget, so the
 * warning in the status bar leads somewhere instead of only reporting a fault.
 */
export function describeAutosaveFailure(primary: unknown, fallback?: unknown): AutosaveError {
  if (isQuotaExceeded(primary) || isQuotaExceeded(fallback)) {
    return new AutosaveError(t("autosave.quota"), true);
  }
  const detail =
    primary instanceof Error && primary.message
      ? primary.message
      : fallback instanceof Error && fallback.message
        ? fallback.message
        : "";
  return new AutosaveError(detail ? t("autosave.failedDetail", { detail }) : t("autosave.failed"));
}
