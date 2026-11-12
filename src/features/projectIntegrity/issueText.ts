import { t } from "../../i18n";
import type { ProjectIssue } from "../../model/integrity";
import type { RepairKind } from "./repairPlan";

type MessageKey = Parameters<typeof t>[0];

const REPAIR_KEYS: Record<RepairKind, MessageKey> = {
  duplicateIds: "projectIntegrity.repair.duplicateIds",
  danglingReferences: "projectIntegrity.repair.danglingReferences",
  staleOcr: "projectIntegrity.repair.staleOcr",
};

/** Localized repair kind name. */
export function repairLabel(kind: RepairKind): string {
  return t(REPAIR_KEYS[kind]);
}

const ENTITY_KEYS: Partial<Record<string, MessageKey>> = {
  project: "projectIntegrity.entity.project",
  document: "projectIntegrity.entity.document",
  page: "projectIntegrity.entity.page",
  layer: "projectIntegrity.entity.layer",
  item: "projectIntegrity.entity.item",
  asset: "projectIntegrity.entity.asset",
  ocr: "projectIntegrity.entity.ocr",
  category: "projectIntegrity.entity.category",
  countType: "projectIntegrity.entity.countType",
  lineType: "projectIntegrity.entity.lineType",
  countPreset: "projectIntegrity.entity.countPreset",
  markupsView: "projectIntegrity.entity.markupsView",
  settings: "projectIntegrity.entity.settings",
};

/** Localized entity kind. Unknown kinds stay technical. */
export function entityLabel(kind: string): string {
  const key = ENTITY_KEYS[kind];
  return key ? t(key) : kind;
}

export function issueMessage(issue: ProjectIssue): string {
  const message = t(`projectIntegrity.issue.${issue.code}` as MessageKey);
  if (!issue.entity) return message;
  const kind = entityLabel(issue.entity.kind);
  const id = issue.entity.id ? `:${issue.entity.id}` : "";
  return t("projectIntegrity.issue.entity", { message, kind, id });
}

/** Localized explanation for the validator code a planned change addresses. */
export function issueReasonText(code: string): string {
  return t(`projectIntegrity.issue.${code}` as MessageKey);
}
