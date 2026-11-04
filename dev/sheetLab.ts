import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadLocale, translate } from "../src/i18n";
import {
  buildDrawingFrameTemplate,
  resolveSheetLabels,
  revisionFieldId,
  SHEET_FIELD,
  type PaperSize,
  type SheetLabels,
  type SheetTemplateSpec,
} from "../src/features/schematics/model/sheetTemplate";
import { buildSheetPdf, buildStaticSheetPdf } from "../src/features/schematics/render/sheetPdf";
import { loadPdfDocument } from "../src/pdf/pdfRenderer";

type LocaleId = "sv" | "en";
type ZoomChoice = "fit" | number;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

const canvas = element<HTMLCanvasElement>("sheet");
const stage = element<HTMLDivElement>("stage");
const viewport = element<HTMLElement>("viewport");
const fieldsLayer = element<HTMLDivElement>("fields");
const status = element<HTMLElement>("status");
const paperSelect = element<HTMLSelectElement>("paper");
const localeSelect = element<HTMLSelectElement>("locale");
const zoomSelect = element<HTMLSelectElement>("zoom");
const debugInput = element<HTMLInputElement>("debug");
const downloadPdfButton = element<HTMLButtonElement>("download-pdf");
const downloadPngButton = element<HTMLButtonElement>("download-png");
const resetButton = element<HTMLButtonElement>("reset");

const SAMPLE_VALUES: Record<string, string> = {
  [SHEET_FIELD.projectName]: "Projektnamn",
  [SHEET_FIELD.projectLogo]: "Logotyp",
  [SHEET_FIELD.details]: "System: VärmeSystem 56-01-01\nApparatskåp: Obj.nr-50-01-01-AS01",
  [SHEET_FIELD.handledBy]: "Företag AB",
  [SHEET_FIELD.card]: "56-01-01",
  [SHEET_FIELD.date]: "2026-11-04",
  [SHEET_FIELD.system]: "Värmesystem 56-01-01",
  [SHEET_FIELD.assignment]: "Obj.nr-50-01-01-AS01",
  [SHEET_FIELD.page]: "1 av 1",
  [revisionFieldId(1, "bet")]: "A",
  [revisionFieldId(1, "rev")]: "Grundhandling",
  [revisionFieldId(1, "date")]: "2026-11-04",
  [revisionFieldId(1, "sign")]: "XX",
};

let paper: PaperSize = "A3";
let locale: LocaleId = "sv";
let zoom: ZoomChoice = "fit";
let debug = false;
let values: Record<string, string> = { ...SAMPLE_VALUES };
let currentDocument: PDFDocumentProxy | null = null;
let activeRenderTask: { cancel(): void } | null = null;
let renderGeneration = 0;
let resizeTimer = 0;

function labels(): SheetLabels {
  return resolveSheetLabels((key) => translate(locale, key));
}

function currentTemplate(): SheetTemplateSpec {
  return buildDrawingFrameTemplate(paper, labels());
}

function fitScale(base: { width: number; height: number }): number {
  const availableWidth = Math.max(320, viewport.clientWidth - 48);
  const availableHeight = Math.max(320, window.innerHeight - 190);
  const scale = Math.min(availableWidth / base.width, availableHeight / base.height);
  return Math.min(1.5, Math.max(0.2, scale));
}

function renderFields(template: SheetTemplateSpec, scale: number): void {
  fieldsLayer.replaceChildren();
  fieldsLayer.classList.toggle("is-debug", debug);

  for (const spec of template.fields) {
    const multiline = (spec.maxLines ?? 1) > 1;
    const input: HTMLInputElement | HTMLTextAreaElement = multiline
      ? document.createElement("textarea")
      : document.createElement("input");
    if (input instanceof HTMLInputElement) input.type = "text";
    input.value = values[spec.id] ?? "";
    input.dataset.fieldId = spec.id;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.style.resize = "none";
    input.style.whiteSpace = "pre-wrap";

    const width = spec.rect.width * scale;
    const height = spec.rect.height * scale;
    input.style.left = `${spec.rect.x * scale}px`;
    input.style.top = `${spec.rect.y * scale}px`;
    input.style.width = `${width}px`;
    input.style.height = `${height}px`;
    input.style.fontSize = `${Math.max(3, spec.fontSize * scale)}px`;
    input.style.fontWeight = spec.bold ? "700" : "400";
    input.style.textAlign = spec.align;
    input.style.padding = `0 ${spec.padding * scale}px`;
    input.style.lineHeight = `${Math.max(1, height - 2)}px`;

    input.addEventListener("input", () => {
      values[spec.id] = input.value;
    });
    input.addEventListener("focus", () => input.select());
    input.addEventListener("keydown", (event) => {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key === "Enter" && !multiline) {
        keyEvent.preventDefault();
        input.blur();
      }
    });

    fieldsLayer.append(input);
  }
}

