export declare const A11Y_FAIL_IMPACTS: readonly string[];
export declare const A11Y_SURFACES: ReadonlyArray<{ id: string; label: string }>;
export declare const A11Y_THEMES: ReadonlyArray<{ id: string; label: string }>;
export declare function a11ySurfaceChecks(
  themes?: ReadonlyArray<{ id: string; label: string }>,
  surfaces?: ReadonlyArray<{ id: string; label: string }>,
): A11ySurfaceCheck[];
export declare const TOUCH_TARGET_MIN_PX: number;
export declare const TOUCH_TARGET_EMULATION: string;
export declare const UI_SCALE_BASE_VIEWPORT: { width: number; height: number };
export declare const UI_SCALE_STEPS: readonly number[];
export declare const UI_SCALE_REGIONS: ReadonlyArray<{ selector: string; label: string }>;
export declare const UI_SCALE_MIN_CANVAS_PX: number;

export interface ViolationNode {
  target: string;
  summary: string;
}

export interface A11ySurfaceCheck {
  key: string;
  theme: string;
  themeLabel: string;
  surface: string;
  surfaceLabel: string;
}

export interface ViolationSummary {
  id: string;
  impact: string;
  help: string;
  helpUrl: string;
  nodes: ViolationNode[];
}

export interface ClassifiedViolations {
  failing: ViolationSummary[];
  reported: ViolationSummary[];
}

export interface TouchTargetSize {
  width: number;
  height: number;
}

export interface TouchTargetControl extends TouchTargetSize {
  surface: string;
  tag: string;
  label: string;
  className?: string;
}

export interface TouchTargetFailure {
  surface: string;
  tag: string;
  label: string;
  className: string;
  width: number;
  height: number;
}

export interface UiScaleViewport {
  scale: number;
  label: string;
  width: number;
  height: number;
}

export declare function isFailingImpact(impact: string, failImpacts?: readonly string[]): boolean;
export declare function classifyViolations(
  violations: ReadonlyArray<Record<string, unknown>>,
  failImpacts?: readonly string[],
): ClassifiedViolations;
export declare function summarizeViolation(
  violation: Record<string, unknown>,
): ViolationSummary;
export declare function formatViolation(violation: ViolationSummary): string[];
export declare function uiScaleViewports(
  base?: { width: number; height: number },
  steps?: readonly number[],
): UiScaleViewport[];
export declare function isTouchTargetLargeEnough(
  size: TouchTargetSize | undefined,
  min?: number,
): boolean;
export declare function touchTargetFailures(
  controls: ReadonlyArray<TouchTargetControl>,
  min?: number,
): TouchTargetFailure[];
export declare function formatTouchTargetFailure(
  failure: TouchTargetFailure,
  min?: number,
): string;
