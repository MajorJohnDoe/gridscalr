import { describe, expect, it } from "vitest";
import { withTestPageIds } from "./helpers/pages";
import { createProject, defaultDocument } from "../src/model/layers";
import { duplicatePage as duplicatePageRecord } from "../src/features/pageModel";
import {
  createTemplateDocument,
  isBlankSheet,
  prefillSheetFields,
  templateDocumentForPage,
  templateSheetCount,
} from "../src/features/schematics/model/sheetDocument";
import { BLANK_TEMPLATE_ID, SHEET_FIELD } from "../src/features/schematics/model/sheetTemplate";

function project() {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 2)));
  project.name = "North wing";
  project.metadata.projectNumber = "U-100";
  project.metadata.preparedBy = "A. Handläggare";
  project.metadata.reportDate = "2026-11-04";
  return project;
}

describe("template sheet documents", () => {
  it("creates a single-page template document", () => {
    const sheet = createTemplateDocument("gridscalr.operation-card.frame", "A2", "Sheet A2");
    expect(sheet).toMatchObject({
      kind: "template",
      name: "Sheet A2",
      path: null,
      relativePath: null,
      sha256: "",
      pageCount: 1,
      sizeBytes: 0,
    });
    expect(sheet.template).toMatchObject({
      id: "gridscalr.operation-card.frame",
      version: 1,
      paper: "A2",
      fields: {},
    });
  });

  it("prefills project values, page number and metadata", () => {
    const projectValue = project();
    const sheet = createTemplateDocument("gridscalr.operation-card.frame", "A3", "Sheet");
    prefillSheetFields(projectValue, sheet, 1);

    expect(sheet.template!.fields[SHEET_FIELD.projectName]).toBe("North wing");
    expect(sheet.template!.fields[SHEET_FIELD.page]).toBe("1");
    expect(sheet.template!.fields[SHEET_FIELD.date]).toBe("2026-11-04");
    expect(sheet.template!.fields[SHEET_FIELD.assignment]).toBe("U-100");
    expect(sheet.template!.fields[SHEET_FIELD.handledBy]).toBe("A. Handläggare");
  });

  it("copies values from the most recent sheet with the same template", () => {
    const projectValue = project();
    const first = createTemplateDocument("gridscalr.operation-card.frame", "A3", "First");
    prefillSheetFields(projectValue, first, 1);
    first.template!.fields[SHEET_FIELD.system] = "Heating 56-01-01";
    first.template!.fields[SHEET_FIELD.card] = "56-01-01";
    projectValue.documents.push(first);

    const second = createTemplateDocument("gridscalr.operation-card.frame", "A3", "Second");
    prefillSheetFields(projectValue, second, 2);

    expect(second.template!.fields[SHEET_FIELD.system]).toBe("Heating 56-01-01");
    expect(second.template!.fields[SHEET_FIELD.card]).toBe("56-01-01");
    expect(second.template!.fields[SHEET_FIELD.page]).toBe("2");
  });

  it("does not copy values from a different template", () => {
    const projectValue = project();
    const other = createTemplateDocument("other.template", "A3", "Other");
    prefillSheetFields(projectValue, other, 1);
    other.template!.fields[SHEET_FIELD.system] = "Not this one";
    projectValue.documents.push(other);

    const sheet = createTemplateDocument("gridscalr.operation-card.frame", "A3", "Sheet");
    prefillSheetFields(projectValue, sheet, 2);
    expect(sheet.template!.fields[SHEET_FIELD.system]).toBeUndefined();
  });

  it("duplicates a template sheet without sharing its field object", () => {
    const projectValue = project();
    const sheet = createTemplateDocument("gridscalr.operation-card.frame", "A3", "Sheet");
    projectValue.documents.push(sheet);
    projectValue.pages.push({
      id: "page_3",
      documentId: sheet.id,
      localPage: 1,
      state: {},
    });
    sheet.template!.fields[SHEET_FIELD.projectName] = "Original";
    const sourcePageId = "page_3";

    const result = duplicatePageRecord(projectValue, sourcePageId, {
      copyMarkups: false,
      copyScale: false,
      copyName: false,
      name: "",
    });
    expect(result).not.toBeNull();
    const copy = projectValue.documents[projectValue.documents.length - 1];
    expect(copy.template).not.toBe(sheet.template);
    expect(copy.template!.fields).not.toBe(sheet.template!.fields);
    expect(copy.template!.fields[SHEET_FIELD.projectName]).toBe("Original");

    copy.template!.fields[SHEET_FIELD.projectName] = "Copy";
    expect(sheet.template!.fields[SHEET_FIELD.projectName]).toBe("Original");
  });

  it("counts and resolves template pages through the document map", () => {
    const projectValue = project();
    const first = createTemplateDocument("gridscalr.operation-card.frame", "A3", "First");
    const second = createTemplateDocument("gridscalr.operation-card.frame", "A3", "Second");
    projectValue.documents.push(first, second);
    projectValue.pages.push(
      { id: "page_3", documentId: first.id, localPage: 1, state: {} },
      { id: "page_4", documentId: second.id, localPage: 1, state: {} },
    );

    expect(templateSheetCount(projectValue)).toBe(2);
    expect(templateDocumentForPage(projectValue, 1)).toBeUndefined();
    expect(templateDocumentForPage(projectValue, 2)).toBeUndefined();
    expect(templateDocumentForPage(projectValue, 3)?.id).toBe(first.id);
    expect(templateDocumentForPage(projectValue, 4)?.id).toBe(second.id);
  });

  it("keeps blank pages empty and out of the sheet numbering", () => {
    const projectValue = project();
    const blank = createTemplateDocument(BLANK_TEMPLATE_ID, "A2", "Blank A2");
    prefillSheetFields(projectValue, blank, 1);
    projectValue.documents.push(blank);
    const sheet = createTemplateDocument("gridscalr.operation-card.frame", "A3", "Sheet");
    projectValue.documents.push(sheet);

    expect(isBlankSheet(blank)).toBe(true);
    expect(isBlankSheet(sheet)).toBe(false);
    expect(blank.template!.fields).toEqual({});
    expect(templateSheetCount(projectValue)).toBe(1);
  });
});
