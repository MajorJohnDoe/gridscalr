import type { CanvasView } from "../canvas/CanvasView";
import { store } from "../state/store";
import { runTileProbe, type TileProbeReport } from "../features/tileProbe";

/**
 * Runs the debug-only tile-path probe against the live primary canvas and
 * returns a smoke-test step. The packaged smoke test calls this on every
 * desktop platform, so WebKitGTK and WKWebView exercise the tiled path instead
 * of assuming Chromium behaviour. A probe failure is recorded, not thrown.
 */
export async function recordSmokeTileProbe(
  canvas: CanvasView,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const report = await runSmokeTileProbe(canvas, (zoom, panX, panY) =>
      store.setView(zoom, panX, panY),
    );
    return { ok: true, detail: JSON.stringify(report) };
  } catch (error) {
    return { ok: false, detail: String(error) };
  }
}

function runSmokeTileProbe(
  canvas: CanvasView,
  setView: (zoom: number, panX: number, panY: number) => void,
): Promise<TileProbeReport> {
  const probe = canvas.tileProbeAccess;
  return runTileProbe({
    pageSize: () => canvas.getTestApi().pageSize(),
    viewportSize: () => canvas.viewportSize,
    tileSupported: () => probe.tileSupported(),
    tilePathActive: () => probe.tilePathActive(),
    setPath: (tiled, levels) => probe.setPath(tiled, levels),
    setView,
    waitForRaster: (timeoutMs = 15000) => waitForProbeRaster(canvas, timeoutMs),
    captureBase: () => probe.capture(),
  });
}

function waitForProbeRaster(canvas: CanvasView, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = performance.now() + timeoutMs;
    const tick = () => {
      if (canvas.tileProbeAccess.rasterIdle()) {
        resolve(true);
        return;
      }
      if (performance.now() >= deadline) {
        resolve(false);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
