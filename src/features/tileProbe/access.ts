import type { RasterPixels } from "./model";

/** The raster surface the capture bridge reads; a structural subset of the controller. */
export interface TileProbeRaster {
  setProbePath(tiled: boolean, levels: boolean, force?: boolean): void;
  readonly tilePathActive: boolean;
  readonly rendering: boolean;
  readonly current: unknown | null;
  currentAccurate(): boolean;
  tileStats(): { supported: boolean } | null;
}

/** The canvas-side bridge the packaged smoke flow drives. */
export interface TileProbeAccess {
  tileSupported(): boolean;
  tilePathActive(): boolean;
  /** `force` keeps the tiled path for a capture even when the live cost rule would fall back. */
  setPath(tiled: boolean, levels: boolean, force?: boolean): void;
  rasterIdle(): boolean;
  capture(): RasterPixels | null;
}

/**
 * Keeps the debug probe's canvas reads beside the probe instead of growing
 * `CanvasView`. Production code never calls this; the packaged smoke test does.
 */
export function createTileProbeAccess(
  raster: TileProbeRaster,
  base: () => HTMLCanvasElement,
  context: () => CanvasRenderingContext2D,
): TileProbeAccess {
  return {
    tileSupported: () => raster.tileStats()?.supported === true,
    tilePathActive: () => raster.tilePathActive,
    setPath: (tiled, levels, force) => raster.setProbePath(tiled, levels, force),
    rasterIdle: () => !raster.rendering && raster.currentAccurate() && raster.current !== null,
    capture: () => {
      const canvas = base();
      if (canvas.width < 1 || canvas.height < 1) return null;
      const image = context().getImageData(0, 0, canvas.width, canvas.height);
      return { width: image.width, height: image.height, data: image.data };
    },
  };
}
