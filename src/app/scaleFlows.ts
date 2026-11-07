import {
  clearPageCalibration,
  createManualCalibration,
  pageCalibration,
  pageScaleLocked,
  setPageCalibration,
  setPageScaleLocked,
} from "../model/calibration";
import { totalPageCount } from "../model/documents";
import {
  canFitDrawingToArea,
  fitDrawingToArea as fitDrawing,
} from "../features/schematics/model/fitDrawing";
import { store } from "../state/store";
import { confirmDialog, manualScaleDialog } from "../ui/dialogs";
import { toast } from "../ui/toast";
import { t } from "../i18n";

export function startCalibration(): void {
  if (!store.project) return;
  const page = store.ui.page;
  if (pageScaleLocked(store.project, page)) {
    toast(t("app.scaleLockedCalibrate"), "warning");
    return;
  }
  store.setTool("calibrate");
  toast(t("app.calibrationHint"), "info");
}

export async function openManualScaleFlow(): Promise<void> {
  const project = store.project;
  if (!project) return;
  const page = store.ui.page;
  if (pageScaleLocked(project, page)) {
    toast(t("app.scaleLockedManual"), "warning");
    return;
  }
  const current = pageCalibration(project, page);
  const hasMeasurements = project.layers.some(
    (layer) => layer.kind === "measure" && layer.items.length > 0,
  );
  const result = await manualScaleDialog({
    currentPage: page,
    pageCount: totalPageCount(project.documents),
    hasMeasurements,
    initialRatio: current?.source === "manual" ? current.ratio : undefined,
  });
  if (!result) return;
  const calibration = createManualCalibration(result.ratio);
  let changed: number[] = [];
  store.mutate((project) => {
    changed = setPageCalibration(project, page, calibration, {
      applyToAll: result.applyToAll,
      updateMeasurements: result.updateMeasurements,
      pageCount: totalPageCount(project.documents),
    });
  }, "change");
  if (!changed.length) {
    toast(t("app.noUnlockedPages"), "warning");
    return;
  }
  const lockedSkipped = result.applyToAll ? totalPageCount(project.documents) - changed.length : 0;
  const manualScale =
    changed.length === 1
      ? t("app.manualScaleSetOne", { ratio: calibration.ratio, page: changed[0] })
      : t("app.manualScaleSetMany", { ratio: calibration.ratio, count: changed.length });
  const lockedSuffix =
    lockedSkipped > 0 ? t("app.manualScaleLockedSuffix", { count: lockedSkipped }) : "";
  toast(`${manualScale}${lockedSuffix}`, "success");
}

export function setScaleLock(locked: boolean): void {
  const project = store.project;
  if (!project) return;
  const page = store.ui.page;
  if (!pageCalibration(project, page)) {
    toast(t("app.setScaleBeforeLock"), "warning");
    return;
  }
  store.mutate((project) => {
    setPageScaleLocked(project, page, locked);
  }, "change");
  toast(
    locked ? t("app.scaleLockedOn", { page }) : t("app.scaleUnlockedOn", { page }),
    locked ? "success" : "info",
  );
}

export function fitDrawingToArea(invalidate: () => void): void {
  const project = store.project;
  const page = store.ui.page;
  if (!project || !canFitDrawingToArea(project, page)) {
    toast(t("context.fitDrawingNothing"), "info");
    return;
  }
  let moved = false;
  store.mutate((current) => {
    moved = fitDrawing(current, page);
  }, "change");
  if (moved) {
    toast(t("context.fitDrawingDone"), "success");
    invalidate();
  } else {
    toast(t("context.fitDrawingNothing"), "info");
  }
}

export async function clearCalibrationFlow(): Promise<void> {
  const project = store.project;
  if (!project) return;
  const page = store.ui.page;
  if (!pageCalibration(project, page)) return;
  if (pageScaleLocked(project, page)) {
    toast(t("app.scaleLockedClear"), "warning");
    return;
  }
  const confirmed = await confirmDialog(
    t("app.clearScaleTitle"),
    t("app.clearScaleMessage", { page }),
    t("app.clearScaleTitle"),
    { danger: true },
  );
  if (!confirmed) return;
  let cleared = false;
  store.mutate((project) => {
    cleared = clearPageCalibration(project, page);
  }, "change");
  toast(cleared ? t("app.scaleCleared") : t("app.scaleClearFailed"), cleared ? "info" : "warning");
}
