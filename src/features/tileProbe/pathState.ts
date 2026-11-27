/**
 * Debug-probe path state. The probe forces the tiled or whole-page path and
 * hides the display-level underlay; this helper remembers the state it found so
 * the final `(true, true)` call restores the session instead of always leaving
 * tiles on. It is pure state, separate from the raster controller.
 */

export interface ProbePathState {
  useTiles: boolean;
  tilesDisabled: boolean;
  levelsDisabled: boolean;
}

export class ProbePathSwitch {
  private saved: ProbePathState | null = null;

  /**
   * State to apply for one probe step. `(true, true)` restores the state saved
   * before the first step; any other pair forces the requested path.
   */
  apply(tiled: boolean, levels: boolean, current: ProbePathState): ProbePathState {
    if (!this.saved) this.saved = { ...current };
    if (tiled && levels) {
      const restore = this.saved;
      this.saved = null;
      return restore;
    }
    return { useTiles: tiled, tilesDisabled: false, levelsDisabled: !levels };
  }
}
