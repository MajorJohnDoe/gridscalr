import { createWorker, type Worker } from "tesseract.js";
import { localPageNumber, projectDocumentForPage } from "../model/documents";
import type { OcrPage, OcrWord, Project } from "../model/types";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import type { PageText } from "./textIndex";

const OCR_LANGUAGES = ["eng", "swe"];
const OCR_LANGUAGE_LABEL = OCR_LANGUAGES.join("+");
const OCR_DPI = 300;
const MAX_WORDS = 20_000;

let workerPromise: Promise<Worker> | null = null;
let activeProgress: ((message: string, progress: number) => void) | null = null;

function assetUrl(path: string): string {
  return new URL(path, document.baseURI).href;
}

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(OCR_LANGUAGES, 1, {
      workerPath: assetUrl("tesseract/worker.min.js"),
      corePath: assetUrl("tesseract/tesseract-core-simd.wasm.js"),
      langPath: assetUrl("tessdata/"),
      gzip: true,
      workerBlobURL: false,
      logger: (message) => {
        activeProgress?.(message.status, message.progress);
      },
    }).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

function flattenWords(page: {
  blocks: Array<{
    paragraphs: Array<{
      lines: Array<{
        words: Array<{
          text: string;
          bbox: { x0: number; y0: number; x1: number; y1: number };
          confidence: number;
        }>;
      }>;
    }>;
  }> | null;
}): Array<{
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}> {
  const words: Array<{
    text: string;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    confidence: number;
  }> = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          if (word.text.trim()) words.push(word);
        }
      }
    }
  }
  return words;
}

/** Runs local OCR for one rendered page. The caller decides when to store it. */
export async function runOcrPage(
  project: Project,
  page: number,
  renderer: PdfRenderer,
  onProgress?: (message: string, progress: number) => void,
): Promise<OcrPage> {
  const document = projectDocumentForPage(project, page);
  if (!document) throw new Error("This page has no source document.");
  const size = await renderer.getPageSize(page);
  const rendered = await renderer.renderCrop(
    page,
    { x: 0, y: 0, width: size.width, height: size.height },
    OCR_DPI / 72,
  );
  activeProgress = onProgress ?? null;
  try {
    const worker = await getWorker();
    const result = await worker.recognize(rendered.canvas, {}, { blocks: true, text: true });
    const words: OcrWord[] = flattenWords(result.data)
      .slice(0, MAX_WORDS)
      .map((word) => ({
        text: word.text.trim().slice(0, 200),
        x: rendered.rect.x + word.bbox.x0 / rendered.renderScale,
        y: rendered.rect.y + word.bbox.y0 / rendered.renderScale,
        width: (word.bbox.x1 - word.bbox.x0) / rendered.renderScale,
        height: (word.bbox.y1 - word.bbox.y0) / rendered.renderScale,
        confidence: word.confidence,
      }))
      .filter((word) => word.text && word.width > 0 && word.height > 0);
    return {
      text: words.map((word) => word.text).join(" "),
      words,
      engine: "tesseract",
      languages: OCR_LANGUAGE_LABEL,
      generatedAt: new Date().toISOString(),
      documentSha256: document.sha256,
      sourcePage: localPageNumber(project.documents, page),
      width: size.width,
      height: size.height,
    };
  } finally {
    activeProgress = null;
  }
}

/** Converts stored OCR into the same page-text shape used by PDF search. */
export function ocrPageToText(ocr: OcrPage, page: number): PageText {
  const words: PageText["words"] = [];
  let text = "";
  for (const word of ocr.words) {
    const start = text.length ? text.length + 1 : 0;
    if (text) text += " ";
    text += word.text;
    words.push({
      text: word.text,
      start,
      end: text.length,
      rect: { x: word.x, y: word.y, width: word.width, height: word.height },
    });
  }
  return { page, text: text || ocr.text, words };
}

/** True when stored OCR still belongs to the page's current source revision. */
export function isOcrCurrent(project: Project, page: number, ocr: OcrPage | undefined): boolean {
  if (!ocr) return false;
  const document = projectDocumentForPage(project, page);
  if (!document) return false;
  return (
    ocr.documentSha256 === document.sha256 &&
    ocr.sourcePage === localPageNumber(project.documents, page)
  );
}

export async function disposeOcrWorker(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  activeProgress = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // The worker may already have failed to start.
  }
}
