import type { DrawingExportOptions } from "../model/export";
import type { Project } from "../model/types";
import type { PdfRenderer } from "./pdfRenderer";
import { t } from "../i18n";

/**
 * Builds the drawing PDF bytes for both File -> Export -> Drawing PDF and the
 * send-by-email flow, so visibility, locking, crop, label and legend rules can
 * never drift between the two.
 */
export async function buildDrawingPdfBytes(
  project: Project,
  renderer: PdfRenderer | null,
  options: DrawingExportOptions,
): Promise<Uint8Array> {
  if (!renderer) throw new Error(t("app.sourcePdfMissing"));
  const { exportProjectPdf } = await import("./pdfExport");
  return exportProjectPdf(project, renderer, options);
}

/** An encrypted source cannot be exported to a flattened drawing. */
export function isEncryptedExportError(error: unknown): boolean {
  return error instanceof Error && /encrypt/i.test(error.message);
}
