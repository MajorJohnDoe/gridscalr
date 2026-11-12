import type { Project } from "../../model/types";
import type { RepairChanges, RepairScope } from "./repairPlan";

function nextId(base: string, used: Set<string>): string {
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

interface IdRule<T> {
  entries: readonly T[];
  id: (entry: T) => string;
  rename: (entry: T, next: string) => void;
  scope: RepairScope;
  reason: string;
}

/**
 * Keeps the first occurrence of every id and renames later ones. The plan
 * records each `from → to` pair, so the preview names the exact new ids.
 */
function dedupe<T>(rule: IdRule<T>, log: RepairChanges): void {
  const used = new Set<string>();
  for (const entry of rule.entries) {
    const id = rule.id(entry);
    if (!used.has(id)) {
      used.add(id);
      continue;
    }
    const next = nextId(id, used);
    rule.rename(entry, next);
    log.rename(rule.scope, id, next, rule.reason);
  }
}

/** Renames every repeated entity ID after the first occurrence, deterministically. */
export function planDuplicateIds(project: Project, log: RepairChanges): void {
  dedupe(
    {
      entries: project.documents,
      id: (document) => document.id,
      rename: (document, next) => {
        document.id = next;
      },
      scope: "document",
      reason: "duplicateDocumentId",
    },
    log,
  );
  dedupe(
    {
      entries: project.pages,
      id: (page) => page.id,
      rename: (page, next) => {
        page.id = next;
      },
      scope: "page",
      reason: "duplicatePageId",
    },
    log,
  );
  dedupe(
    {
      entries: project.layers,
      id: (layer) => layer.id,
      rename: (layer, next) => {
        layer.id = next;
      },
      scope: "layer",
      reason: "duplicateLayerId",
    },
    log,
  );
  dedupe(
    {
      entries: project.layers.flatMap((layer) => layer.items),
      id: (item) => item.id,
      rename: (item, next) => {
        item.id = next;
      },
      scope: "item",
      reason: "duplicateItemId",
    },
    log,
  );
  dedupe(
    {
      entries: project.categories,
      id: (category) => category.id,
      rename: (category, next) => {
        category.id = next;
      },
      scope: "category",
      reason: "duplicateCategoryId",
    },
    log,
  );
  dedupe(
    {
      entries: project.countTypes,
      id: (countType) => countType.id,
      rename: (countType, next) => {
        countType.id = next;
      },
      scope: "countType",
      reason: "duplicateCountTypeId",
    },
    log,
  );
  dedupe(
    {
      entries: project.lineTypes,
      id: (lineType) => lineType.id,
      rename: (lineType, next) => {
        lineType.id = next;
      },
      scope: "lineType",
      reason: "duplicateLineTypeId",
    },
    log,
  );
  dedupe(
    {
      entries: project.countPresets,
      id: (preset) => preset.id,
      rename: (preset, next) => {
        preset.id = next;
      },
      scope: "countPreset",
      reason: "duplicateCountPresetId",
    },
    log,
  );
  dedupe(
    {
      entries: project.markupsViews,
      id: (view) => view.id,
      rename: (view, next) => {
        view.id = next;
      },
      scope: "markupsView",
      reason: "duplicateMarkupsViewId",
    },
    log,
  );
}
