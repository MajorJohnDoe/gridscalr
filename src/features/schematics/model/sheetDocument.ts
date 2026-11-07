import { makeId } from "../../../model/calibration";
import { projectDocumentForPage } from "../../../model/documents";
import type { DocumentRef, Project } from "../../../model/types";
import {
  SHEET_FIELD,
  SHEET_TEMPLATE_VERSION,
  BLANK_TEMPLATE_ID,
  type PaperSize,
} from "./sheetTemplate";

/** One sheet template page is one document with exactly one page. */
export function createTemplateDocument(
  templateId: string,
  paper: PaperSize,
  name: string,
): DocumentRef {
  return {
    id: makeId("doc"),
    kind: "template",
    name,
    path: null,
    relativePath: null,
    sha256: "",
    pageCount: 1,
    sizeBytes: 0,
    template: {
      id: templateId,
      version: SHEET_TEMPLATE_VERSION,
      paper,
      fields: {},
    },
  };
}

export function templateDocumentForPage(
  project: Pick<Project, "documents">,
  page: number,
): DocumentRef | undefined {
  const document = projectDocumentForPage(project, page);
  return document?.kind === "template" ? document : undefined;
}

/** A blank page shares the template document shape but has no sheet fields. */
export function isBlankSheet(document: DocumentRef | undefined): boolean {
  return document?.kind === "template" && document.template?.id === BLANK_TEMPLATE_ID;
}

export function templateSheetCount(project: Pick<Project, "documents">): number {
  return project.documents.filter(
    (document) => document.kind === "template" && !isBlankSheet(document),
  ).length;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fills a new sheet from the most recent sheet with the same template, then
 * keeps the project-owned values current. Numbers the page field from the
 * caller; it is never updated automatically afterwards.
 */
export function prefillSheetFields(
  project: Project,
  document: DocumentRef,
  sheetOrdinal: number,
): void {
  if (!document.template) return;
  if (document.template.id === BLANK_TEMPLATE_ID) {
    document.template.fields = {};
    return;
  }
  const fields: Record<string, string> = {};

  for (let index = project.documents.length - 1; index >= 0; index -= 1) {
    const candidate = project.documents[index];
    if (candidate.id === document.id) continue;
    if (candidate.kind === "template" && candidate.template?.id === document.template.id) {
      Object.assign(fields, candidate.template.fields);
      break;
    }
  }

  fields[SHEET_FIELD.projectName] = project.name;
  fields[SHEET_FIELD.page] = String(Math.max(1, Math.round(sheetOrdinal)));
  if (!fields[SHEET_FIELD.date]) {
    fields[SHEET_FIELD.date] = project.metadata.reportDate || today();
  }
  if (!fields[SHEET_FIELD.assignment] && project.metadata.projectNumber) {
    fields[SHEET_FIELD.assignment] = project.metadata.projectNumber;
  }
  if (!fields[SHEET_FIELD.handledBy] && project.metadata.preparedBy) {
    fields[SHEET_FIELD.handledBy] = project.metadata.preparedBy;
  }

  document.template.fields = fields;
}
