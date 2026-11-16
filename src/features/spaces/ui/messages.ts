import { t, type MessageKey } from "../../../i18n";
import type { SpaceAreaWarning, SpaceProblemCode } from "../model";

/** Localized text for a refused space mutation. */
export function spaceProblemText(code: SpaceProblemCode): string {
  const key: Record<SpaceProblemCode, MessageKey> = {
    missingSpaceName: "spaces.problem.missingName",
    invalidManualArea: "spaces.problem.manualArea",
    missingSpaceParent: "spaces.problem.parentMissing",
    spaceParentCycle: "spaces.problem.parentCycle",
    spaceNotFound: "spaces.problem.spaceNotFound",
    measurementNotFound: "spaces.problem.measurementNotFound",
    measurementNotArea: "spaces.problem.notArea",
    measurementLocked: "spaces.problem.locked",
  };
  return t(key[code]);
}

/** Localized text for a missing or unused space area. */
export function areaWarningText(warning: SpaceAreaWarning): string {
  const key: Record<SpaceAreaWarning, MessageKey> = {
    noMeasurement: "spaces.warning.noMeasurement",
    hiddenOnly: "spaces.warning.hiddenOnly",
    noScale: "spaces.warning.noScale",
    manualMissing: "spaces.warning.manualMissing",
  };
  return t(key[warning]);
}
