import { t } from "../../i18n";
import { formatBytes, pickDrawing } from "../../io/platform";
import type { DocumentRef } from "../../model/types";
import { confirmDialog, messageDialog } from "../../ui/dialogs";
import { toast } from "../../ui/toast";
import type { DerivedCacheBudget } from "./model";
import { rebuildFromLocatedScan, scanCandidates } from "./lifecycle";

/**
 * The one user-facing path when neither the cache nor the scan is available.
 *
 * The project cannot draw the page, so it is not opened with an empty canvas:
 * the dialog names the document, names where the scan was expected and offers
 * the one action that recovers it. A located scan must match the project's
 * checksum, because re-rendering a different revision would change the drawing
 * the takeoff measures.
 */
export async function promptLocateMissingScan(
  document: DocumentRef,
  projectPath: string | null,
): Promise<boolean> {
  const expected = scanCandidates(document, projectPath)[0] ?? document.name;
  const locate = await confirmDialog(
    t("derivedCache.missingScanTitle"),
    t("derivedCache.missingScanMessage", {
      name: document.name,
      path: expected,
    }),
    t("derivedCache.locateScan"),
  );
  if (!locate) return false;
  const picked = await pickDrawing();
  if (!picked) return false;
  const outcome = await rebuildFromLocatedScan(document, projectPath, picked);
  if (outcome === "ok") {
    toast(t("derivedCache.rebuilt", { name: document.name }), "success");
    return true;
  }
  if (outcome === "mismatch") {
    await messageDialog(
      t("derivedCache.scanMismatchTitle"),
      t("derivedCache.scanMismatchMessage", { name: document.name }),
      "warning",
    );
    return false;
  }
  await messageDialog(
    t("derivedCache.rebuildFailedTitle"),
    t("derivedCache.rebuildFailedMessage", { name: document.name }),
    "warning",
  );
  return false;
}

let lastBudgetNotice = "";

/**
 * Reports the enforced derived-PDF budget once per changed state instead of on
 * every save. It never blocks the save: the hard stop stays the project limit.
 */
export function notifyDerivedCacheBudget(budget: DerivedCacheBudget): void {
  if (budget.state === "ok") {
    lastBudgetNotice = "";
    return;
  }
  const bucket = Math.floor(budget.totalBytes / (16 * 1024 * 1024));
  const key = `${budget.state}:${bucket}`;
  if (key === lastBudgetNotice) return;
  lastBudgetNotice = key;
  const message =
    budget.state === "over"
      ? t("derivedCache.budgetOver", {
          total: formatBytes(budget.totalBytes),
          limit: formatBytes(budget.projectLimitBytes),
          cache: formatBytes(budget.cacheBytes),
        })
      : t("derivedCache.budgetWarning", {
          cache: formatBytes(budget.cacheBytes),
          budget: formatBytes(budget.cacheBudgetBytes),
          total: formatBytes(budget.totalBytes),
        });
  toast(message, "warning");
}
