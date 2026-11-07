// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/ui/dialogs", () => ({
  confirmDialog: vi.fn(),
  manualScaleDialog: vi.fn(),
}));
vi.mock("../src/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("../src/features/schematics/model/fitDrawing", () => ({
  canFitDrawingToArea: vi.fn(() => false),
  fitDrawingToArea: vi.fn(() => false),
}));

import { createManualCalibration, setPageCalibration } from "../src/model/calibration";
import { createProject, createDefaultLayers, defaultDocument } from "../src/model/layers";
import {
  clearCalibrationFlow,
  fitDrawingToArea,
  openManualScaleFlow,
  setScaleLock,
  startCalibration,
} from "../src/app/scaleFlows";
import { store } from "../src/state/store";
import { manualScaleDialog } from "../src/ui/dialogs";

function makeProject(calibrated = false) {
  const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
  if (calibrated) {
    setPageCalibration(project, 1, createManualCalibration(100), {
      applyToAll: false,
      updateMeasurements: false,
      pageCount: 1,
    });
  }
  store.project = project;
  store.ui.page = 1;
  return project;
}

beforeEach(() => {
  store.project = null;
  vi.mocked(manualScaleDialog).mockReset();
});

describe("scale flows", () => {
  it("arms the calibration tool", () => {
    makeProject();
    startCalibration();
    expect(store.ui.activeTool).toBe("calibrate");
  });

  it("locks a calibrated page", () => {
    const project = makeProject(true);
    setScaleLock(true);
    expect(project.pages["1"]?.scaleLocked).toBe(true);
  });

  it("does nothing when there is no calibration to lock", () => {
    const project = makeProject();
    setScaleLock(true);
    expect(project.pages["1"]?.scaleLocked).toBeUndefined();
  });

  it("returns from manual scale when the dialog is cancelled", async () => {
    makeProject();
    vi.mocked(manualScaleDialog).mockResolvedValue(null);
    await openManualScaleFlow();
    expect(manualScaleDialog).toHaveBeenCalled();
  });

  it("reports nothing to fit when the page has no drawing area", () => {
    makeProject();
    const invalidate = vi.fn();
    fitDrawingToArea(invalidate);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("returns early when the page has no calibration to clear", async () => {
    makeProject();
    await clearCalibrationFlow();
    expect(store.project?.pages["1"]?.calibration).toBeUndefined();
  });
});
