import type { ProjectIssue } from "../../model/integrity";
import type { Project } from "../../model/types";
import { planDuplicateIds } from "./repairDuplicate";
import { planStaleOcr } from "./repairOcr";
import { planDanglingReferences } from "./repairReferences";

/**
 * The repair planner is the single decision source for the project doctor.
 *
 * `planRepair` walks a clone of the project once, records every concrete
 * decision it makes and returns that clone. The dialog preview and the saved
 * repaired copy are therefore the same value: a preview is never a parallel
 * estimate, and applying a subset is the plan for exactly that subset.
 */

export type RepairKind = "duplicateIds" | "danglingReferences" | "staleOcr";

/** Canonical order: renames first, then references, then stale OCR. */
export const REPAIR_ORDER: readonly RepairKind[] = [
  "duplicateIds",
  "danglingReferences",
  "staleOcr",
];

export type RepairScope =
  | "project"
  | "document"
  | "page"
  | "layer"
  | "item"
  | "asset"
  | "category"
  | "countType"
  | "lineType"
  | "countPreset"
  | "markupsView"
  | "settings"
  | "ocr";

export type RepairAction = "rename" | "remove" | "rewrite";

/** One concrete decision. There is no change in the plan that is not applied. */
export interface RepairChange {
  repair: RepairKind;
  action: RepairAction;
  scope: RepairScope;
  /** Stable id of the affected entity before the change. Never a path. */
  id: string;
  /** Duplicate rename only: the new id. */
  to?: string;
  /** Validator code that the change addresses, localized by the UI. */
  reason: string;
}

export interface RepairPlan {
  /** Kinds that were applied, in canonical order. */
  kinds: RepairKind[];
  changes: RepairChange[];
  /** Concrete change count per applied kind, derived from `changes`. */
  counts: Partial<Record<RepairKind, number>>;
}

export interface RepairRun {
  plan: RepairPlan;
  /** A new project value. The input project is never mutated. */
  project: Project;
}

export interface RepairResult {
  /** A new project value. The input project is never mutated. */
  project: Project;
  /** Number of entities changed or removed. */
  changed: number;
}

/** Records the concrete changes of one repair while it runs. */
export class RepairChanges {
  readonly changes: RepairChange[] = [];
  private readonly repair: RepairKind;

  constructor(repair: RepairKind) {
    this.repair = repair;
  }

  rename(scope: RepairScope, from: string, to: string, reason: string): void {
    this.changes.push({ repair: this.repair, action: "rename", scope, id: from, to, reason });
  }

  remove(scope: RepairScope, id: string, reason: string): void {
    this.changes.push({ repair: this.repair, action: "remove", scope, id, reason });
  }

  rewrite(scope: RepairScope, id: string, reason: string): void {
    this.changes.push({ repair: this.repair, action: "rewrite", scope, id, reason });
  }
}

export function cloneProject(project: Project): Project {
  if (typeof structuredClone === "function") return structuredClone(project);
  return JSON.parse(JSON.stringify(project)) as Project;
}

/**
 * Plans and applies the selected repairs in one pass.
 *
 * The returned project contains exactly the recorded changes. Calling it twice
 * with the same input produces the same plan and the same project.
 */
export function planRepair(input: Project, kinds: readonly RepairKind[]): RepairRun {
  const project = cloneProject(input);
  const plan: RepairPlan = { kinds: [], changes: [], counts: {} };
  for (const kind of REPAIR_ORDER) {
    if (!kinds.includes(kind)) continue;
    const log = new RepairChanges(kind);
    if (kind === "duplicateIds") planDuplicateIds(project, log);
    else if (kind === "danglingReferences") planDanglingReferences(project, log);
    else planStaleOcr(project, log);
    plan.kinds.push(kind);
    plan.changes.push(...log.changes);
    plan.counts[kind] = log.changes.length;
  }
  return { plan, project };
}

/** Applies one repair kind and reports how many concrete changes it made. */
export function applyRepair(project: Project, kind: RepairKind): RepairResult {
  const run = planRepair(project, [kind]);
  return { project: run.project, changed: run.plan.changes.length };
}

/**
 * Validator codes a repair can address. Every other code is report-only: the
 * doctor must never claim to fix something it leaves untouched.
 */
const REPAIR_BY_CODE: Record<string, RepairKind> = {
  duplicateDocumentId: "duplicateIds",
  duplicatePageId: "duplicateIds",
  duplicateLayerId: "duplicateIds",
  duplicateItemId: "duplicateIds",
  duplicateCategoryId: "duplicateIds",
  duplicateCountTypeId: "duplicateIds",
  duplicateLineTypeId: "duplicateIds",
  duplicateCountPresetId: "duplicateIds",
  duplicateMarkupsViewId: "duplicateIds",
  missingPageDocument: "danglingReferences",
  pageLocalPageOutOfRange: "danglingReferences",
  missingLayerHomePage: "danglingReferences",
  missingLayerPageState: "danglingReferences",
  missingLayerParent: "danglingReferences",
  layerParentCycle: "danglingReferences",
  layerParentKindMismatch: "danglingReferences",
  invalidLayerParent: "danglingReferences",
  missingItemPage: "danglingReferences",
  missingItemCategory: "danglingReferences",
  missingItemCountType: "danglingReferences",
  missingItemLineType: "danglingReferences",
  missingImageAsset: "danglingReferences",
  missingDefaultCategory: "danglingReferences",
  missingActiveLayer: "danglingReferences",
  missingCountPresetCategory: "danglingReferences",
  missingCountPresetType: "danglingReferences",
  missingMarkupsViewCategory: "danglingReferences",
  missingMarkupsViewCountType: "danglingReferences",
  missingReportLogo: "danglingReferences",
  invalidReportLogoMime: "danglingReferences",
  invalidExcludedPage: "danglingReferences",
  missingCopiedFromDocument: "danglingReferences",
  invalidCopiedFromPage: "danglingReferences",
  ocrDocumentMismatch: "staleOcr",
  ocrSourcePageMismatch: "staleOcr",
};

/** The repair that addresses an issue code, or `null` when it is report-only. */
export function repairForCode(code: string): RepairKind | null {
  return REPAIR_BY_CODE[code] ?? null;
}

/** Repairs whose issue codes are repairable. This does not read the project. */
export function availableRepairs(issues: readonly ProjectIssue[]): RepairKind[] {
  const found = new Set<RepairKind>();
  for (const issue of issues) {
    const repair = repairForCode(issue.code);
    if (repair) found.add(repair);
  }
  return REPAIR_ORDER.filter((kind) => found.has(kind));
}

export interface RepairAvailability {
  kind: RepairKind;
  /** Concrete changes this kind contributes to the combined plan. */
  changes: number;
}

/**
 * Repairs that the planner can actually change something for.
 *
 * Repair availability comes from the same single plan the preview and the
 * repaired copy use, not from validator codes alone: `missingActiveLayer` is a
 * repairable code, but when the project has no layer that could become the
 * fallback its repair plans zero changes. The project is cloned once here, so
 * the dialog never computes a plan per kind just to know what to offer.
 */
export function plannedRepairs(
  project: Project,
  issues: readonly ProjectIssue[],
): RepairAvailability[] {
  const kinds = availableRepairs(issues);
  if (!kinds.length) return [];
  const run = planRepair(project, kinds);
  return kinds
    .map((kind) => ({ kind, changes: run.plan.counts[kind] ?? 0 }))
    .filter((entry) => entry.changes > 0);
}
