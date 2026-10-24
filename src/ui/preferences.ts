const PANEL_KEY = "gridscalr.ui.panels.v1";

export interface PanelPreferences {
  leftCollapsed: boolean;
  leftWidth: number;
  rightCollapsed: boolean;
  rightWidth: number;
}

export const DEFAULT_PANELS: PanelPreferences = {
  leftCollapsed: false,
  leftWidth: 272,
  rightCollapsed: false,
  rightWidth: 304,
};

export const PANEL_LIMITS = {
  leftMin: 210,
  leftMax: 420,
  rightMin: 250,
  rightMax: 420,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function loadPanelPreferences(): PanelPreferences {
  try {
    const raw = localStorage.getItem(PANEL_KEY);
    if (!raw) return { ...DEFAULT_PANELS };
    const parsed = JSON.parse(raw) as Partial<PanelPreferences>;
    return {
      leftCollapsed: parsed.leftCollapsed === true,
      leftWidth: clamp(
        Number(parsed.leftWidth) || DEFAULT_PANELS.leftWidth,
        PANEL_LIMITS.leftMin,
        PANEL_LIMITS.leftMax,
      ),
      rightCollapsed: parsed.rightCollapsed === true,
      rightWidth: clamp(
        Number(parsed.rightWidth) || DEFAULT_PANELS.rightWidth,
        PANEL_LIMITS.rightMin,
        PANEL_LIMITS.rightMax,
      ),
    };
  } catch {
    return { ...DEFAULT_PANELS };
  }
}

export function savePanelPreferences(patch: Partial<PanelPreferences>): PanelPreferences {
  const next = { ...loadPanelPreferences(), ...patch };
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify(next));
  } catch {
    // Panel layout is a convenience only.
  }
  return next;
}

export function clearPanelPreferences(): PanelPreferences {
  try {
    localStorage.removeItem(PANEL_KEY);
  } catch {
    // Ignore.
  }
  return { ...DEFAULT_PANELS };
}
