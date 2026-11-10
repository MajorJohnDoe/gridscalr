import type { PDFDocumentProxy } from "pdfjs-dist";
import { t } from "../i18n";
import type { DocumentRef } from "../model/types";
import { sha256Hex } from "../io/platform";
import { describeError } from "../io/platformError";
import { isTiff } from "../io/tiff";
import {
  loadPdfDocument,
  PasswordRequiredError,
  PdfPasswordError,
  renderPagePreview,
} from "../pdf/pdfRenderer";
import { PageThumbnailService } from "../pdf/thumbnails";
import { confirmDialog, messageDialog, passwordDialog } from "../ui/dialogs";
import { pageImportDialog } from "../ui/pageImportDialog";
import { toast } from "../ui/toast";
import { makeId } from "../model/calibration";

export interface ImportedDocument {
  documentRef: DocumentRef;
  pdfBytes: Uint8Array;
  dpiWarning: boolean;
}

/** Hash a drawing and warn instead of failing when the platform has no crypto. */
export async function hashBytes(bytes: Uint8Array): Promise<string> {
  try {
    return await sha256Hex(bytes);
  } catch (error) {
    toast(t("app.checksumFailed", { error: describeError(error) }), "warning");
    return "";
  }
}

/**
 * Applies the same checksum policy for a picked PDF and for a project that is
 * reopened from disk. TIF documents keep the hash of the original scan, so only
 * referenced PDFs are compared.
 */
export async function confirmChecksumMismatch(
  documentRef: DocumentRef,
  actualHash: string,
): Promise<boolean> {
  if (documentRef.kind !== "pdf" || !documentRef.sha256 || !actualHash) return true;
  if (documentRef.sha256 === actualHash) return true;
  return confirmDialog(
    t("app.checksumTitle"),
    t("app.checksumMessage", { name: documentRef.name }),
    t("app.openAnyway"),
    { danger: true },
  );
}

/**
 * Converts a TIF to PDF or wraps a PDF in a document reference. The caller still
 * chooses pages and installs the renderer.
 */
export async function createImportedDocument(
  bytes: Uint8Array,
  name: string,
  path: string | null,
): Promise<ImportedDocument | null> {
  if (isTiff(bytes)) {
    const tiffModule = await import("../io/tiffImport");
    let conversion;
    try {
      conversion = await tiffModule.tiffToPdf(bytes);
    } catch (error) {
      await messageDialog(t("app.couldNotImportTif"), describeError(error), "warning");
      return null;
    }
    return {
      documentRef: tiffModule.createTiffDocumentRef({
        name,
        path,
        sha256: await hashBytes(bytes),
        sizeBytes: bytes.byteLength,
        conversion,
      }),
      pdfBytes: conversion.bytes,
      dpiWarning: conversion.pages.some((page) => !page.dpiKnown),
    };
  }

  return {
    documentRef: {
      id: makeId("doc"),
      kind: "pdf",
      name,
      path,
      relativePath: null,
      sha256: await hashBytes(bytes),
      pageCount: 1,
      sizeBytes: bytes.byteLength,
      storage: "reference",
    },
    pdfBytes: bytes,
    dpiWarning: false,
  };
}

/**
 * Asks which pages of a picked PDF or TIF should join the project. Single-page
 * files skip the picker; previews come from a temporary service so they never
 * interfere with the project's cached Pages-panel thumbnails.
 */
export async function chooseImportPages(
  pdf: PDFDocumentProxy,
  name: string,
  afterPage: number | null,
  rendererBusy: () => boolean,
): Promise<number[] | null> {
  if (pdf.numPages <= 1) return [1];
  const previews = new PageThumbnailService(async (page) => {
    const proxy = await pdf.getPage(page);
    const canvas = await renderPagePreview(proxy, 144);
    return canvas.toDataURL("image/jpeg", 0.72);
  }, rendererBusy);
  try {
    return await pageImportDialog({
      fileName: name,
      pageCount: pdf.numPages,
      mode: afterPage === null ? "new" : "add",
      afterPage: afterPage ?? undefined,
      requestThumbnail: (page) => previews.request(page),
    });
  } finally {
    previews.destroy();
  }
}

/** Opens a PDF with at most three password attempts and a clear cancel path. */
export async function openDocument(
  bytes: Uint8Array,
  name: string,
): Promise<PDFDocumentProxy | null> {
  let password: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await loadPdfDocument(bytes, password);
    } catch (error) {
      if (error instanceof PasswordRequiredError) {
        const entered = await passwordDialog(name);
        if (entered === null) return null;
        password = entered;
        continue;
      }
      if (error instanceof PdfPasswordError) {
        toast(t("app.passwordRejected"), "error");
        const entered = await passwordDialog(name);
        if (entered === null) return null;
        password = entered;
        continue;
      }
      await messageDialog(t("app.couldNotOpenPdf"), describeError(error), "warning");
      return null;
    }
  }
  toast(t("app.tooManyPasswords"), "error");
  return null;
}
