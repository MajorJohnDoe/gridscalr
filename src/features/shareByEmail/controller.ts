import { bytesToBase64 } from "../../io/base64";
import { isTauri, saveBinaryFile } from "../../io/platform";
import { describeError } from "../../io/platformError";
import { sourceDocumentPaths } from "../../io/projectFile";
import { drawingPdfFileName, type DrawingExportOptions } from "../../model/export";
import type { Project } from "../../model/types";
import { buildDrawingPdfBytes, isEncryptedExportError } from "../../pdf/drawingExport";
import type { PdfRenderer } from "../../pdf/pdfRenderer";
import { store } from "../../state/store";
import { messageDialog } from "../../ui/dialogs";
import { toast } from "../../ui/toast";
import { t } from "../../i18n";
import { composeMail, revealExport } from "./ipc";
import {
  exceedsAttachmentWarning,
  mailBody,
  mailSubject,
  normalizeComposeOutcome,
  outcomeMessage,
  safeAttachmentName,
} from "./model";
import { largeAttachmentDialog, showOutcomeDialog } from "./ui";

export interface ShareByEmailHost {
  renderer: PdfRenderer | null;
  /** The shared drawing-export dialog, including its interactive crop step. */
  chooseDrawingExport(project: Project): Promise<DrawingExportOptions | null>;
}

const pdfFilter = (): { name: string; extensions: string[] }[] => [
  { name: t("export.pdfFilter"), extensions: ["pdf"] },
];

async function exportDrawingToDisk(project: Project, bytes: Uint8Array): Promise<void> {
  const path = await saveBinaryFile(
    bytes,
    drawingPdfFileName(project.name),
    pdfFilter(),
    "application/pdf",
    { forbiddenPaths: sourceDocumentPaths(project, store.projectPath) },
  );
  if (path) toast(t("shareByEmail.exportedToast"), "success");
}

/**
 * Runs the same drawing export as File -> Export -> Drawing PDF, then hands the
 * bytes to the local mail client. A large attachment is a warning with an
 * explicit disk-export alternative, never a silent refusal.
 */
export async function sendByEmailFlow(host: ShareByEmailHost): Promise<void> {
  if (!isTauri) {
    toast(t("shareByEmail.desktopOnly"), "warning");
    return;
  }
  const project = store.project;
  if (!project) return;
  if (!project.pages.length) {
    toast(t("export.noPages"), "warning");
    return;
  }
  try {
    const options = await host.chooseDrawingExport(project);
    if (!options) return;
    const bytes = await buildDrawingPdfBytes(project, host.renderer, options);
    if (exceedsAttachmentWarning(bytes.byteLength)) {
      const choice = await largeAttachmentDialog(bytes.byteLength);
      if (!choice) return;
      if (choice === "export") {
        await exportDrawingToDisk(project, bytes);
        return;
      }
    }
    const outcome = normalizeComposeOutcome(
      await composeMail({
        fileName: safeAttachmentName(project.name),
        pdfBase64: bytesToBase64(bytes),
        subject: mailSubject(project.name),
        body: mailBody(project.name),
      }),
    );
    if (!outcome) throw new Error(t("shareByEmail.invalidOutcome"));
    if (outcome.status === "draft") {
      toast(outcomeMessage(outcome).message, "success");
      return;
    }
    await showOutcomeDialog(outcome, revealExport);
  } catch (error) {
    if (isEncryptedExportError(error)) {
      await messageDialog(
        t("export.cannotExportTitle"),
        t("export.cannotExportEncrypted"),
        "warning",
      );
      return;
    }
    await messageDialog(t("shareByEmail.failedTitle"), describeError(error), "warning");
  }
}
