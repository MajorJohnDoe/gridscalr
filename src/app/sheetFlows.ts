import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageSize, Project, SheetPaperSize, SheetTemplateRef } from "../model/types";
import { documentPageOrder, pageNumber, pageRecordById } from "../model/pages";
import { createProject } from "../model/layers";
import { normalizeProjectName } from "../model/projectName";
import { currentLocale, t } from "../i18n";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import type { PageThumbnailService } from "../pdf/thumbnails";
import { store } from "../state/store";
import { openDocument } from "./documentImport";
import { recordStructuralCheckpoint } from "../features/sessionRecovery";
import { describeError } from "../io/platformError";
import { logEvent } from "../features/diagnostics/log";
import { messageDialog } from "../ui/dialogs";
import { toast } from "../ui/toast";
import {
  DEFAULT_SHEET_TEMPLATE_ID,
  resolveSheetLabels,
  sheetTemplateFor,
  type SheetLabels,
} from "../features/schematics/model/sheetTemplate";
import { buildStaticSheetPdf } from "../features/schematics/render/sheetPdf";
import {
  createTemplateDocument,
  prefillSheetFields,
  templateSheetCount,
} from "../features/schematics/model/sheetDocument";
import {
  chooseProjectSource,
  type SheetSourceChoice,
} from "../features/schematics/ui/sheetSourceDialog";

export interface SheetFlowHost {
  renderer(): PdfRenderer | null;
  thumbnails(): PageThumbnailService | null;
  installDocuments(
    documents: PDFDocumentProxy[],
    project: Project,
    path: string | null,
    dirty: boolean,
  ): Promise<void>;
  enqueuePageSize(page: number): Promise<PageSize | undefined>;
  resetPageSize(page: number): void;
  fitPage(): void;
  invalidate(): void;
  openPdfFlow(): Promise<void>;
}

const sheetBytesCache = new Map<string, Promise<Uint8Array>>();

function sheetLabels(): SheetLabels {
  return resolveSheetLabels((key) => t(key));
}

export function sheetBytes(template: SheetTemplateRef): Promise<Uint8Array> {
  const key = `${template.id}:${template.version}:${template.paper}:${currentLocale()}`;
  const cached = sheetBytesCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const spec = sheetTemplateFor(template.id, template.paper, sheetLabels());
    if (spec) return buildStaticSheetPdf(spec);
    const fallback = sheetTemplateFor(DEFAULT_SHEET_TEMPLATE_ID, template.paper, sheetLabels());
    if (!fallback) throw new Error(t("sheet.template.unknown"));
    return buildStaticSheetPdf(fallback);
  })();
  sheetBytesCache.set(key, promise);
  promise.catch(() => sheetBytesCache.delete(key));
  return promise;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : describeError(error);
}

export async function createSheetProject(
  host: SheetFlowHost,
  choice: SheetSourceChoice,
): Promise<void> {
  const documentRef = createTemplateDocument(choice.templateId, choice.paper, choice.name);
  const project = createProject(documentRef);
  project.name = normalizeProjectName(choice.name, documentRef.name);
  prefillSheetFields(project, documentRef, 1);
  project.activeLayerId =
    project.layers.find((layer) => layer.kind === "draw")?.id ?? project.activeLayerId;
  if (!documentRef.template) return;
  const bytes = await sheetBytes(documentRef.template);
  const pdf = await openDocument(bytes, documentRef.name);
  if (!pdf) return;
  await host.installDocuments([pdf], project, null, false);
  toast(t("sheet.created", { name: project.name }), "success");
}

export async function addPageFlow(host: SheetFlowHost): Promise<void> {
  if (store.readOnly) return;
  if (!store.project) {
    await host.openPdfFlow();
    return;
  }
  try {
    const choice = await chooseProjectSource("add");
    if (!choice) return;
    if (choice.kind === "pdf") {
      await host.openPdfFlow();
      return;
    }
    if (choice.kind === "empty") return;
    await addSheetFlow(host, choice);
  } catch (error) {
    logEvent("error", `add page failed: ${errorMessage(error)}`);
    await messageDialog(t("sheet.addFailed"), errorMessage(error), "warning");
  }
}

export async function changeSheetPaper(
  host: SheetFlowHost,
  pageId: string,
  paper: SheetPaperSize,
): Promise<void> {
  if (store.readOnly) return;
  const project = store.project;
  const renderer = host.renderer();
  if (!project || !renderer) return;
  const record = pageRecordById(project, pageId);
  const sheet = project.documents.find((entry) => entry.id === record?.documentId);
  if (!sheet?.template || sheet.template.paper === paper || !record) return;
  const page = pageNumber(project, pageId);
  const index = project.documents.findIndex((entry) => entry.id === sheet.id);
  const next: SheetTemplateRef = {
    ...sheet.template,
    paper,
    fields: { ...sheet.template.fields },
  };
  const bytes = await sheetBytes(next);
  const proxy = await openDocument(bytes, sheet.name);
  if (!proxy) return;
  await recordStructuralCheckpoint(t("sessionRecovery.checkpoint.changePaper", { page, paper }));
  renderer.replaceDocument(index, proxy, [1]);
  host.thumbnails()?.clear();
  host.resetPageSize(page);
  await host.enqueuePageSize(page);
  host.fitPage();
  store.setTemplatePaper(pageId, paper);
  host.invalidate();
  toast(t("sheet.paperChanged", { paper }), "success");
}

export async function addSheetFlow(host: SheetFlowHost, choice: SheetSourceChoice): Promise<void> {
  if (store.readOnly) return;
  const project = store.project;
  const renderer = host.renderer();
  if (!project || !renderer) return;

  const startPage = project.pages.length + 1;
  const documentRef = createTemplateDocument(choice.templateId, choice.paper, choice.name);
  prefillSheetFields(project, documentRef, templateSheetCount(project) + 1);
  if (!documentRef.template) return;

  const bytes = await sheetBytes(documentRef.template);
  const pdf = await openDocument(bytes, documentRef.name);
  if (!pdf) return;

  await recordStructuralCheckpoint(
    t("sessionRecovery.checkpoint.addSheet", { name: documentRef.name }),
  );
  store.addDocument(documentRef);
  renderer.addDocument(pdf, [1]);
  renderer.setPageOrder(documentPageOrder(store.project ?? project));
  store.setPage(startPage);
  await host.enqueuePageSize(startPage);
  host.fitPage();
  host.invalidate();
  toast(t("sheet.added", { name: documentRef.name }), "success");
}
