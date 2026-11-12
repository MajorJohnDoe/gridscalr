import type { Project } from "../../model/types";
import { applyRepair, type RepairResult } from "./repairPlan";

/**
 * Public repair surface. The decisions live in `repairPlan.ts`; these wrappers
 * keep the one-kind call shape used by existing callers and tests.
 */
export {
  applyRepair,
  availableRepairs,
  planRepair,
  repairForCode,
  REPAIR_ORDER,
} from "./repairPlan";
export type {
  RepairAction,
  RepairChange,
  RepairKind,
  RepairPlan,
  RepairResult,
  RepairRun,
  RepairScope,
} from "./repairPlan";

export function repairDuplicateIds(input: Project): RepairResult {
  return applyRepair(input, "duplicateIds");
}

export function repairDanglingReferences(input: Project): RepairResult {
  return applyRepair(input, "danglingReferences");
}

export function repairStaleOcr(input: Project): RepairResult {
  return applyRepair(input, "staleOcr");
}