async function render(): Promise<void> {
  const generation = ++renderGeneration;
  activeRenderTask?.cancel();
  activeRenderTask = null;
  try {
    await loadLocale(locale);
    const template = currentTemplate();
    const bytes = await buildStaticSheetPdf(template);
    const documentProxy = await loadPdfDocument(bytes);

    if (generation !== renderGeneration) {
      await documentProxy.loadingTask.destroy();
      return;
    }

    const page = await documentProxy.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = zoom === "fit" ? fitScale(base) : zoom;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = base.width * scale;
    const cssHeight = base.height * scale;

    canvas.width = Math.max(1, Math.ceil(cssWidth * dpr));
    canvas.height = Math.max(1, Math.ceil(cssHeight * dpr));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    stage.style.width = `${cssWidth}px`;
    stage.style.height = `${cssHeight}px`;

    const renderViewport = page.getViewport({ scale: scale * dpr });
    const renderTask = page.render({
      canvas,
      viewport: renderViewport,
      background: "#ffffff",
      intent: "display",
    });
    activeRenderTask = renderTask;
    try {
      await renderTask.promise;
    } finally {
      if (activeRenderTask === renderTask) activeRenderTask = null;
    }

    if (generation !== renderGeneration) {
      await documentProxy.loadingTask.destroy();
      return;
    }

    renderFields(template, scale);
    const previous = currentDocument;
    currentDocument = documentProxy;
    if (previous) await previous.loadingTask.destroy();
    status.textContent = `${paper} · ${template.fields.length} fields · ${Math.round(
      template.width,
    )} × ${Math.round(template.height)} pt · ${Math.round(scale * 100)} %`;
    status.dataset.state = "ready";
  } catch (error) {
    if ((error as { name?: string }).name === "RenderingCancelledException") return;
    console.error("sheet lab render failed", error);
    status.textContent = "";
    status.dataset.state = "error";
  }
}

function download(data: Uint8Array | Blob, name: string, type: string): void {
  const blob = data instanceof Blob ? data : new Blob([new Uint8Array(data)], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadPdf(): Promise<void> {
  const template = currentTemplate();
  const bytes = await buildSheetPdf(template, values);
  download(bytes, `sheet-${paper}.pdf`, "application/pdf");
}

async function downloadPng(): Promise<void> {
  const template = currentTemplate();
  const bytes = await buildSheetPdf(template, values);
  const documentProxy = await loadPdfDocument(bytes);
  try {
    const page = await documentProxy.getPage(1);
    const renderViewport = page.getViewport({ scale: 2 });
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.ceil(renderViewport.width));
    output.height = Math.max(1, Math.ceil(renderViewport.height));
    await page.render({
      canvas: output,
      viewport: renderViewport,
      background: "#ffffff",
      intent: "display",
    }).promise;
    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/png"));
    if (blob) download(blob, `sheet-${paper}.png`, "image/png");
  } finally {
    await documentProxy.loadingTask.destroy();
  }
}

function reset(): void {
  values = { ...SAMPLE_VALUES };
  void render();
}

paperSelect.addEventListener("change", () => {
  paper = paperSelect.value === "A2" ? "A2" : "A3";
  void render();
});

localeSelect.addEventListener("change", () => {
  locale = localeSelect.value === "en" ? "en" : "sv";
  void render();
});

zoomSelect.addEventListener("change", () => {
  const parsed = Number(zoomSelect.value);
  zoom = Number.isFinite(parsed) && parsed > 0 ? parsed : "fit";
  void render();
});

debugInput.addEventListener("change", () => {
  debug = debugInput.checked;
  fieldsLayer.classList.toggle("is-debug", debug);
});

downloadPdfButton.addEventListener("click", () => {
  void downloadPdf();
});

downloadPngButton.addEventListener("click", () => {
  void downloadPng();
});

resetButton.addEventListener("click", reset);

window.addEventListener("resize", () => {
  if (zoom !== "fit") return;
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    void render();
  }, 150);
});

window.addEventListener("beforeunload", () => {
  void currentDocument?.loadingTask.destroy();
});

void render();
